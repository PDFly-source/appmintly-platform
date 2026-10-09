/**
 * [notification-engine] catalog-release event tests.
 * Run: npm exec --yes --package=tsx@4.20.5 -- tsx scripts/test-notification-engine.ts
 *
 * Exercises the REAL engine (lib/notifications/engine.ts) against release
 * scenarios from the spec: new android app, new web app, new version,
 * important/security/critical releases, draft apps, metadata-only edits,
 * duplicate deployments, invalid metadata, first-run baseline and
 * deduplication. Pure-logic tests; notification DELIVERY is covered
 * separately by browser verification.
 */
import {
  NotificationEvent,
  DEFAULT_PREFS,
  buildBaseline,
  compareVersions,
  computeCatalogRevision,
  detectEvents,
  detailPathFor,
  parseSeverity,
  pruneDelivered,
  recordShownKeys,
  describeCheck,
  releaseVersionOf,
  isPublishedRecord,
  type NotificationPrefs,
  type TrackedApp,
} from '../lib/notifications/engine';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
};

const app = (over: Record<string, any> = {}) => ({
  id: 'nexdrop',
  slug: 'nexdrop',
  name: 'NexDrop',
  type: 'Android APK',
  version: '1.4.4',
  status: 'published',
  published: true,
  publishedAt: '2026-10-08T00:00:00Z',
  apk: { enabled: true, packageId: 'com.nexdrop.ndt1', versionName: '1.4.4' },
  ...over,
});

const webapp = (over: Record<string, any> = {}) =>
  app({ id: 'studyria', slug: 'studyria', name: 'Studyria', type: 'Web App', version: '2.0.2', apk: undefined, ...over });

const catalog = (...apps: Record<string, any>[]) => apps as Record<string, any>[];

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({ ...DEFAULT_PREFS, master: true, ...over });
const tracked = (...t: TrackedApp[]) => t;
const trk = (appId: string, version: string): TrackedApp => ({ appId, version, trackedAt: Date.now() });

console.log('\n[notification-engine] version comparison & record basics');

ok('compareVersions 1.4.5 > 1.4.4', compareVersions('1.4.5', '1.4.4') > 0);
ok('compareVersions 1.10.0 > 1.9.0 (numeric, not lexicographic)', compareVersions('1.10.0', '1.9.0') > 0);
ok('compareVersions 1.4.4 == 1.4.4', compareVersions('1.4.4', '1.4.4') === 0);
ok('compareVersions 1.4 == 1.4.0 (missing segment)', compareVersions('1.4', '1.4.0') === 0);
ok('downgrade is negative: 1.4.3 < 1.4.4', compareVersions('1.4.3', '1.4.4') < 0);
ok('releaseVersionOf prefers apk.versionName', releaseVersionOf(app({ version: '1.0.0', apk: { versionName: '1.4.4' } })) === '1.4.4');
ok('releaseVersionOf falls back to top-level version', releaseVersionOf(app({ version: '2.0.0', apk: {} })) === '2.0.0');
ok('published record is publishable', isPublishedRecord(app()));
ok('draft record is NOT publishable', !isPublishedRecord(app({ status: 'draft', published: false })));
ok('unpublished record is NOT publishable', !isPublishedRecord(app({ published: false })));
ok('archived record is NOT publishable', !isPublishedRecord(app({ status: 'archived' })));
ok('demo record is NOT publishable', !isPublishedRecord(app({ isDemo: true })));
ok('record with no version is NOT publishable', !isPublishedRecord(app({ version: '', apk: null })));

console.log('\n[notification-engine] severity parsing (publisher-set field only)');
ok('explicit severity security parsed', parseSeverity('security') === 'security');
ok('severity is case-insensitive', parseSeverity('Critical') === 'critical');
ok('unknown severity falls back to normal', parseSeverity('ultra') === 'normal');
ok('missing severity is normal', parseSeverity(undefined) === 'normal');
ok('severity is NOT inferred from release-note text', parseSeverity((app({ releaseNotes: ['security fix!'] } as Record<string, any>) as Record<string, any>).releaseNotes) === 'normal');
ok('severity read from apk.releaseSeverity too', parseSeverity((app({ apk: { releaseSeverity: 'important' } } as Record<string, any>).apk as Record<string, any>)?.releaseSeverity) === 'important');

console.log('\n[notification-engine] catalog revision');
const rev1 = computeCatalogRevision(catalog(app(), webapp()));
const rev1again = computeCatalogRevision(catalog(webapp(), app())); // order-independent
ok('revision is order-independent', rev1 === rev1again);
ok(
  'metadata-only edit does NOT change revision',
  rev1 === computeCatalogRevision(catalog(app({ description: 'totally new copy', icon: 'x.png', tags: ['a', 'b'] } as Record<string, any>), webapp()))
);
ok(
  'new version DOES change revision',
  rev1 !== computeCatalogRevision(catalog(app({ version: '1.4.5', apk: { ...app().apk, versionName: '1.4.5' } }), webapp()))
);
ok('new app DOES change revision', rev1 !== computeCatalogRevision(catalog(app(), webapp(), app({ id: 'newapp', name: 'NewApp', version: '1.0.0', slug: 'newapp' }))));
ok('unpublished app does NOT change revision', rev1 === computeCatalogRevision(catalog(app(), webapp(), app({ id: 'drafty', name: 'Draft', version: '9.9.9', published: false, status: 'draft' }))));

console.log('\n[notification-engine] first-run baseline initialization');
{
  const out = detectEvents(catalog(app(), webapp()), { baseline: null, delivered: {}, tracked: [], prefs: prefs() });
  ok('first run emits ZERO events (no flood of "new" apps)', out.events.length === 0);
  ok('first run sets initializedBaseline', out.initializedBaseline === true);
  ok('first run still produces a baseline', Object.keys(out.baseline.apps).length === 2);
}

console.log('\n[notification-engine] feature A: update available for tracked/installed apps');
{
  const base = buildBaseline(catalog(app(), webapp()));
  const next = catalog(app({ version: '1.4.5', apk: { ...app().apk, versionName: '1.4.5' } }), webapp());
  const out = detectEvents(next, { baseline: base, delivered: {}, tracked: tracked(trk('nexdrop', '1.4.4')), prefs: prefs() });
  const ev = out.events[0];
  ok('update event produced for tracked app', out.events.length === 1 && ev.kind === 'app-update', JSON.stringify(out.events.map((e) => e.key)));
  ok('update event copy matches spec', ev.title === 'Update available: NexDrop' && ev.body === 'Version 1.4.5 is available. View the latest changes.');
  ok('dedup key is app-update:{id}:{version}', ev.key === 'app-update:nexdrop:1.4.5');
  ok('detail path built from slug', ev.detailPath === '/app/nexdrop/');
  ok('UNTRACKED app update is not notified (no installed relationship)', detectEvents(next, { baseline: base, delivered: {}, tracked: [], prefs: prefs() }).events.length === 0);
}
{
  const base = buildBaseline(catalog(app()));
  // Downgrade must not notify
  const down = catalog(app({ version: '1.4.0', apk: { ...app().apk, versionName: '1.4.0' } }));
  ok('downgrade is NOT reported as an update', detectEvents(down, { baseline: base, delivered: {}, tracked: tracked(trk('nexdrop', '1.4.4')), prefs: prefs() }).events.length === 0);
  // Same version must not notify (timestamp-only change)
  const same = catalog(app({ lastUpdated: '2026-12-01', updatedAt: '2026-12-01T00:00:00Z' }));
  ok('timestamp-only change is NOT an update', detectEvents(same, { baseline: base, delivered: {}, tracked: tracked(trk('nexdrop', '1.4.4')), prefs: prefs() }).events.length === 0);
  // Tracked version equals catalog version: nothing
  ok('tracked version already current: no event', detectEvents(catalog(app()), { baseline: base, delivered: {}, tracked: tracked(trk('nexdrop', '1.4.4')), prefs: prefs() }).events.length === 0);
}

console.log('\n[notification-engine] feature B: new android app published');
{
  const base = buildBaseline(catalog(app(), webapp()));
  const out = detectEvents(catalog(app(), webapp(), app({ id: 'skyapp', slug: 'skyapp', name: 'SkyApp', type: 'Android APK', version: '1.0.0', apk: { enabled: true, packageId: 'com.p.skyapp', versionName: '1.0.0' } })), { baseline: base, delivered: {}, tracked: [], prefs: prefs() });
  const ev = out.events[0];
  ok('new android app event produced', out.events.length === 1 && ev.kind === 'new-android-app');
  ok('new android copy matches spec', ev.title === 'New on AppMintly' && ev.body === 'Discover SkyApp, a new Android app now available.');
  ok('dedup key new-android-app:{id}:{version}', ev.key === 'new-android-app:skyapp:1.0.0');
  ok('draft/unpublished app is NEVER announced', detectEvents(catalog(app(), webapp(), app({ id: 'hidden', name: 'Hidden', version: '1.0.0', published: false, status: 'draft' })), { baseline: base, delivered: {}, tracked: [], prefs: prefs() }).events.length === 0);
  ok('newWeb pref off suppresses new android app', detectEvents(catalog(app(), webapp(), app({ id: 'skyapp', name: 'SkyApp', version: '1.0.0' })), { baseline: base, delivered: {}, tracked: [], prefs: prefs({ newAndroid: false }) }).events.length === 0);
}

console.log('\n[notification-engine] feature C: new web app / PWA published');
{
  const base = buildBaseline(catalog(app(), webapp()));
  const out = detectEvents(catalog(app(), webapp(), webapp({ id: 'toolio', slug: 'toolio', name: 'Toolio', version: '1.2.0' })), { baseline: base, delivered: {}, tracked: [], prefs: prefs() });
  const ev = out.events[0];
  ok('new web app event produced', out.events.length === 1 && ev.kind === 'new-web-app');
  ok('new web app copy matches spec', ev.title === 'New Web App on AppMintly' && ev.body === `Try Toolio's latest web experience.`);
  ok('dedup key new-web-app:{id}:{version}', ev.key === 'new-web-app:toolio:1.2.0');
  ok('web app with invalid/missing version is skipped safely', detectEvents(catalog(app(), webapp(), webapp({ id: 'noVer', name: 'NoVer', version: '' })), { baseline: base, delivered: {}, tracked: [], prefs: prefs() }).events.length === 0);
  // Canonical URL handling: engine never uses record URLs for the deep link
  const odd = webapp({ id: 'odd', slug: 'odd', name: 'Odd', url: 'https://evil.example.com/launch', launchUrl: 'javascript:alert(1)' });
  const outOdd = detectEvents(catalog(app(), webapp(), odd), { baseline: base, delivered: {}, tracked: [], prefs: prefs() });
  ok('deep link NEVER uses the record URL (always in-app slug path)', outOdd.events[0].detailPath === '/app/odd/' && detailPathFor('evil id!') === '/app/evilid/');
}

console.log('\n[notification-engine] feature D: severity categories');
{
  const base = buildBaseline(catalog(app()));
  const bumped = (sev?: string) => catalog(app({ version: '1.4.5', apk: { ...app().apk, versionName: '1.4.5' }, releaseSeverity: sev }));
  const T = () => tracked(trk('nexdrop', '1.4.4'));
  ok('important release -> important-update', detectEvents(bumped('important'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() }).events[0].kind === 'important-update');
  ok('security release -> security-update', detectEvents(bumped('security'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() }).events[0].kind === 'security-update');
  const crit = detectEvents(bumped('critical'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() });
  ok('critical release -> security-update with critical title', crit.events[0].kind === 'security-update' && crit.events[0].title === 'Critical security update: NexDrop');
  ok('normal release stays normal (never inferred)', detectEvents(bumped(undefined), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() }).events[0].kind === 'app-update');
  ok('invalid severity string falls back to normal kind', detectEvents(bumped('mega'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() }).events[0].kind === 'app-update');
  ok('severity NOT inferred from version bump alone', detectEvents(bumped(undefined), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() }).events[0].severity === 'normal');
  ok('important pref off suppresses important release', detectEvents(bumped('important'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs({ important: false }) }).events.length === 0);
  ok('security pref off suppresses security release', detectEvents(bumped('security'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs({ security: false }) }).events.length === 0);
  ok('security update dedup key differs by kind+version', detectEvents(bumped('security'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() }).events[0].key === 'security-update:nexdrop:1.4.5');
  // A single release never produces BOTH normal and security events
  const both = detectEvents(bumped('security'), { baseline: base, delivered: {}, tracked: T(), prefs: prefs() });
  ok('one release -> exactly one notification (no double alert)', both.events.length === 1);
}

console.log('\n[notification-engine] deduplication & idempotent re-runs');
{
  const base = buildBaseline(catalog(app()));
  const next = catalog(app({ version: '1.4.5', apk: { ...app().apk, versionName: '1.4.5' } }));
  const T = () => tracked(trk('nexdrop', '1.4.4'));
  const first = detectEvents(next, { baseline: base, delivered: {}, tracked: T(), prefs: prefs() });
  const deliveredNow: Record<string, number> = { [first.events[0].key]: Date.now() };
  // Same catalog again (e.g. deployment retry / catalog rebuild)
  const second = detectEvents(next, { baseline: first.baseline, delivered: deliveredNow, tracked: T(), prefs: prefs() });
  ok('repeat check of the SAME release sends NOTHING new', second.events.length === 0);
  // Unchanged revision: baseline identical
  ok('unchanged catalog keeps identical revision', computeCatalogRevision(next) === first.baseline.revision);
  // Deploy retry with the ORIGINAL baseline too (double-deploy scenario)
  const retry = detectEvents(next, { baseline: base, delivered: deliveredNow, tracked: T(), prefs: prefs() });
  ok('deployment RETRY does not duplicate the notification', retry.events.length === 0);
  // Master pref off blocks everything
  ok('master toggle off blocks all events', detectEvents(next, { baseline: base, delivered: {}, tracked: T(), prefs: prefs({ master: false }) }).events.length === 0);
  // Corruption recovery: garbage delivered map -> treated as empty, but the
  // first-run path never floods (baseline missing re-initializes silently)
  const corrupt = detectEvents(next, { baseline: { revision: '', apps: null as any }, delivered: { garbage: NaN } as any, tracked: T(), prefs: prefs() });
  ok('corrupted/missing baseline re-initializes WITHOUT an event flood', corrupt.events.length === 0 && corrupt.initializedBaseline === true);
}

console.log('\n[notification-engine] history pruning & guards');
{
  const delivered: Record<string, number> = {};
  for (let i = 0; i < 300; i++) delivered[`k${i}`] = i;
  const pruned = pruneDelivered(delivered, 200);
  ok('prune keeps the newest 200 keys', Object.keys(pruned).length === 200 && pruned['k299'] !== undefined && pruned['k5'] === undefined);
  ok('prune is a no-op under the limit', Object.keys(pruneDelivered({ a: 1, b: 2 }, 200)).length === 2);
}

// ============================================================= Phase 12.2
// Delivery accounting regression: a dedup key may be recorded ONLY after
// its notification was actually shown. Undelivered events stay pending and
// are re-detected by the next check. These tests use the same helpers the
// web provider uses (recordShownKeys + detectEvents), with isolated
// fixtures — no production catalog and no real notifications.
{
  // Fixture: one tracked app with an available upgrade (event A) and one
  // brand-new android app (event B).
  const fixtureCatalog = [
    app({ id: 'app-a', slug: 'app-a', name: 'App A', version: '2.0.0', apk: { enabled: true, packageId: 'com.a.app', versionName: '2.0.0' } }),
    app({ id: 'app-b', slug: 'app-b', name: 'App B', version: '1.0.0', publishedAt: '2026-10-09T12:00:00.000Z', apk: { enabled: true, packageId: 'com.b.app', versionName: '1.0.0' } }),
  ];
  // app-a sits in the baseline at v1.0.0 (tracked upgrade -> v2.0.0);
  // app-b is deliberately ABSENT so it is a genuinely new publication.
  const baselineA = { apps: { 'app-a': { version: '1.0.0', isAndroid: true } }, revision: 'r-fix' };
  const trackedA = [{ appId: 'app-a', version: '1.0.0', packageId: 'com.a.app', trackedAt: 1 } as any];

  const detect = (delivered: Record<string, number>, prefs: Partial<NotificationPrefs> = {}, tracked: any[] = trackedA) =>
    detectEvents(fixtureCatalog as any, {
      baseline: JSON.parse(JSON.stringify(baselineA)),
      delivered,
      tracked,
      prefs: { ...DEFAULT_PREFS, master: true, ...prefs },
    });

  const eventKeys = (r: { events: NotificationEvent[] }) => r.events.map((e) => e.key).sort();

  // --- permission denied / blocked: nothing shown, nothing recorded ---
  let delivered: Record<string, number> = {};
  let r1 = detect(delivered);
  ok('12.2 eligible events detected for the fixture', eventKeys(r1).length === 2, JSON.stringify(eventKeys(r1)));
  delivered = recordShownKeys(delivered, [], 1000); // provider records nothing
  ok('permission denied: delivered history stays empty', Object.keys(delivered).length === 0);
  const r2 = detect(delivered);
  ok('permission denied: events remain pending (re-detected)', eventKeys(r2).length === 2, JSON.stringify(eventKeys(r2)));
  ok('permission blocked: pending events keep their keys', JSON.stringify(eventKeys(r1)) === JSON.stringify(eventKeys(r2)));

  // --- delivery throws/fails for one event: only the shown one is recorded ---
  r1 = detect(delivered);
  const keys = r1.events.map((e) => e.key);
  const shownOnly = keys.slice(0, 1); // second showNotification threw in the fixture
  delivered = recordShownKeys(delivered, shownOnly, 2000);
  ok('failed delivery: only the shown key is recorded', Object.keys(delivered).length === 1 && delivered[shownOnly[0]] === 2000);
  const r3 = detect(delivered);
  ok('failed delivery: the failed event stays retryable', eventKeys(r3).length === 1 && eventKeys(r3)[0] === keys[1], JSON.stringify(eventKeys(r3)));

  // --- permission later granted: the pending event can be delivered ---
  const r4 = detect(delivered);
  delivered = recordShownKeys(delivered, r4.events.map((e) => e.key), 3000);
  const r5 = detect(delivered);
  ok('permission granted: pending events deliver and clear', eventKeys(r5).length === 0, JSON.stringify(eventKeys(r5)));

  // --- repeated checks after success: no duplicate notifications ---
  const r6 = detect(delivered);
  delivered = recordShownKeys(delivered, r6.events.map((e) => e.key), 4000);
  const r7 = detect(delivered);
  ok('successful delivery is not repeated on later checks', eventKeys(r7).length === 0);

  // --- recordShownKeys purity ---
  const before = { x: 1 };
  recordShownKeys(before, ['y'], 2);
  ok('recordShownKeys does not mutate its input', before.x === 1 && Object.keys(before).length === 1);

  // --- honest status classification: never "up to date" while pending ---
  ok('describeCheck: nothing eligible -> up-to-date', describeCheck(0, 0, false) === 'up-to-date');
  ok('describeCheck: all shown -> delivered', describeCheck(2, 2, true) === 'delivered');
  ok('describeCheck: pending with permission denied -> waiting (never up-to-date)', describeCheck(1, 0, false) === 'waiting');
  ok('describeCheck: pending with permission granted -> partial (never up-to-date)', describeCheck(2, 1, true) === 'partial');
  ok('describeCheck: zero shown, denied -> waiting even with many events', describeCheck(5, 0, false) === 'waiting');

  // --- suppressed events (prefs) deliver nothing and record nothing ---
  const rs = detect({}, { master: false });
  ok('master off: no events are eligible', rs.events.length === 0);
  const rc = detect({}, { updates: false });
  ok('updates category off: only non-update events remain eligible', rc.events.length === 1 && rc.events[0].kind === 'new-android-app', rc.events.map((e) => e.kind).join(','));
  ok('suppressed check status is up-to-date for the user', describeCheck(rs.events.length, 0, false) === 'up-to-date');

  // --- first-run baseline and corruption recovery unchanged ---
  const firstRun = detectEvents(fixtureCatalog as any, {
    baseline: { revision: '', apps: {} } as any,
    delivered: {},
    tracked: trackedA,
    prefs: { ...DEFAULT_PREFS },
  });
  ok('first run still initializes the baseline silently', firstRun.events.length === 0 && firstRun.initializedBaseline === true);
  const corrupt = detectEvents(fixtureCatalog as any, {
    baseline: null as any,
    delivered: { garbage: 'not-a-number' } as any,
    tracked: trackedA,
    prefs: { ...DEFAULT_PREFS },
  });
  ok('corrupted state re-initializes without an event flood', corrupt.events.length === 0 && corrupt.initializedBaseline === true);
}

console.log(`\n[notification-engine] ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
