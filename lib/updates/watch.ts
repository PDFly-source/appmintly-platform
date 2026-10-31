'use client';

/**
 * Item 6 — update notification preferences for the Update Center.
 *
 * What this is: a browser-local WATCH LIST of apps the reader wants to follow,
 * plus a mirror of the existing notification switch so the UI never implies a
 * subscription that does not exist.
 *
 * What this is NOT: a server subscription. AppMintly has no account system and
 * the catalog is read-only, so nothing is sent anywhere. The honest statement
 * shown in the UI is "watched in this browser"; update detection still depends
 * on the reader opening AppMintly, exactly like the existing notification
 * engine's six-hour catalog check.
 *
 * Storage is localStorage with the same defensive parsing as the rest of the
 * app: malformed, unknown or duplicate ids are dropped, never crashed on.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { loadNotificationState } from '@/lib/notifications/store';

export const WATCH_KEY = 'appmintly_update_watch_v1';
const WATCH_EVENT = 'appmintly_update_watch_updated';
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export function sanitizeWatched(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!ID_PATTERN.test(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export function parseWatchList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return sanitizeWatched(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { watched?: unknown }).watched)) {
      return sanitizeWatched((parsed as { watched: unknown[] }).watched);
    }
    return [];
  } catch {
    return [];
  }
}

function readRaw(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(WATCH_KEY);
  } catch {
    return null;
  }
}

export function loadWatchList(): string[] {
  return parseWatchList(readRaw());
}

function write(list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WATCH_KEY, JSON.stringify({ v: 1, watched: list }));
    window.dispatchEvent(new Event(WATCH_EVENT));
  } catch {
    /* private mode / quota: the UI stays usable, nothing is claimed saved */
  }
}

export function toggleWatch(appId: string): string[] {
  const id = (appId || '').trim();
  if (!ID_PATTERN.test(id)) return loadWatchList();
  const current = loadWatchList();
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  write(next);
  return next;
}

export function isWatched(appId: string): boolean {
  return loadWatchList().includes(appId);
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(WATCH_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(WATCH_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** Live watch list with a server snapshot of [] so hydration is never wrong. */
export function useWatchList(): { watched: string[]; toggle: (appId: string) => void } {
  const watched = useSyncExternalStore(
    subscribe,
    () => readRaw(),
    () => null
  );
  const list = parseWatchList(watched);
  const toggle = useCallback((appId: string) => {
    toggleWatch(appId);
  }, []);
  return { watched: list, toggle };
}

/**
 * The existing notification master switch, read-only. The Update Center links
 * to /notifications to change it rather than duplicating the preference UI.
 */
export function notificationsEnabled(): boolean {
  try {
    const state = loadNotificationState();
    return Boolean(state?.prefs?.master && state?.prefs?.updates);
  } catch {
    return false;
  }
}
