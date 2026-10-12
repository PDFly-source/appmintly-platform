/**
 * Stage 1 tests for lib/notifications/events-poller.ts (PWA no-FCM poller).
 * Pure logic tests with a mocked fetch: checkpoint semantics, offline
 * recovery, version-level dedup, malformed-entry tolerance, no-FCM source
 * assertions.
 */
import { readFileSync } from 'node:fs';
import {
  pollReleaseEvents, eventDedupKey, DEFAULT_EVENTS_URL, type EventsPollState, type ReleaseEvent,
  loadEventsPollState, saveEventsPollState, createEventsPollController,
} from '../lib/notifications/events-poller';

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


// 11. persistence roundtrip + corrupted storage fallback
const mem = new Map<string, string>();
const fakeStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
saveEventsPollState(fakeStorage, { checkpoint: 1234, seen: new Set(['app-update:a:1.0.0']) });
const loaded = loadEventsPollState(fakeStorage);
check('persisted poll state roundtrips', loaded.checkpoint === 1234 && loaded.seen.has('app-update:a:1.0.0'));
mem.set('appmintly_events_poll_v1', 'not-json');
check('corrupted storage loads fresh state', loadEventsPollState(fakeStorage).checkpoint === null);

// 12. controller lifecycle: immediate poll on start, stop halts, gate
// blocks, failures retry without losing the checkpoint, and a restart
// resumes from the persisted checkpoint with dedup across restarts.
type AnyObj = { ok: boolean; status: number; json: () => Promise<unknown> };
const mkRes2 = (events: unknown[]): AnyObj => ({ ok: true, status: 200, json: async () => ({ events }) });
const makeTimers = () => {
  const ticks: Array<() => void> = [];
  const timers = {
    setInterval: ((cb: () => void) => { ticks.push(cb); return ticks.length; }) as unknown as typeof setInterval,
    clearInterval: (() => {}) as unknown as typeof clearInterval,
  };
  return { timers, ticks };
};
const mkStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};
// session 1: start -> immediate poll delivers event, checkpoint persisted
const st2 = mkStore();
const t1 = makeTimers();
let got: ReleaseEvent[][] = [];
const c1 = createEventsPollController({
  storage: st2,
  fetchImpl: (async () => mkRes2([ev('h', '1.0.0', 900)])) as unknown as typeof fetch,
  onEvents: (e) => { got.push(e); },
  timers: t1.timers,
});
c1.start();
await new Promise((r) => setTimeout(r, 5));
check('controller.start polls immediately', got.length === 1 && got[0][0].appId === 'h');
check('checkpoint persisted after successful poll', loadEventsPollState(st2).checkpoint === 900);
c1.stop();
// session 2 (restart): re-delivered same version is suppressed via persisted seen
const got2: ReleaseEvent[][] = [];
const t2 = makeTimers();
const c2 = createEventsPollController({
  storage: st2,
  fetchImpl: (async (u: any) => {
    check('restart resumes from persisted checkpoint', new URL(u).searchParams.get('since') === '900', String(u));
    return mkRes2([ev('h', '1.0.0', 950)]);
  }) as unknown as typeof fetch,
  onEvents: (e) => { got2.push(e); },
  timers: t2.timers,
});
c2.start();
await new Promise((r) => setTimeout(r, 5));
check('re-delivered version after restart suppressed (no duplicate notification)', got2.length === 0, JSON.stringify(got2));
c2.stop();
// session 3: failed poll -> onError, nothing delivered; next tick retries and recovers
const t3 = makeTimers();
const st3 = mkStore();
const fails = [true, false];
const delivered3: ReleaseEvent[][] = [];
let errSeen = 0;
const c3 = createEventsPollController({
  storage: st3,
  fetchImpl: (async () => {
    if (fails.shift()) throw new Error('network down');
    return mkRes2([ev('i', '2.0.0', 800)]);
  }) as unknown as typeof fetch,
  onEvents: (e) => { delivered3.push(e); },
  onError: () => { errSeen++; },
  timers: t3.timers,
});
c3.start();
await new Promise((r) => setTimeout(r, 5));
check('failed poll: onError, no delivery, no crash', delivered3.length === 0 && errSeen === 1);
t3.ticks[0]();
await new Promise((r) => setTimeout(r, 5));
check('next tick retries and recovers after failure', delivered3.length === 1 && delivered3[0][0].appId === 'i');
// session 4: gate=false performs no fetch at all
let gated = 0;
const t4 = makeTimers();
const c4 = createEventsPollController({
  fetchImpl: (async () => { gated++; return mkRes2([]); }) as unknown as typeof fetch,
  gate: () => false,
  onEvents: () => {},
  timers: t4.timers,
});
c4.start();
t4.ticks[0]();
check('gate=false performs no fetch (hidden page does not poll)', gated === 0, String(gated));

console.log('SUMMARY test-events-poller: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
}
main();
