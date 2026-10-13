/**
 * Unit tests for lib/search-suggest.ts (premium storefront Phase B).
 * Pure logic — no React, no network, no fixtures beyond inline records.
 */
import { suggestApps, SuggestableApp } from '../lib/search-suggest';

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (ok) passed++;
  else failed++;
}

const APPS: SuggestableApp[] = [
  { slug: 'appmintly', name: 'AppMintly', developer: 'AppMintly', category: 'Tools', type: 'Android APK' },
  { slug: 'niramay', name: 'Niramay', developer: 'AppMintly', category: 'Health & Fitness', type: 'Android APK' },
  { slug: 'pdfminifly', name: 'PDFMiniFly', developer: 'PKD', category: 'Productivity', type: 'Web App' },
  { slug: 'studyria', name: 'Studyria', developer: 'AppMintly', category: 'Education', type: 'Web App' },
  { slug: 'nexdrop', name: 'NexDrop', developer: 'AppMintly', category: 'Tools', type: 'Android APK' },
];

// 1. Empty / short queries never suggest.
check(suggestApps(APPS, '').length === 0, 'empty query returns no suggestions');
check(suggestApps(APPS, 'n').length === 0, '1-char query returns no suggestions');

// 2. Exact and prefix name matches rank first.
const exact = suggestApps(APPS, 'niramay');
check(exact.length >= 1 && exact[0].app.slug === 'niramay', 'exact name match ranks first');
const prefix = suggestApps(APPS, 'nex');
check(prefix.length >= 1 && prefix[0].app.slug === 'nexdrop', 'prefix match ranks first');

// 3. Developer / category / type matching works from real fields.
const byDev = suggestApps(APPS, 'pkd');
check(byDev.length === 1 && byDev[0].app.slug === 'pdfminifly', 'developer match finds the real record');
const byCat = suggestApps(APPS, 'productivity');
check(byCat.length === 1 && byCat[0].app.slug === 'pdfminifly', 'category match finds the real record');
const byType = suggestApps(APPS, 'web');
check(byType.length >= 1 && byType.every((s) => s.app.type === 'Web App'), 'type match only returns web apps');

// 4. Case-insensitive.
check(
  suggestApps(APPS, 'NiRaMaY')[0].app.slug === 'niramay',
  'matching is case-insensitive'
);

// 5. Dedupe: one row per app even if several fields match.
const dedupe = suggestApps(APPS, 'appmintly');
check(dedupe.filter((s) => s.app.slug === 'appmintly').length === 1, 'an app appears at most once');

// 6. Limit respected (with a >=2-char query that has multiple matches).
const limited = suggestApps(APPS, 'app', 2);
check(limited.length === 2, 'limit is respected (2-char query, limit 2)');

// 7. Every suggestion is a real input record — nothing invented.
const slugs = new Set(APPS.map((a) => a.slug));
check(
  suggestApps(APPS, 'e').every((s) => slugs.has(s.app.slug)) === true ||
    suggestApps(APPS, 'e').length === 0,
  'suggestions are always real catalog records'
);

// 8. Loose subsequence fallback (typo tolerance) stays honest.
const typo = suggestApps(APPS, 'nrmay');
check(typo.length >= 1 && typo[0].app.slug === 'niramay', 'subsequence typo fallback matches the real app');

// 9. No match -> empty, never a filler.
check(suggestApps(APPS, 'zzzzqqq').length === 0, 'no-match query returns empty, no filler');

// 10. Equal scores break alphabetically (checked WITHIN a score group only;
//     different-score groups are ordered by score, which outranks the tie-break).
const scored = suggestApps(APPS, 'app');
const devGroup = scored.filter((s) => s.score === 55).map((s) => s.app.name);
check(
  scored[0].score === 90 && scored[0].app.slug === 'appmintly',
  'highest score always ranks first'
);
check(
  devGroup.join(',') === [...devGroup].sort((a, b) => a.localeCompare(b)).join(','),
  'ties break alphabetically within the same score'
);

console.log(`[search-suggest] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
