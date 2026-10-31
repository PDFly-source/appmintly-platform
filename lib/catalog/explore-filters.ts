/**
 * AppMintly 2.0 — Explore filtering engine (pure, no React, no I/O).
 *
 * Every value is derived from the canonical catalog record:
 *   platform      ← authoritative APK release evidence (lib/distribution) plus a
 *                   real web launch target. No record gains a platform it does
 *                   not ship.
 *   availability  ← privacyTech.networkRequirement, the platform's existing
 *                   metadata field. Records without that field are 'unknown'
 *                   and never silently counted as offline or online.
 *
 * Moving the predicate here keeps the Explore UI thin and lets the whole matrix
 * (platform × availability × category × type × publisher × query) be tested
 * without a browser.
 */
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

export type PlatformFilter = 'all' | 'android' | 'web' | 'both';
export type AvailabilityFilter = 'all' | 'offline' | 'online';
export type Availability = 'offline' | 'online' | 'unknown';
export type Platform = 'android' | 'web' | 'both' | 'none';
export type ExploreSort = 'newest' | 'updated' | 'name' | 'type';

export interface CatalogLikeApp {
  id?: string;
  slug: string;
  name: string;
  shortName?: string;
  description?: string;
  shortDescription?: string;
  developer?: string;
  developerSlug?: string;
  category?: string;
  type?: string;
  tags?: string[];
  features?: string[];
  published?: boolean;
  featured?: boolean;
  original?: boolean;
  lastUpdated?: string;
  updatedAt?: string;
  releaseDate?: string;
  publishedAt?: string;
  launchUrl?: string;
  pwaUrl?: string;
  url?: string;
  privacyTech?: { networkRequirement?: string } | null;
  apk?: {
    enabled?: boolean;
    verified?: boolean;
    sha256?: string;
    apkUrl?: string;
    fileSizeBytes?: number;
  } | null;
  apkUrl?: string;
}

export interface ExploreFilters {
  query: string;
  category: string;
  type: string;
  publisher: string;
  originals: boolean;
  featured: boolean;
  platform: PlatformFilter;
  availability: AvailabilityFilter;
  sort: ExploreSort;
}

export const DEFAULT_EXPLORE_FILTERS: ExploreFilters = {
  query: '',
  category: 'all',
  type: 'all',
  publisher: 'all',
  originals: false,
  featured: false,
  platform: 'all',
  availability: 'all',
  sort: 'newest',
};

/** The real web destination of an app, if it has one. */
export function webUrlOf(app: CatalogLikeApp): string {
  return app.launchUrl || app.pwaUrl || app.url || '';
}

/**
 * Where the app can actually be obtained.
 * 'both' means an authoritative APK release AND a web target, nothing more.
 */
export function platformOf(app: CatalogLikeApp): Platform {
  const android = hasAuthoritativeApkRelease(app as never);
  const web = /^https?:\/\//i.test(webUrlOf(app));
  if (android && web) return 'both';
  if (android) return 'android';
  if (web) return 'web';
  return 'none';
}

/** Availability from the catalogued privacy record; 'unknown' when absent. */
export function availabilityOf(app: CatalogLikeApp): Availability {
  const requirement = app.privacyTech?.networkRequirement;
  if (requirement === 'offline-capable') return 'offline';
  if (requirement === 'online-only') return 'online';
  return 'unknown';
}

export function matchesPlatform(app: CatalogLikeApp, filter: PlatformFilter): boolean {
  if (filter === 'all') return true;
  const platform = platformOf(app);
  if (filter === 'both') return platform === 'both';
  // "Android APK availability" and "Web app availability" are inclusive:
  // an app that ships both genuinely satisfies either question.
  return platform === filter || platform === 'both';
}

export function matchesAvailability(app: CatalogLikeApp, filter: AvailabilityFilter): boolean {
  if (filter === 'all') return true;
  const availability = availabilityOf(app);
  if (availability === 'unknown') return false; // never assumed
  return availability === filter;
}

export function matchesQuery(app: CatalogLikeApp, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    app.name,
    app.shortName,
    app.description,
    app.shortDescription,
    app.developer,
    app.category,
    app.type,
    ...(app.tags || []),
    ...(app.features || []),
  ];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

export function matchesType(app: CatalogLikeApp, selectedType: string): boolean {
  if (selectedType === 'all') return true;
  const appTypeLower = (app.type || '').toLowerCase().trim();
  const selTypeLower = selectedType.toLowerCase().trim();
  if (appTypeLower === selTypeLower) return true;

  if (selTypeLower === 'web app' && ['web app', 'pwa', 'web_app'].includes(appTypeLower)) return true;
  if (selTypeLower === 'game' && ['web game', 'game'].includes(appTypeLower)) return true;
  if (
    selTypeLower === 'android apk' &&
    hasAuthoritativeApkRelease(app as never) &&
    typeof app.apk?.fileSizeBytes === 'number' &&
    app.apk.fileSizeBytes > 0
  ) {
    return true;
  }
  return false;
}

export interface CategoryRef {
  slug: string;
  name: string;
}

export function matchesCategory(
  app: CatalogLikeApp,
  selectedCategory: string,
  categories: CategoryRef[]
): boolean {
  if (selectedCategory === 'all') return true;
  const catObj = categories.find(
    (c) =>
      c.slug.toLowerCase() === selectedCategory.toLowerCase() ||
      c.name.toLowerCase() === selectedCategory.toLowerCase()
  );
  const catNameLower = catObj ? catObj.name.toLowerCase() : selectedCategory.toLowerCase();
  const appCatLower = (app.category || '').toLowerCase();
  return (
    appCatLower === selectedCategory.toLowerCase() ||
    appCatLower === catNameLower ||
    appCatLower.replace(/\s+/g, '-') === selectedCategory.toLowerCase()
  );
}

function stamp(app: CatalogLikeApp): number {
  return new Date(app.lastUpdated || app.updatedAt || app.releaseDate || 0).getTime() || 0;
}

/** Every filter ANDed together: filters compose, they never over-ride each other. */
export function filterApps<T extends CatalogLikeApp>(
  apps: T[],
  filters: ExploreFilters,
  categories: CategoryRef[] = []
): T[] {
  const out = apps.filter((app) => {
    if (filters.featured && !app.featured) return false;
    if (filters.originals && !app.original) return false;
    if (
      filters.publisher !== 'all' &&
      (app.developerSlug || '').toLowerCase() !== filters.publisher.toLowerCase()
    ) {
      return false;
    }
    if (!matchesCategory(app, filters.category, categories)) return false;
    if (!matchesType(app, filters.type)) return false;
    if (!matchesPlatform(app, filters.platform)) return false;
    if (!matchesAvailability(app, filters.availability)) return false;
    if (!matchesQuery(app, filters.query)) return false;
    return true;
  });

  return out.sort((a, b) => {
    if (filters.sort === 'updated') return stamp(b) - stamp(a);
    if (filters.sort === 'name') return a.name.localeCompare(b.name);
    if (filters.sort === 'type') return (a.type || '').localeCompare(b.type || '');
    return stamp(b) - stamp(a);
  });
}

/** Counts shown next to filter options, computed from the real catalog. */
export function platformCounts(apps: CatalogLikeApp[]) {
  let android = 0;
  let web = 0;
  let both = 0;
  for (const app of apps) {
    if (matchesPlatform(app, 'android')) android += 1;
    if (matchesPlatform(app, 'web')) web += 1;
    if (platformOf(app) === 'both') both += 1;
  }
  return { android, web, both };
}

export function availabilityCounts(apps: CatalogLikeApp[]) {
  let offline = 0;
  let online = 0;
  let unknown = 0;
  for (const app of apps) {
    const value = availabilityOf(app);
    if (value === 'offline') offline += 1;
    else if (value === 'online') online += 1;
    else unknown += 1;
  }
  return { offline, online, unknown };
}

export function parseExploreParams(params: URLSearchParams): ExploreFilters {
  const sort = params.get('sort');
  return {
    query: params.get('q') || '',
    category: params.get('category') || 'all',
    type: params.get('type') || 'all',
    publisher: params.get('publisher') || 'all',
    originals: params.get('filter') === 'originals',
    featured: params.get('featured') === 'true',
    platform: (['android', 'web', 'both'].includes(params.get('platform') || '')
      ? params.get('platform')
      : 'all') as PlatformFilter,
    availability: (['offline', 'online'].includes(params.get('availability') || '')
      ? params.get('availability')
      : 'all') as AvailabilityFilter,
    sort: (['name', 'updated', 'type'].includes(sort || '') ? sort : 'newest') as ExploreSort,
  };
}

/** Defaults are omitted so /explore stays canonical and shareable links stay short. */
export function toExploreParams(filters: ExploreFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.type !== 'all') params.set('type', filters.type);
  if (filters.originals) params.set('filter', 'originals');
  if (filters.featured) params.set('featured', 'true');
  if (filters.publisher !== 'all') params.set('publisher', filters.publisher);
  if (filters.platform !== 'all') params.set('platform', filters.platform);
  if (filters.availability !== 'all') params.set('availability', filters.availability);
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  return params;
}

export function hasActiveFilters(filters: ExploreFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.category !== 'all' ||
    filters.type !== 'all' ||
    filters.originals ||
    filters.featured ||
    filters.publisher !== 'all' ||
    filters.platform !== 'all' ||
    filters.availability !== 'all'
  );
}
