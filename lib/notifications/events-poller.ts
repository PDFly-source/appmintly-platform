/**
 * Stage 1 (no FCM) — PWA release-events poller.
 *
 * Polls the AppMintly Worker's public event log while the PWA is open,
 * recovers all missed events after a reconnect or long offline period via
 * the `since` checkpoint, and deduplicates at version level so a given app
 * version is surfaced at most once — the PWA twin of the native on-open
 * catch-up in lib/apk-builder.ts (same "app-update:" dedup namespace).
 *
 * No FCM, no push provider, no WebSocket: delivery while closed remains a
 * documented limitation (next open recovers everything).
 */
export interface ReleaseEvent {
  eventId?: string;
  appId: string;
  platform: string;
  version: string;
  name?: string;
  catalogRevision?: string;
  ts: number;
}
export interface EventsPollState {
  /** Cursor persisted by the caller (e.g. localStorage): max ts of processed events. */
  checkpoint: number | null;
  /** Version-level dedup keys already surfaced to the user. */
  seen: Set<string>;
}
export const DEFAULT_EVENTS_URL = 'https://appmintly-publisher-api.sbn50088.workers.dev/events';

export function eventDedupKey(e: Pick<ReleaseEvent, 'appId' | 'version'>): string {
  return 'app-update:' + e.appId + ':' + e.version;
}

function isReleaseEvent(e: unknown): e is ReleaseEvent {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return typeof r.appId === 'string' && typeof r.platform === 'string' &&
    typeof r.version === 'string' && typeof r.ts === 'number' && Number.isInteger(r.ts) && r.ts >= 0;
}

/**
 * Fetch events newer than the checkpoint. Throws on HTTP/network errors;
 * the caller retries later. The checkpoint only ever advances by validated
 * event timestamps, so a failed or crashed poll can never skip events —
 * the next successful poll re-fetches the same window and dedup filters
 * anything already surfaced.
 */
export async function pollReleaseEvents(
  state: EventsPollState,
  opts: { url?: string; fetchImpl?: typeof fetch } = {},
): Promise<ReleaseEvent[]> {
  const url = (opts.url ?? DEFAULT_EVENTS_URL) + '?since=' + Math.max(0, Math.floor(state.checkpoint ?? 0));
  const res = await (opts.fetchImpl ?? fetch)(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error('events poll failed: HTTP ' + res.status);
  const data = await res.json();
  const all: unknown[] = Array.isArray(data?.events) ? data.events : [];
  const fresh: ReleaseEvent[] = [];
  for (const e of all) {
    if (!isReleaseEvent(e)) continue; // malformed entry: skip, never crash the poller
    if (state.checkpoint === null || e.ts > state.checkpoint) state.checkpoint = e.ts;
    const key = eventDedupKey(e);
    if (state.seen.has(key)) continue; // already surfaced this version
    state.seen.add(key);
    fresh.push(e);
  }
  return fresh;
}


/* ---------------------------------------------------------------------------
 * Persistence + lifecycle (PWA integration layer)
 * ------------------------------------------------------------------------- */
export interface PersistedEventsPollState {
  v: 1;
  checkpoint: number | null;
  seen: string[];
}

/** localStorage key — per-origin, same isolation rules as the catalog state. */
export const EVENTS_POLL_STATE_KEY = 'appmintly_events_poll_v1';

export function loadEventsPollState(storage: Pick<Storage, 'getItem'>): EventsPollState {
  try {
    const raw = storage.getItem(EVENTS_POLL_STATE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PersistedEventsPollState;
      if (p && p.v === 1 && (p.checkpoint === null ||
          (typeof p.checkpoint === 'number' && p.checkpoint >= 0)) && Array.isArray(p.seen)) {
        return { checkpoint: p.checkpoint, seen: new Set(p.seen.filter((k) => typeof k === 'string')) };
      }
    }
  } catch {
    /* corrupted or unavailable storage: fall back to a fresh state; the
       dedup layer above still prevents duplicate notifications. */
  }
  return { checkpoint: null, seen: new Set<string>() };
}

export function saveEventsPollState(storage: Pick<Storage, 'setItem'>, state: EventsPollState): void {
  try {
    const persisted: PersistedEventsPollState = {
      v: 1,
      checkpoint: state.checkpoint,
      seen: [...state.seen].slice(-500),
    };
    storage.setItem(EVENTS_POLL_STATE_KEY, JSON.stringify(persisted));
  } catch {
    /* storage full/blocked: polling continues in-memory; the checkpoint is
       only an optimization — re-delivered events are still deduplicated. */
  }
}

export interface EventsPollController {
  start(): void;
  stop(): void;
  pollNow(): Promise<void>;
}

/**
 * While-open lifecycle controller for the PWA. start() performs an
 * immediate poll and then polls every intervalMs; stop() halts cleanly.
 * Failures are swallowed to onError and retried on the next tick — the
 * checkpoint is persisted ONLY after a successful poll, so a crash mid-poll
 * loses nothing (the next poll re-fetches the same window and dedups).
 * gate() lets the caller suppress ticks (e.g. document hidden).
 */
export function createEventsPollController(opts: {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  url?: string;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  gate?: () => boolean;
  onEvents: (events: ReleaseEvent[]) => void;
  onError?: (err: unknown) => void;
  timers?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval };
}): EventsPollController {
  const state: EventsPollState = opts.storage ? loadEventsPollState(opts.storage) : { checkpoint: null, seen: new Set<string>() };
  const si = opts.timers?.setInterval ?? setInterval;
  const ci = opts.timers?.clearInterval ?? clearInterval;
  let handle: ReturnType<typeof setInterval> | null = null;
  let running = false;
  const tick = async () => {
    if (running) return; // never overlap polls
    if (opts.gate && !opts.gate()) return;
    running = true;
    try {
      const events = await pollReleaseEvents(state, { url: opts.url, fetchImpl: opts.fetchImpl });
      if (opts.storage) saveEventsPollState(opts.storage, state);
      if (events.length > 0) opts.onEvents(events);
    } catch (err) {
      opts.onError?.(err);
    } finally {
      running = false;
    }
  };
  return {
    start() {
      if (handle !== null) return;
      void tick(); // immediate catch-up on open (missed events first)
      handle = si(() => { void tick(); }, opts.intervalMs ?? 60_000);
    },
    stop() {
      if (handle !== null) {
        ci(handle);
        handle = null;
      }
    },
    async pollNow() {
      await tick();
    },
  };
}
