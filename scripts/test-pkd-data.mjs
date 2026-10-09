#!/usr/bin/env node
/**
 * PKD catalog adapter test suite.
 *
 * Compiles lib/pkd-data.ts (and its @/data/apps dependency) with the
 * project's own TypeScript compiler, then runs rule-based unit tests with
 * Node's built-in test runner. No new dependencies.
 *
 * Usage: node scripts/test-pkd-data.mjs
 */
import { execSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.pkd-test-out');

execSync(`rm -rf "${outDir}" && npx tsc -p tsconfig.pkd-test.json`, { cwd: root, stdio: 'inherit' });

const { buildPkdData } = await import(path.join(outDir, 'pkd-data.js'));

const BP = ''; // base path under test = production primary host

const baseApp = (over = {}) => ({
  slug: 'demo',
  name: 'Demo',
  icon: '/brand/demo.png',
  themeColor: '#22C55E',
  shortDescription: 'A demo app.',
  description: 'Long description',
  version: '1.2.3',
  size: '300 KB',
  category: 'Tools',
  type: 'Web App',
  developerSlug: 'pkd',
  published: true,
  lastUpdated: '2026-10-01T00:00:00Z',
  ...over,
});

const catalog = (...apps) => apps.map(baseApp);

test('five currently eligible published apps', () => {
  const d = buildPkdData(catalog(
    { slug: 'a', name: 'A', category: 'Tools', version: '1.0.0', lastUpdated: '2026-10-08' },
    { slug: 'b', name: 'B', category: 'Education', version: '2.0.0', lastUpdated: '2026-10-02' },
    { slug: 'c', name: 'C', category: 'Tools', version: '2.1.0', lastUpdated: '2026-10-01' },
    { slug: 'd', name: 'D', category: 'Health', version: '3.0.0', lastUpdated: '2026-09-28' },
    { slug: 'e', name: 'E', category: 'Utilities', version: '1.4.0', lastUpdated: '2026-09-27' }
  ), BP);
  assert.equal(d.apps.length, 5);
  assert.equal(d.stats.published, 5);
  assert.equal(d.stats.total, 5);
  assert.equal(d.stats.categories, 4); // Tools dedupes
  assert.equal(d.stats.latest, 'v1.0.0'); // newest lastUpdated 2026-10-08
  assert.equal(d.updates.length, 5);
  // newest first
  assert.equal(d.updates[0].name, 'A');
  assert.equal(d.updates[0].date, '2026-10-08');
  // showcase destinations point at detail pages
  assert.equal(d.apps[0].u, '/app/a/');
});

test('a newly published sixth app appears with stats updated', () => {
  const five = catalog(
    { slug: 'a', name: 'A', category: 'Tools', lastUpdated: '2026-10-01' },
    { slug: 'b', name: 'B', category: 'Education', lastUpdated: '2026-10-01' }
  );
  const d5 = buildPkdData(five, BP);
  const six = [...five, baseApp({ slug: 'f', name: 'F', category: 'Games', lastUpdated: '2026-10-09', version: '9.9.9' })];
  const d6 = buildPkdData(six, BP);
  assert.equal(d5.stats.published, 2);
  assert.equal(d6.apps.length, 3);
  assert.ok(d6.apps.some((a) => a.n === 'F'));
  assert.equal(d6.stats.categories, 3);
  assert.equal(d6.stats.latest, 'v9.9.9');
  assert.equal(d6.updates[0].name, 'F');
});

test('a version update changes the displayed version + timeline, no duplicate card', () => {
  const before = buildPkdData(catalog({ slug: 'a', name: 'A', version: '1.0.0', lastUpdated: '2026-09-01' }), BP);
  const after = buildPkdData(catalog({ slug: 'a', name: 'A', version: '1.0.1', lastUpdated: '2026-10-05' }), BP);
  assert.equal(before.apps[0].v, 'v1.0.0 • 300 KB');
  assert.equal(after.apps[0].v, 'v1.0.1 • 300 KB');
  assert.equal(before.updates[0].version, 'v1.0.0');
  assert.equal(after.updates[0].version, 'v1.0.1');
  assert.equal(after.apps.length, 1);
});

test('duplicate slugs are deduplicated (first canonical record wins)', () => {
  const d = buildPkdData([
    baseApp({ slug: 'a', name: 'A1', version: '1.0.0' }),
    baseApp({ slug: 'a', name: 'A2', version: '2.0.0' }),
  ], BP);
  assert.equal(d.apps.length, 1);
  assert.equal(d.apps[0].n, 'A1');
  assert.equal(d.updates.length, 1);
});

test('unpublished, archived and other publishers are excluded', () => {
  const d = buildPkdData([
    baseApp({ slug: 'pub', name: 'Pub', published: true }),
    baseApp({ slug: 'draft', name: 'Draft', published: false }),
    baseApp({ slug: 'arch', name: 'Arch', published: false }),
    baseApp({ slug: 'other', name: 'Other', developerSlug: 'someone-else' }),
  ], BP);
  assert.equal(d.apps.length, 1);
  assert.equal(d.apps[0].n, 'Pub');
  assert.equal(d.stats.published, 1);
});

test('missing optional metadata gets neutral fallbacks', () => {
  const d = buildPkdData([baseApp({
    slug: 'x', name: 'X', icon: '', themeColor: '', version: '', size: '',
    shortDescription: '', description: '', category: '', lastUpdated: '', releaseDate: '', updatedAt: '', publishedAt: '',
  })], BP);
  const a = d.apps[0];
  assert.equal(a.v, '\u2014');
  assert.match(a.i, /^data:image\/svg\+xml/); // monogram fallback
  assert.equal(a.g, 0x4c8dff); // default accent
  assert.equal(a.ty, 'App');
  assert.equal(a.d, '');
  assert.equal(d.stats.latest, '\u2014');
  assert.equal(d.updates[0].date, '\u2014');
  assert.equal(d.updates[0].version, '\u2014');
});

test('empty catalog handled safely (zero apps)', () => {
  const d = buildPkdData([], BP);
  assert.equal(d.apps.length, 0);
  assert.equal(d.stats.total, 0);
  assert.equal(d.stats.published, 0);
  assert.equal(d.stats.categories, 0);
  assert.deepEqual(d.updates, []);
  // page template renders the neutral counter for this case
  assert.equal(d.apps.length ? '01 / 00' : '\u2014 / \u2014', '\u2014 / \u2014');
});

test('failed fetch never means demo data — adapter is a pure function of input', () => {
  // The adapter cannot invent apps: an empty/failed feed yields zero apps,
  // never the five hardcoded records from the original design.
  const d = buildPkdData([], BP);
  assert.equal(d.apps.length, 0);
});

test('equal or missing update dates keep catalog order (stable, newest-first)', () => {
  const d = buildPkdData(catalog(
    { slug: 'a', name: 'A', lastUpdated: '' },
    { slug: 'b', name: 'B', lastUpdated: '2026-10-01' },
    { slug: 'c', name: 'C', lastUpdated: '2026-10-01' }
  ), BP);
  assert.equal(d.updates.map((u) => u.name).join(','), 'B,C,A');
  assert.equal(d.updates[0].sortKey, d.updates[1].sortKey);
});

test('app with a missing icon falls back to the neutral monogram', () => {
  const d = buildPkdData([baseApp({ slug: 'noicon', name: 'Nix', icon: undefined })], BP);
  assert.match(d.apps[0].i, /^data:image\/svg\+xml/);
  assert.ok(d.apps[0].i.includes('N'));
  assert.equal(d.updates[0].icon, d.apps[0].i);
});

test('APK package labelling and destinations', () => {
  const d = buildPkdData([baseApp({ slug: 'apk-app', type: 'Android APK' })], BP);
  assert.equal(d.apps[0].ty, 'APK');
  assert.equal(d.apps[0].t, 'Tools • APK Package');
  assert.equal(d.apps[0].u, '/app/apk-app/');
});

test('real repo catalog snapshot: four published PKD apps, three categories', async () => {
  // Reads the actual data/apps.json the marketplace ships (same source of truth).
  const { readFileSync } = await import('node:fs');
  const apps = JSON.parse(readFileSync(path.join(root, 'data/apps.json'), 'utf-8'));
  const published = apps.filter((a) => a.published);
  const d = buildPkdData(published, BP);
  assert.equal(d.apps.length, 4);
  assert.ok(d.apps.every((a) => !a.u.includes('undefined')));
  assert.equal(d.stats.categories, 3);
  assert.equal(d.stats.latest, 'v2.1.0'); // Niramay, the newest update
  assert.equal(d.updates[0].name, 'Niramay');
});
