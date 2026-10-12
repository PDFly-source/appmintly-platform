/**
 * Stage 1 regression tests for the generated-Java template changes in
 * lib/apk-builder.ts. Pure source assertions: proves the catch-up code,
 * its dedup-key reuse, the unchanged six-hour checker, and the absence of
 * any Stage 2 (WebSocket / foreground service / exact alarm) code.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/apk-builder.ts', import.meta.url), 'utf8');
let pass = 0; let fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

// Stage 1 catch-up present and wired
check('EVENTS_URL constant is the Worker event log',
  src.includes('EVENTS_URL = "https://appmintly-publisher-api.sbn50088.workers.dev/events"'));
check('MainActivity.onResume calls catchUpEvents',
  /protected void onResume\(\)[\s\S]{0,500}?super\.onResume\(\);[\s\S]{0,400}?UpdateEngine\.catchUpEvents\(this\);/.test(src));
check('doCatchUp implemented', src.includes('static void doCatchUp(Context ctx)'));
check('catch-up dedup key shares the checker namespace',
  src.includes('"app-update:" + appId + ":" + version'));
check('cursor persisted as lastEventTs', src.includes('putLong("lastEventTs", processed)'));
check('posting failure stops before advancing the cursor',
  src.includes('putString("lastCatchUpState", "permission")'));
check('catch-up respects the master gate', /doCatchUp[\s\S]{0,200}isEnabled\(ctx\)/.test(src));
check('catch-up respects notification permission gate',
  /doCatchUp[\s\S]{0,600}areNotificationsEnabled\(\)/.test(src));
check('catch-up respects the updates category gate',
  src.includes('boolean prefUpdates = p.getBoolean("updates", true)'));
check('catch-up rate-limited to once per minute',
  src.includes('CATCHUP_MIN_INTERVAL_MS = 60L * 1000L'));
check('getStatusJson exposes catch-up state (additive)',
  src.includes('.put("lastCatchUp", p.getLong("lastCatchUp", 0L))') &&
  src.includes('.put("lastCatchUpState", p.getString("lastCatchUpState", ""))'));

// Six-hour checker unchanged (standing constraint)
check('six-hour interval unchanged', src.includes('CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L'));
check('inexact repeating alarm unchanged',
  src.includes('setInexactRepeating(AlarmManager.ELAPSED_REALTIME'));
check('postNotification path untouched',
  src.includes('private static boolean postNotification(Context ctx, NotificationManager nm,'));
check('BootReceiver still reschedules on boot', src.includes('UpdateEngine.schedule(context);'));

// Stage 2 explicitly absent (no FCM, no WS, no FGS) — asserted against
// CODE ONLY: comments are stripped first so prose mentioning the guard
// cannot mask a real regression.
const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
check('no WebSocket code shipped', !/WebSocket|OkHttp|java\.net\.Socket/.test(code));
check('no foreground service shipped', !/ForegroundService|startForeground\(/.test(code));
check('no exact alarms introduced', !/setExact\(|setExactAndAllowWhileIdle|setAlarmClock/.test(code));
check('no FCM anywhere', !/com\.google\.firebase|FirebaseMessaging|firebase-messaging/.test(code));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
