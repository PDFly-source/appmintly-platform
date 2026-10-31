/**
 * AppMintly 2.0 — Explore platform + availability filters.
 *
 * The filters must describe the catalog truthfully: a platform comes from
 * authoritative APK release evidence or a real web target, availability from
 * privacyTech.networkRequirement. Records with no availability metadata are
 * 'unknown' and must never be matched as offline or online.
 */
import { describe, expect, it } from 'vitest';
import catalog from '../data/apps.json';
import { CATEGORIES } from '../data/categories';
import {
  DEFAULT_EXPLORE_FILTERS,
  availabilityCounts,
  availabilityOf,
  filterApps,
  hasActiveFilters,
  matchesAvailability,
  matchesPlatform,
  parseExploreParams,
  platformCounts,
  platformOf,
  toExploreParams,
  webUrlOf,
  type CatalogLikeApp,
  type ExploreFilters,
} from '../lib/catalog/explore-filters';

const apps = (catalog as unknown as CatalogLikeApp[]).filter((a) => a.published);
const cats = CATEGORIES.map((c) => ({ slug: c.slug, name: c.name }));

const build = (over: Partial<ExploreFilters> = {}): ExploreFilters => ({
  ...DEFAULT_EXPLORE_FILTERS,
  ...over,
});
const run = (over: Partial<ExploreFilters> = {}) => filterApps(apps, build(over), cats);

const apkOnly: CatalogLikeApp = {
  slug: 'apk-only',
  name: 'APK Only',
  type: 'Android APK',
  apk: { enabled: true, verified: true, sha256: 'a'.repeat(64), apkUrl: 'https://x/y.apk', fileSizeBytes: 10 },
};
const webOnly: CatalogLikeApp = { slug: 'web-only', name: 'Web Only', type: 'Web App', launchUrl: 'https://x/' };
const neither: CatalogLikeApp = { slug: 'neither', name: 'Neither', type: 'Web App' };
const both: CatalogLikeApp = {
  slug: 'both',
  name: 'Both',
  type: 'Android APK',
  launchUrl: 'https://x/',
  apk: { enabled: true, verified: true, sha256: 'b'.repeat(64), apkUrl: 'https://x/y.apk', fileSizeBytes: 10 },
};

describe('platform derivation', () => {
  it('classifies from real release evidence, never from the type label alone', () => {
    expect(platformOf(apkOnly)).toBe('android');
    expect(platformOf(webOnly)).toBe('web');
    expect(platformOf(both)).toBe('both');
    expect(platformOf(neither)).toBe('none');
  });

  it('an APK listing without release evidence is not treated as Android', () => {
    const claimOnly: CatalogLikeApp = {
      slug: 'claim',
      name: 'Claim',
      type: 'Android APK',
      apk: { enabled: true, verified: false },
    };
    expect(platformOf(claimOnly)).toBe('none');
  });

  it('web support requires a real http(s) target', () => {
    expect(webUrlOf({ slug: 'x', name: 'X', pwaUrl: 'https://a/' })).toBe('https://a/');
    expect(platformOf({ slug: 'x', name: 'X', launchUrl: 'not-a-url' })).toBe('none');
  });
});

describe('platform filtering', () => {
  it('Android APK availability includes every app you can get as an APK', () => {
    const result = run({ platform: 'android' });
    expect(result.length).toBeGreaterThan(0);
    for (const app of result) expect(['android', 'both']).toContain(platformOf(app));
  });

  it('Web app availability includes every app with a web target', () => {
    const result = run({ platform: 'web' });
    expect(result.length).toBeGreaterThan(0);
    for (const app of result) expect(['web', 'both']).toContain(platformOf(app));
  });

  it('Both means both, and is a subset of either single-platform filter', () => {
    const bothResult = run({ platform: 'both' });
    const androidResult = run({ platform: 'android' });
    const webResult = run({ platform: 'web' });
    for (const app of bothResult) expect(platformOf(app)).toBe('both');
    expect(bothResult.length).toBeLessThanOrEqual(androidResult.length);
    expect(bothResult.length).toBeLessThanOrEqual(webResult.length);
  });

  it('never invents a platform: the union of filters is the whole catalog', () => {
    const androidSlugs = new Set(run({ platform: 'android' }).map((a) => a.slug));
    const webSlugs = new Set(run({ platform: 'web' }).map((a) => a.slug));
    const union = new Set([...androidSlugs, ...webSlugs]);
    const none = apps.filter((a) => platformOf(a) === 'none').map((a) => a.slug);
    expect(union.size + none.length).toBe(apps.length);
  });

  it('excludes apps with no platform at all from both single filters', () => {
    expect(matchesPlatform(neither, 'android')).toBe(false);
    expect(matchesPlatform(neither, 'web')).toBe(false);
    expect(matchesPlatform(neither, 'both')).toBe(false);
    expect(matchesPlatform(neither, 'all')).toBe(true);
  });
});

describe('availability derivation and filtering', () => {
  it('reads privacyTech.networkRequirement and reports unknown otherwise', () => {
    expect(availabilityOf({ slug: 'a', name: 'A', privacyTech: { networkRequirement: 'offline-capable' } })).toBe('offline');
    expect(availabilityOf({ slug: 'b', name: 'B', privacyTech: { networkRequirement: 'online-only' } })).toBe('online');
    expect(availabilityOf({ slug: 'c', name: 'C' })).toBe('unknown');
    expect(availabilityOf({ slug: 'd', name: 'D', privacyTech: { networkRequirement: 'sometimes' } })).toBe('unknown');
  });

  it('offline and online partitions cover exactly the known records', () => {
    const offline = run({ availability: 'offline' });
    const online = run({ availability: 'online' });
    const known = apps.filter((a) => availabilityOf(a) !== 'unknown').length;
    expect(offline.length + online.length).toBe(known);
    for (const app of offline) expect(availabilityOf(app)).toBe('offline');
    for (const app of online) expect(availabilityOf(app)).toBe('online');
  });

  it('an unknown-availability record is never matched by either option', () => {
    const noMeta: CatalogLikeApp = { slug: 'n', name: 'N', launchUrl: 'https://n/' };
    expect(matchesAvailability(noMeta, 'offline')).toBe(false);
    expect(matchesAvailability(noMeta, 'online')).toBe(false);
    expect(matchesAvailability(noMeta, 'all')).toBe(true);
  });

  it('counts are honest, including the unknown bucket', () => {
    const counts = availabilityCounts(apps);
    expect(counts.offline + counts.online + counts.unknown).toBe(apps.length);
    const platforms = platformCounts(apps);
    expect(platforms.both).toBeLessThanOrEqual(platforms.android);
    expect(platforms.both).toBeLessThanOrEqual(platforms.web);
  });
});

describe('filters compose', () => {
  it('platform and availability combine as an AND, not either/or', () => {
    const offlineApps = apps.filter((a) => availabilityOf(a) === 'offline');
    const expected = offlineApps.filter((a) => matchesPlatform(a, 'android')).length;
    const result = run({ platform: 'android', availability: 'offline' });
    expect(result.length).toBe(expected);
    for (const app of result) {
      expect(matchesPlatform(app, 'android')).toBe(true);
      expect(matchesAvailability(app, 'offline')).toBe(true);
    }
  });

  it('platform + availability + category + query all narrow the same result set', () => {
    const category = apps[0].category as string;
    const narrowed = run({ platform: 'android', availability: 'offline', category });
    for (const app of narrowed) {
      expect((app.category || '').toLowerCase()).toBe(category.toLowerCase());
    }
    const queried = run({ platform: 'android', availability: 'offline', query: apps[0].name });
    for (const app of queried) expect(app.name.toLowerCase()).toContain(apps[0].name.toLowerCase());
  });

  it('preserves the existing category, type, publisher, originals, featured and sort behaviour', () => {
    const publisher = apps[0].developerSlug;
    if (publisher) {
      const result = run({ publisher });
      for (const app of result) expect((app.developerSlug || '').toLowerCase()).toBe(publisher.toLowerCase());
    }
    const byName = run({ sort: 'name' });
    const names = byName.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(run({ featured: true }).every((a) => a.featured)).toBe(true);
    expect(run({ originals: true }).every((a) => a.original)).toBe(true);
  });
});

describe('URL parameters', () => {
  it('round-trips every filter', () => {
    const filters: ExploreFilters = {
      query: 'video',
      category: 'entertainment',
      type: 'Android APK',
      publisher: 'pkd',
      originals: true,
      featured: true,
      platform: 'both',
      availability: 'offline',
      sort: 'updated',
    };
    const params = toExploreParams(filters);
    expect(parseExploreParams(params)).toEqual(filters);
  });

  it('omits defaults so /explore stays canonical', () => {
    expect(toExploreParams(DEFAULT_EXPLORE_FILTERS).toString()).toBe('');
  });

  it('a direct link with parameters restores the filtered view', () => {
    const parsed = parseExploreParams(
      new URLSearchParams('?platform=android&availability=offline&category=entertainment&sort=name')
    );
    expect(parsed.platform).toBe('android');
    expect(parsed.availability).toBe('offline');
    expect(parsed.category).toBe('entertainment');
    expect(parsed.sort).toBe('name');
  });

  it('rejects unknown values instead of inventing a filter', () => {
    const parsed = parseExploreParams(new URLSearchParams('?platform=nintendo&availability=sometimes&sort=chaos'));
    expect(parsed.platform).toBe('all');
    expect(parsed.availability).toBe('all');
    expect(parsed.sort).toBe('newest');
  });

  it('back/forward state is representable: each URL maps to exactly one filter state', () => {
    const a = parseExploreParams(new URLSearchParams('?platform=android'));
    const b = parseExploreParams(new URLSearchParams('?platform=web&availability=online'));
    expect(a).not.toEqual(b);
    expect(parseExploreParams(toExploreParams(a))).toEqual(a);
    expect(parseExploreParams(toExploreParams(b))).toEqual(b);
  });
});

describe('clear all and empty results', () => {
  it('default state has no active filters', () => {
    expect(hasActiveFilters(DEFAULT_EXPLORE_FILTERS)).toBe(false);
    expect(toExploreParams(DEFAULT_EXPLORE_FILTERS).toString()).toBe('');
  });

  it('each new filter marks the state active', () => {
    expect(hasActiveFilters(build({ platform: 'android' }))).toBe(true);
    expect(hasActiveFilters(build({ availability: 'offline' }))).toBe(true);
  });

  it('clearing returns the full catalog', () => {
    const cleared = filterApps(apps, DEFAULT_EXPLORE_FILTERS, cats);
    expect(cleared.length).toBe(apps.length);
  });

  it('an impossible combination yields an empty list rather than falling back', () => {
    const impossible = run({ platform: 'android', availability: 'offline', category: 'games', publisher: 'mint-test-lab' });
    expect(impossible.length).toBe(0);
  });
});
