/**
 * Publisher / platform statistics gate.
 *
 * Runs the real aggregation layer (lib/publisher-stats.ts) against the REAL
 * catalog (data/apps.json) and against IN-MEMORY mutations. Nothing is ever
 * written to data/. Run: npx tsx scripts/test-publisher-stats.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computePublisherStats,
  computePlatformCounts,
  countAuthoritativeApks,
  summarizePublishers,
  sortByRecentUpdate,
  getUpdateTime,
  type StatsApp,
} from '../lib/publisher-stats';

let failures = 0;
function ok(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? `  -> ${detail}` : ''}`);
  if (!cond) failures += 1;
}

const root = path.resolve(__dirname, '..');
const raw: any[] = JSON.parse(fs.readFileSync(path.join(root, 'data/apps.json'), 'utf8'));
const publishers: any[] = JSON.parse(fs.readFileSync(path.join(root, 'data/publishers.json'), 'utf8'));

/** Mirror of the project's public-eligibility rule (data/apps.ts normalizeStatus+isValidPublicApp). */
const eligible = (apps: any[]): StatsApp[] =>
  apps.filter((a) => a.published === true && String(a.status).toLowerCase() === 'published' && !a.isDemo);

const catalog = eligible(raw);

// ---------------------------------------------------------------- real data
const pkd = computePublisherStats(catalog, 'pkd');
const expectedPkd = raw.filter((a) => a.developerSlug === 'pkd' && a.published === true);
ok('PKD total == records in apps.json with developerSlug=pkd & published', pkd.totalApps === expectedPkd.length, `${pkd.totalApps} vs ${expectedPkd.length}`);
ok('PKD published == total (public catalog is pre-filtered)', pkd.publishedApps === pkd.totalApps);
ok('PKD apps are exactly PKD-owned slugs', pkd.apps.every((a) => a.developerSlug === 'pkd') && pkd.apps.length === expectedPkd.length);
ok('draft fixture (distribution-test) is excluded', !pkd.apps.some((a) => a.slug === 'distribution-test') && !catalog.some((a) => a.slug === 'distribution-test'));
const distinctCats = new Set(expectedPkd.map((a) => String(a.category).trim().toLowerCase())).size;
ok('PKD categories == distinct categories of its apps', pkd.categoryCount === distinctCats, `${pkd.categoryCount} vs ${distinctCats}`);

const newestReal = [...expectedPkd].sort((a, b) => {
  const ta = Date.parse(a.updatedAt || a.lastUpdated);
  const tb = Date.parse(b.updatedAt || b.lastUpdated);
  return tb - ta;
})[0];
ok('latest version == version of most recently updated PKD app', pkd.latestVersion === newestReal.version, `${pkd.latestVersion} vs ${newestReal.version}`);
ok('latest-version source app is named', pkd.latestVersionApp === newestReal.name);

const plat = computePlatformCounts(catalog);
const platSum = plat.reduce((n, p) => n + p.count, 0);
ok('platform counts sum to eligible app count (no double count)', platSum === catalog.length, `${platSum} vs ${catalog.length}`);
for (const p of plat) {
  const direct = catalog.filter((a) => (a.type || 'Other') === p.type).length;
  ok(`platform "${p.type}" count matches direct filter`, p.count === direct, `${p.count} vs ${direct}`);
}
const apkEvidence = countAuthoritativeApks(catalog);
const apkDirect = catalog.filter((a) => a.apk && a.apk.enabled === true && a.apk.verified === true && a.apk.sha256 && (a.apk.apkUrl || a.apkUrl)).length;
ok('authoritative APK count == apps with real release evidence', apkEvidence === apkDirect, `${apkEvidence} vs ${apkDirect}`);

const summary = summarizePublishers(catalog, publishers);
ok('Verified Publishers PKD count == profile total (same source)', summary.find((s) => s.slug === 'pkd')?.appCount === pkd.totalApps);
ok('publisher with zero published apps is omitted (mint-test-lab)', !summary.some((s) => s.slug === 'mint-test-lab'));
ok('PKD verified flag from registry', summary.find((s) => s.slug === 'pkd')?.verified === true);

// ----------------------------------------------------- deterministic sorting
const sameDay: StatsApp[] = [
  { slug: 'a', name: 'A', lastUpdated: '2026-10-08', updatedAt: '2026-10-08T10:00:00.000Z', version: '1.0.0' },
  { slug: 'b', name: 'B', lastUpdated: '2026-10-08', updatedAt: '2026-10-08T17:10:00.000Z', version: '2.0.0' },
];
ok('same-day tie broken by precise updatedAt (B newer)', sortByRecentUpdate(sameDay)[0].slug === 'b');
ok('sort is independent of input order', sortByRecentUpdate([...sameDay].reverse())[0].slug === 'b');

// ----------------------------------------------------- version update test
const bumped = catalog.map((a: any) => (a.slug === 'pdfminifly' ? { ...a, version: '9.9.9', lastUpdated: '2099-01-01', updatedAt: '2099-01-01T00:00:00.000Z' } : a));
const afterBump = computePublisherStats(bumped, 'pkd');
ok('bumping a version makes it the latest-version display', afterBump.latestVersion === '9.9.9' && afterBump.latestVersionApp === 'PDFMiniFly');
ok('version bump does not change counts', afterBump.totalApps === pkd.totalApps && afterBump.categoryCount === pkd.categoryCount);

// ----------------------------------------------------- publish new app
const withNew = [...catalog, { slug: 'new-eligible', name: 'New', developerSlug: 'pkd', category: 'Brand New Cat', type: 'Web App', version: '0.1.0', lastUpdated: '2099-01-01', published: true, status: 'published' } as any];
const afterPublish = computePublisherStats(withNew, 'pkd');
ok('publishing a new eligible app: total +1', afterPublish.totalApps === pkd.totalApps + 1);
ok('publishing a new category: category count +1', afterPublish.categoryCount === pkd.categoryCount + 1);
ok('platform total +1 after publish', computePlatformCounts(withNew).reduce((n, p) => n + p.count, 0) === catalog.length + 1);
ok('new app appears in PKD list, newest first', afterPublish.apps[0].slug === 'new-eligible');

// ----------------------------------------------------- drafts stay out
const withDraft = eligible([...raw, { slug: 'secret-draft', developerSlug: 'pkd', published: false, status: 'draft', category: 'Secret', type: 'Android APK' }]);
const afterDraft = computePublisherStats(withDraft, 'pkd');
ok('draft record does not change PKD total', afterDraft.totalApps === pkd.totalApps);
ok('draft category does not leak into category count', afterDraft.categoryCount === pkd.categoryCount);
ok('draft does not appear in platform counts', computePlatformCounts(withDraft).reduce((n, p) => n + p.count, 0) === catalog.length);

// ------------------------------------------------ duplicates never double count
const dup = [...catalog, ...catalog];
ok('duplicate records counted once (publisher)', computePublisherStats(dup, 'pkd').totalApps === pkd.totalApps);
ok('duplicate records counted once (platform)', computePlatformCounts(dup).reduce((n, p) => n + p.count, 0) === catalog.length);
ok('duplicate records counted once (APK evidence)', countAuthoritativeApks(dup) === apkEvidence);

// -------------------------------------------------- missing metadata graceful
const sparse: StatsApp[] = [
  { slug: 'x1', developerSlug: 'pkd' },
  { slug: 'x2', developerSlug: 'pkd', category: '   ', version: '  ' },
  { slug: 'x3', developerSlug: 'pkd', lastUpdated: 'not-a-date', updatedAt: '', releaseDate: undefined },
];
let threw = false;
let sparseStats: ReturnType<typeof computePublisherStats> | undefined;
try {
  sparseStats = computePublisherStats(sparse, 'pkd');
  computePlatformCounts(sparse);
  countAuthoritativeApks(sparse);
  sortByRecentUpdate(sparse);
} catch {
  threw = true;
}
ok('missing/invalid metadata never throws', !threw);
ok('missing version -> null (not a fabricated label)', sparseStats?.latestVersion === null);
ok('blank categories are not counted', sparseStats?.categoryCount === 0);
ok('invalid timestamps yield null (never invented)', getUpdateTime(sparse[2]) === null);
ok('unknown type buckets as "Other"', computePlatformCounts(sparse)[0]?.type === 'Other');

// ------------------------------------------------- empty / unknown publisher
const none = computePublisherStats(catalog, 'does-not-exist');
ok('unknown publisher -> zero apps, null version', none.totalApps === 0 && none.latestVersion === null && none.categoryCount === 0);
ok('publisher match is case-insensitive', computePublisherStats(catalog, 'PKD').totalApps === pkd.totalApps);
ok('empty catalog -> empty results (no sample data)', computePlatformCounts([]).length === 0 && computePublisherStats([], 'pkd').totalApps === 0);

console.log(`\n[stats-gate] ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
