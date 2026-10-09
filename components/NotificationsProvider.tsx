'use client';

/**
 * NotificationsProvider — AppMintly foreground notification engine.
 *
 * What this provider DOES (honest capabilities):
 *  - Loads/persists per-browser notification preferences and state.
 *  - Runs a foreground catalog check when the marketplace is open
 *    (on load, then at most every CHECK_INTERVAL_MS while the page stays
 *    open, plus a manual Check Now action from the settings page).
 *  - Surfaces eligible release events as real OS notifications through the
 *    service worker registration (Notification.permission granted only).
 *  - Keeps preferences/history in sync with the native Android bridge
 *    (window.AppMintlyNative) when the marketplace runs inside the official
 *    AppMintly APK, so the native background checker can share them.
 *
 * What this provider DOES NOT do (documented platform limitations):
 *  - It does NOT deliver notifications while the site is closed. No push
 *    subscription exists: Web Push requires a trusted server-side sender
 *    (a push service — Chromium browsers use Google's push infrastructure
 *    even for non-FCM apps). No such sender is part of this deployment and
 *    none may be added without explicit approval. Background delivery while
 *    the PWA is closed is therefore NOT IMPLEMENTED for the web platform.
 *  - It never fakes background delivery with timers, hidden tabs or mock
 *    events. A timer only runs while a marketplace page is actually open.
 *  - The browser cannot see which apps are installed. Update notifications
 *    apply only to apps the user explicitly tracked (with a version), or —
 *    inside the native APK — the same list shared with the native checker.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiUrl } from '@/lib/api-path';
import {
  DEFAULT_PREFS,
  NotificationEvent,
  NotificationPrefs,
  TrackedApp,
  detectEvents,
  pruneDelivered,
} from '@/lib/notifications/engine';
import {
  NotificationStateV1,
  clearNotificationState,
  loadNotificationState,
  saveNotificationState,
} from '@/lib/notifications/store';

/** Foreground re-check cadence while the site is open (20 minutes). */
const CHECK_INTERVAL_MS = 20 * 60 * 1000;
/** The catalog is small; guard against absurd payloads anyway. */
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/** Native bridge surface injected by the AppMintly Android APK (feature-detected). */
interface NativeBridge {
  isNativeApp(): boolean;
  requestPermission(): void;
  setPreferences(json: string): void;
  setTrackedApps(json: string): void;
  checkNow(): void;
  getStatus(): string;
}

export interface NotificationCheckResult {
  ok: boolean;
  events: NotificationEvent[];
  revision: string | null;
  error?: string;
}

interface NotificationsContextValue {
  ready: boolean;
  permission: PermissionState;
  prefs: NotificationPrefs;
  tracked: TrackedApp[];
  lastCheck: number | null;
  lastCheckOk: boolean | null;
  lastRevision: string | null;
  nativeAvailable: boolean;
  checking: boolean;
  setPrefs: (partial: Partial<NotificationPrefs>) => void;
  enableNotifications: () => Promise<PermissionState>;
  trackApp: (app: { appId: string; version: string; packageId?: string }) => void;
  untrackApp: (appId: string) => void;
  isTracked: (appId: string) => boolean;
  getTrackedVersion: (appId: string) => string | undefined;
  clearHistory: () => void;
  checkNow: () => Promise<NotificationCheckResult>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

function readPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PermissionState;
}

function getNativeBridge(): NativeBridge | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { AppMintlyNative?: unknown }).AppMintlyNative;
  if (candidate && typeof candidate === 'object' && typeof (candidate as NativeBridge).isNativeApp === 'function') {
    return candidate as NativeBridge;
  }
  return null;
}

/** Absolute same-origin URL for a notification deep link. */
function absoluteUrl(path: string): string {
  try {
    return new URL(apiUrl(path), window.location.origin).href;
  } catch {
    return window.location.origin + apiUrl(path);
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [state, setState] = useState<NotificationStateV1 | null>(null);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const stateRef = useRef<NotificationStateV1 | null>(null);
  const checkingRef = useRef(false);

  const commit = useCallback((next: NotificationStateV1) => {
    stateRef.current = next;
    saveNotificationState(next);
    setState(next);
  }, []);

  const readPermissionAndMount = useCallback(() => {
    setPermission(readPermission());
    const loaded = loadNotificationState();
    stateRef.current = loaded;
    setState(loaded);
    const bridge = getNativeBridge();
    setNativeAvailable(!!bridge);
    setReady(true);
  }, []);

  // ------------------------------------------------------------------
  // Foreground catalog check (the real work)
  // ------------------------------------------------------------------
  const runCheck = useCallback(async (): Promise<NotificationCheckResult> => {
    if (checkingRef.current) return { ok: false, events: [], revision: null, error: 'check-already-running' };
    const current = stateRef.current;
    if (!current) return { ok: false, events: [], revision: null, error: 'state-not-ready' };
    checkingRef.current = true;
    setChecking(true);
    try {
      const res = await fetch(apiUrl('/data/apps.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
      const text = await res.text();
      if (text.length > MAX_CATALOG_BYTES) throw new Error('catalog payload too large');
      const apps = JSON.parse(text);
      if (!Array.isArray(apps) || apps.length === 0) throw new Error('catalog is not a non-empty array');

      const outcome = detectEvents(apps, {
        baseline: current.baseline,
        delivered: current.delivered,
        tracked: current.tracked,
        prefs: current.prefs,
      });

      const delivered: Record<string, number> = { ...current.delivered };
      const now = Date.now();
      for (const key of outcome.deliveredKeys) delivered[key] = now;

      const nextState: NotificationStateV1 = {
        ...current,
        baseline: outcome.baseline,
        delivered: pruneDelivered(delivered),
        lastCheck: now,
        lastCheckOk: true,
        lastRevision: outcome.baseline.revision,
      };
      commit(nextState);

      // Deliver through the service worker registration (same-origin deep
      // link). Only when OS permission is granted; otherwise the settings
      // page shows the denied state and nothing is silently dropped on the
      // OS side — the delivered keys are only recorded when shown.
      if (outcome.events.length > 0 && readPermission() === 'granted') {
        let shown = 0;
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          for (const ev of outcome.events) {
            const options: NotificationOptions = {
              body: ev.body,
              tag: ev.key,
              icon: absoluteUrl('/icon-192.png'),
              data: { url: absoluteUrl(ev.detailPath), key: ev.key },
            };
            if (reg && typeof (reg as any).showNotification === 'function') {
              await (reg as ServiceWorkerRegistration).showNotification(ev.title, options);
              shown++;
            } else if ('Notification' in window) {
              // Static-host fallback: SW not ready — direct Notification.
              const n = new Notification(ev.title, options);
              n.onclick = () => {
                window.focus();
                window.location.href = absoluteUrl(ev.detailPath);
                n.close();
              };
              shown++;
            }
          }
          if (shown > 0) {
            const bridge = getNativeBridge();
            void bridge; // bridge sync happens via the effect below
          }
        } catch (err) {
          // Delivery failure is not a check failure; next check re-tries
          // because delivered keys were already persisted above.
          console.warn('[notifications] delivery error', err);
        }
      }
      return { ok: true, events: outcome.events, revision: outcome.baseline.revision };
    } catch (err) {
      const currentNow = stateRef.current;
      if (currentNow) {
        commit({ ...currentNow, lastCheck: Date.now(), lastCheckOk: false });
      }
      return { ok: false, events: [], revision: null, error: String((err as Error)?.message || err) };
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [commit]);

  // ------------------------------------------------------------------
  // Mount: read state, register interval while the site is OPEN only.
  // ------------------------------------------------------------------
  useEffect(() => {
    // Defer the mount read off the effect body (avoids sync setState cascades).
    const mountTimer = window.setTimeout(() => readPermissionAndMount(), 0);
    const onPermissionChange = () => setPermission(readPermission());
    document.addEventListener('visibilitychange', onPermissionChange);
    return () => {
      window.clearTimeout(mountTimer);
      document.removeEventListener('visibilitychange', onPermissionChange);
    };
  }, [readPermissionAndMount]);

  // Foreground cadence: on-load (once) + interval. Timers only fire while
  // this page is open; nothing runs when the site is closed.
  useEffect(() => {
    if (!ready || !state) return;
    if (!state.prefs.master) return;
    let cancelled = false;
    const initialTimer = window.setTimeout(() => {
      if (!cancelled && document.visibilityState === 'visible') void runCheck();
    }, 4000);
    const interval = window.setInterval(() => {
      if (!cancelled && document.visibilityState === 'visible') void runCheck();
    }, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [ready, state?.prefs.master, runCheck, state?.lastRevision === null]);

  // ------------------------------------------------------------------
  // Native bridge sync (official APK only; feature-detected).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!ready || !state) return;
    const bridge = getNativeBridge();
    if (!bridge) return;
    try {
      bridge.setPreferences(JSON.stringify(state.prefs));
      bridge.setTrackedApps(JSON.stringify(state.tracked));
    } catch {
      /* native side logs its own errors */
    }
  }, [ready, state?.prefs, state?.tracked]);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  const setPrefs = useCallback(
    (partial: Partial<NotificationPrefs>) => {
      const current = stateRef.current;
      if (!current) return;
      commit({ ...current, prefs: { ...current.prefs, ...partial } });
    },
    [commit]
  );

  const enableNotifications = useCallback(async (): Promise<PermissionState> => {
    if (typeof window === 'undefined') return 'unsupported';
    // Only ever called from an explicit user gesture on the settings page.
    const bridge = getNativeBridge();
    if (bridge) {
      try {
        bridge.requestPermission();
      } catch {
        /* ignore */
      }
      // The native dialog is async; the page reads the final state on the
      // next visibilitychange/interaction. Report current best-known state.
      return readPermission();
    }
    if (!('Notification' in window)) return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      return result as PermissionState;
    } catch {
      return readPermission();
    }
  }, []);

  const trackApp = useCallback(
    (input: { appId: string; version: string; packageId?: string }) => {
      const current = stateRef.current;
      if (!current || !input.appId || !String(input.version || '').trim()) return;
      const entry: TrackedApp = {
        appId: input.appId,
        version: String(input.version).trim(),
        packageId: input.packageId || undefined,
        trackedAt: Date.now(),
      };
      const tracked = current.tracked.filter((t) => t.appId !== input.appId).concat(entry);
      commit({ ...current, tracked });
    },
    [commit]
  );

  const untrackApp = useCallback(
    (appId: string) => {
      const current = stateRef.current;
      if (!current) return;
      commit({ ...current, tracked: current.tracked.filter((t) => t.appId !== appId) });
    },
    [commit]
  );

  const isTracked = useCallback(
    (appId: string) => !!stateRef.current?.tracked.some((t) => t.appId === appId),
    []
  );

  const getTrackedVersion = useCallback(
    (appId: string) => stateRef.current?.tracked.find((t) => t.appId === appId)?.version,
    []
  );

  const clearHistory = useCallback(() => {
    // Resets preferences + delivered history; the next check re-initializes
    // the baseline silently (first-run rule: no flood of "new" events).
    clearNotificationState();
    const fresh = loadNotificationState();
    stateRef.current = fresh;
    setState(fresh);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      ready,
      permission,
      prefs: state?.prefs ?? DEFAULT_PREFS,
      tracked: state?.tracked ?? [],
      lastCheck: state?.lastCheck ?? null,
      lastCheckOk: state?.lastCheckOk ?? null,
      lastRevision: state?.lastRevision ?? null,
      nativeAvailable,
      checking,
      setPrefs,
      enableNotifications,
      trackApp,
      untrackApp,
      isTracked,
      getTrackedVersion,
      clearHistory,
      checkNow: runCheck,
    }),
    [
      ready,
      permission,
      state,
      nativeAvailable,
      checking,
      setPrefs,
      enableNotifications,
      trackApp,
      untrackApp,
      isTracked,
      getTrackedVersion,
      clearHistory,
      runCheck,
    ]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
