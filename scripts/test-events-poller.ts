/**
 * Stage 1 tests for lib/notifications/events-poller.ts (PWA no-FCM poller).
 * Pure logic tests with a mocked fetch: checkpoint semantics, offline
 * recovery, version-level dedup, malformed-entry tolerance, no-FCM source
 * assertions.
 */
import { readFileSync } from 'node:fs';
import { pollReleaseEvents, eventDedupKey, DEFAULT_EVENTS_URL, type EventsPollState } from '../lib/notifications/events-poller';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + ' :: ' + extra); }
};
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const mkRes = (events: unknown[], status = 200): Res => ({ ok: status < 400, status, json: async () => ({ serverTime: Date.now(), events }) });
const ev = (appId: string, version: string, ts: number) => ({ eventId: 'x' + ts, appId, platform: 'android', version, ts });

async function main() {
// 1. initial poll: since=0, returns events, checkpoint = max ts
let state: EventsPollState = { checkpoint: null, seen: new Set<string>() };
let calls: number[] = [];
let queue: Res[] = [mkRes([ev('a', '1.0.0', 100), ev('b', '1.0.0', 200)])];
const f1 = (async (u: any) => { calls.push(Number(new URL(u).searchParams.get('since'))); return queue.shift() ?? mkRes([]); }) as unknown as typeof fetch;
let out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('initial poll returns both events', out.length === 2 && out[0].appId === 'a' && out[1].appId === 'b', JSON.stringify(out));
check('checkpoint advances to max ts', state.checkpoint === 200, String(state.checkpoint));
check('initial since param is 0 when checkpoint null', calls[0] === 0, String(calls[0]));

// 2. incremental poll: only newer events
queue = [mkRes([ev('c', '2.0.0', 300)])];
out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('incremental poll returns only new event', out.length === 1 && out[0].appId === 'c');
check('since param reflects checkpoint', calls[1] === 200, String(calls[1]));

// 3. duplicate re-delivery (same version served again) is suppressed
state = { checkpoint: null, seen: new Set<string>() };
queue = [mkRes([ev('a', '1.0.0', 100)])];
await pollReleaseEvents(state, { fetchImpl: f1 });
queue = [mkRes([ev('a', '1.0.0', 100)])];
out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('duplicate event re-delivery suppressed', out.length === 0, JSON.stringify(out));
check('same version with new ts is still deduped (version-level key)', state.checkpoint === 100 && state.seen.size === 1);

// 4. same app, different version -> delivered (upgrade)
queue = [mkRes([ev('a', '1.1.0', 150)])];
out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('new version delivered after old one', out.length === 1 && out[0].version === '1.1.0');

// 5. offline: fetch throws -> poll rejects, checkpoint unchanged; recovery returns everything missed once
state = { checkpoint: 100, seen: new Set<string>() };
queue = [];
const offlineFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
let threw = false;
try { await pollReleaseEvents(state, { fetchImpl: offlineFetch }); } catch { threw = true; }
check('offline poll throws (caller retries)', threw);
check('checkpoint unchanged after offline failure', state.checkpoint === 100);
queue = [mkRes([ev('d', '1.0.0', 150), ev('e', '1.0.0', 250)])];
out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('offline recovery: missed events delivered after reconnect', out.length === 2, JSON.stringify(out));
check('recovery poll used persisted checkpoint', calls[calls.length - 1] === 100, String(calls[calls.length - 1]));

// 6. out-of-order: older event after newer -> checkpoint never regresses
state = { checkpoint: 500, seen: new Set<string>() };
queue = [mkRes([ev('f', '1.0.0', 300)])];
out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('older out-of-order event still surfaced once', out.length === 1);
check('checkpoint never regresses below max seen', state.checkpoint === 500, String(state.checkpoint));

// 7. malformed entries skipped without crashing
state = { checkpoint: null, seen: new Set<string>() };
queue = [mkRes([null, 'garbage', { appId: 'g' }, ev('g', '1.0.0', 100)])];
out = await pollReleaseEvents(state, { fetchImpl: f1 });
check('malformed entries skipped, valid one delivered', out.length === 1 && out[0].appId === 'g');

// 8. HTTP error -> throws (fail loud, retry later)
queue = [];
const errRes = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
threw = false;
try { await pollReleaseEvents(state, { fetchImpl: errRes }); } catch { threw = true; }
check('HTTP 503 poll throws', threw);

// 9. dedup key mirrors the shared native/engine namespace
check('dedup key uses shared app-update namespace', eventDedupKey({ appId: 'a', version: '1.0.0' }) === 'app-update:a:1.0.0');
check('default URL is the production Worker event log', DEFAULT_EVENTS_URL === 'https://appmintly-publisher-api.sbn50088.workers.dev/events');

// 10. no-FCM source assertion (comments stripped, code only)
const src = readFileSync(new URL('../lib/notifications/events-poller.ts', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
check('no FCM/push/WebSocket in poller code', !/firebase|FCM|pushManager|WebSocket|serviceWorker\.register/.test(code));

console.log('SUMMARY test-events-poller: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
}
main();
