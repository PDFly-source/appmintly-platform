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
