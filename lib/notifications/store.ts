/**
 * AppMintly notification state — per-browser localStorage persistence.
 *
 * Scope notes (honest limitations):
 *  - State is per-origin AND per-browser. The Cloudflare PWA
 *    (appmintly.pages.dev) and the GitHub Pages fallback
 *    (pdfly-source.github.io) have separate localStorage scopes; each keeps
 *    its own baseline/delivered history.
 *  - localStorage survives browser restarts but is NOT a server-side
 *    subscription database; clearing site data resets notification history.
 *    The engine's first-run re-initialization guarantees that this never
 *    floods the user with historical events.
 *  - Nothing here is synced to any external service. No analytics, no
 *    device identifiers, no account required.
 */
import {
  BaselineState,
  DEFAULT_PREFS,
  NotificationPrefs,
  TrackedApp,
  pruneDelivered,
} from './engine';

export interface NotificationStateV1 {
  v: 1;
  prefs: NotificationPrefs;
  baseline: BaselineState | null;
  delivered: Record<string, number>;
  tracked: TrackedApp[];
  lastCheck: number | null;
  lastCheckOk: boolean | null;
  lastRevision: string | null;
}

export const NOTIFICATION_STATE_KEY = 'appmintly_notifications_v1';

export const EMPTY_STATE: NotificationStateV1 = {
  v: 1,
  prefs: { ...DEFAULT_PREFS },
  baseline: null,
  delivered: {},
  tracked: [],
  lastCheck: null,
  lastCheckOk: null,
  lastRevision: null,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizePrefs(raw: unknown): NotificationPrefs {
  if (!isPlainObject(raw)) return { ...DEFAULT_PREFS };
  const b = (k: keyof NotificationPrefs, fb: boolean) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : fb);
  return {
    master: b('master', DEFAULT_PREFS.master),
    updates: b('updates', DEFAULT_PREFS.updates),
    newAndroid: b('newAndroid', DEFAULT_PREFS.newAndroid),
    newWeb: b('newWeb', DEFAULT_PREFS.newWeb),
    important: b('important', DEFAULT_PREFS.important),
    security: b('security', DEFAULT_PREFS.security),
  };
}

function sanitizeBaseline(raw: unknown): BaselineState | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.revision !== 'string' || !isPlainObject(raw.apps)) return null;
  const apps: BaselineState['apps'] = {};
  for (const [id, entry] of Object.entries(raw.apps as Record<string, unknown>)) {
    if (!isPlainObject(entry)) continue;
    if (typeof (entry as any).version !== 'string') continue;
    apps[id] = {
      version: (entry as any).version as string,
      isAndroid: Boolean((entry as any).isAndroid),
      publishedAt: typeof (entry as any).publishedAt === 'string' ? (entry as any).publishedAt : undefined,
      severity: (['normal', 'important', 'security', 'critical'] as const).includes((entry as any).severity)
        ? (entry as any).severity
        : 'normal',
    };
  }
  return { revision: raw.revision as string, apps };
}

function sanitizeDelivered(raw: unknown): Record<string, number> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return pruneDelivered(out);
}

function sanitizeTracked(raw: unknown): TrackedApp[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackedApp[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const appId = typeof item.appId === 'string' ? item.appId.trim() : '';
    const version = typeof item.version === 'string' ? item.version.trim() : '';
    if (!appId || !version) continue;
    out.push({
      appId,
      version,
      packageId: typeof item.packageId === 'string' ? item.packageId : undefined,
      trackedAt: typeof item.trackedAt === 'number' ? item.trackedAt : Date.now(),
    });
  }
  return out;
}

export function sanitizeState(raw: unknown): NotificationStateV1 {
  if (!isPlainObject(raw)) return { ...EMPTY_STATE, prefs: { ...DEFAULT_PREFS }, delivered: {}, tracked: [] };
  const prefs = sanitizePrefs(raw.prefs);
  // Legacy or corrupt state: never load a baseline that does not parse; the
  // engine then re-initializes silently (no historical event flood).
  const baseline = sanitizeBaseline(raw.baseline);
  return {
    v: 1,
    prefs,
    baseline,
    delivered: sanitizeDelivered(raw.delivered),
    tracked: sanitizeTracked(raw.tracked),
    lastCheck: typeof raw.lastCheck === 'number' && Number.isFinite(raw.lastCheck) ? raw.lastCheck : null,
    lastCheckOk: typeof raw.lastCheckOk === 'boolean' ? raw.lastCheckOk : null,
    lastRevision: typeof raw.lastRevision === 'string' ? raw.lastRevision : null,
  };
}

/** Load from localStorage (client only). Corrupt or partial data recovers safely. */
export function loadNotificationState(): NotificationStateV1 {
  if (typeof window === 'undefined') return { ...EMPTY_STATE, prefs: { ...DEFAULT_PREFS } };
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_STATE_KEY);
    if (!raw) return { ...EMPTY_STATE, prefs: { ...DEFAULT_PREFS } };
    return sanitizeState(JSON.parse(raw));
  } catch {
    return { ...EMPTY_STATE, prefs: { ...DEFAULT_PREFS } };
  }
}

/** Persist (client only). Best-effort: quota/full-storage errors are swallowed. */
export function saveNotificationState(state: NotificationStateV1): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearNotificationState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(NOTIFICATION_STATE_KEY);
  } catch {
    /* ignore */
  }
}
