/**
 * Publisher + platform statistics: ONE pure aggregation layer.
 *
 * Every number shown on the Verified Publishers section, the platform
 * discovery section and the publisher profile is computed here from the
 * canonical catalog the app already loads (CatalogContext). There is no
 * second catalog, no hardcoded count and no sample-data fallback.
 *
 * Eligibility: callers pass `publishedApps` — the catalog already filtered
 * through the project's public-publication rules (getPublishedApps /
 * isValidPublicApp). Drafts, archived records and demo fixtures never reach
 * this module, so none of these counts can leak unpublished records.
 *
 * Pure functions, no React / no I/O: unit-testable from a script.
 */

import { hasAuthoritativeApkRelease } from '@/lib/distribution';

export interface StatsApp {
  slug: string;
  name?: string;
  version?: string;
  category?: string;
  type?: string;
  developerSlug?: string;
  lastUpdated?: string;
  updatedAt?: string;
  releaseDate?: string;
  apk?: {
    enabled?: boolean;
    verified?: boolean;
    sha256?: string;
    apkUrl?: string;
  } | null;
  apkUrl?: string;
}

/** Parse a date-ish string. Returns NaN-safe `null` for missing/invalid. */
export function parseTime(value: string | undefined | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * Best actual update timestamp for an app, from real metadata only:
 * lastUpdated → updatedAt → releaseDate. Returns null when none is valid
 * (we never invent a timestamp).
 *
 * A date-only `lastUpdated` ("2026-10-08") carries no time-of-day; when the
 * record also has a full `updatedAt` on the SAME calendar day we prefer that
 * more precise instant so same-day updates order deterministically.
 */
export function getUpdateTime(app: StatsApp): number | null {
  const last = parseTime(app.lastUpdated);
  const upd = parseTime(app.updatedAt);
  const rel = parseTime(app.releaseDate);
  if (last !== null) {
    if (
      upd !== null &&
      typeof app.lastUpdated === 'string' &&
      typeof app.updatedAt === 'string' &&
      app.updatedAt.startsWith(app.lastUpdated.slice(0, 10))
    ) {
      return upd;
    }
    return last;
  }
  return upd ?? rel;
}

/**
 * Sort newest-first by real update metadata. Apps with NO valid timestamp
 * sort last; ties break by name then slug so the order is deterministic and
 * never depends on array position.
 */
export function sortByRecentUpdate<T extends StatsApp>(apps: readonly T[]): T[] {
  return [...apps].sort((a, b) => {
    const ta = getUpdateTime(a);
    const tb = getUpdateTime(b);
    if (ta === null && tb !== null) return 1;
    if (tb === null && ta !== null) return -1;
    if (ta !== null && tb !== null && ta !== tb) return tb - ta;
    return (a.name || a.slug).localeCompare(b.name || b.slug) || a.slug.localeCompare(b.slug);
  });
}

/** Normalised category key so "Health" / " health " count once. */
function categoryKey(category: string | undefined): string | null {
  const k = (category || '').trim().toLowerCase();
  return k.length > 0 ? k : null;
}

export interface PublisherStats<T extends StatsApp = StatsApp> {
  /** Eligible (published) apps belonging to the publisher, newest update first. */
  apps: T[];
  /** Total apps this publisher has in the public catalog. */
  totalApps: number;
  /** Apps meeting the public publication rules (== totalApps for the public catalog). */
  publishedApps: number;
  /** Version label of the most recently updated app, or null if unknown. */
  latestVersion: string | null;
  /** Name of that app (for an honest "where does this version come from" label). */
  latestVersionApp: string | null;
  /** Distinct categories across the publisher's eligible apps. */
  categoryCount: number;
}

/**
 * Aggregate everything the publisher profile and the Verified Publishers
 * card need from the already-eligible catalog.
 */
export function computePublisherStats<T extends StatsApp>(
  eligibleApps: readonly T[],
  publisherSlug: string
): PublisherStats<T> {
  const wanted = publisherSlug.trim().toLowerCase();
  // De-duplicate by slug so a record can never be counted twice.
  const seen = new Set<string>();
  const own: T[] = [];
  for (const app of eligibleApps) {
    if ((app.developerSlug || '').trim().toLowerCase() !== wanted) continue;
    const key = app.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    own.push(app);
  }

  const sorted = sortByRecentUpdate(own);
  const newest = sorted[0];
  const cats = new Set<string>();
  for (const a of own) {
    const k = categoryKey(a.category);
    if (k) cats.add(k);
  }

  const version = newest?.version && newest.version.trim() ? newest.version.trim() : null;

  return {
    apps: sorted,
    totalApps: own.length,
    publishedApps: own.length,
    latestVersion: version,
    latestVersionApp: version ? newest?.name || newest?.slug || null : null,
    categoryCount: cats.size,
  };
}

export interface PlatformCount {
  /** The catalog `type` value — the same string /explore?type= filters on. */
  type: string;
  count: number;
}

/**
 * Count eligible apps per catalog `type`. Each app is counted exactly once
 * (one `type` per record) — never once per platform / URL / release.
 */
export function computePlatformCounts(eligibleApps: readonly StatsApp[]): PlatformCount[] {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const a of eligibleApps) {
    if (seen.has(a.slug)) continue;
    seen.add(a.slug);
    const key = (a.type || '').trim() || 'Other';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * Apps with a REAL verified production APK (release-pipeline evidence), not
 * merely `type === 'Android APK'`. Each app counted once.
 */
export function countAuthoritativeApks(eligibleApps: readonly StatsApp[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const a of eligibleApps) {
    if (seen.has(a.slug)) continue;
    seen.add(a.slug);
    if (hasAuthoritativeApkRelease(a)) n += 1;
  }
  return n;
}

export interface PublisherSummary {
  slug: string;
  name: string;
  verified: boolean;
  appCount: number;
}

/**
 * Per-publisher published-app counts for the Verified Publishers section,
 * from the same eligibility source as the profile page. Publishers with no
 * eligible apps are omitted (never shown with a fabricated count).
 */
export function summarizePublishers(
  eligibleApps: readonly StatsApp[],
  publishers: ReadonlyArray<{ slug: string; name: string; verified: boolean }>
): PublisherSummary[] {
  return publishers
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      verified: Boolean(p.verified),
      appCount: computePublisherStats(eligibleApps, p.slug).totalApps,
    }))
    .filter((p) => p.appCount > 0);
}
