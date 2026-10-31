/**
 * AppMintly 2.0 — unified wishlist layer (Item 3).
 *
 * Two honest local stores already exist and are NOT replaced:
 *   1. catalog favourites  `appforge_local_favorites`  (string[] of app ids)
 *   2. Lab wishlist        `appmintly_upcoming_wishlist_v1` (id -> savedAt)
 *
 * A published app can be saved in EITHER store (the Lab wishlist keeps
 * roadmap ids such as `catalog-cineflow`, the favourites keep `cineflow`).
 * This module turns both into one de-duplicated list keyed on the canonical
 * published app id, so the Library can show each app exactly once while both
 * stores keep their own data and semantics.
 *
 * Pure: no storage access, no React, no I/O. Callers pass the raw ids.
 */

import { platformOf, webUrlOf } from '@/lib/catalog/explore-filters';

export interface WishlistAppLike {
  id: string;
  slug?: string;
  name: string;
  category?: string;
  type?: string;
  version?: string;
  developer?: string;
  developerSlug?: string;
  published?: boolean;
  apk?: { enabled?: boolean; verified?: boolean; sha256?: string; apkUrl?: string } | null;
  apkUrl?: string;
  launchUrl?: string;
  pwaUrl?: string;
  url?: string;
}

export interface WishlistRoadmapLike {
  id: string;
  slug?: string;
  catalogSlug?: string;
  name?: string;
}

export interface WishlistEntry<A extends WishlistAppLike = WishlistAppLike> {
  app: A;
  /** Which stores hold this app. `saved` = favourites, `lab` = Lab wishlist. */
  sources: { saved: boolean; lab: boolean };
  /** Raw Lab wishlist ids that resolve to this app (needed to remove them). */
  labIds: string[];
  /** 'Android + Web' | 'Android APK' | 'Web app' | 'Not specified' */
  platform: string;
  /** True when the same app was found in both stores. */
  duplicatesMerged: boolean;
}

export interface MergeWishlistInput<A extends WishlistAppLike = WishlistAppLike> {
  catalogIds: unknown;
  labIds: unknown;
  apps: A[];
  roadmap: WishlistRoadmapLike[];
}

export interface MergeWishlistResult<A extends WishlistAppLike = WishlistAppLike> {
  entries: WishlistEntry<A>[];
  stats: {
    total: number;
    savedOnly: number;
    labOnly: number;
    mergedFromBoth: number;
    /** Unknown / unpublished / unmapped ids that were dropped. */
    droppedInvalid: number;
    /** Repeated ids that were collapsed. */
    droppedDuplicates: number;
  };
}

const NOT_SPECIFIED = 'Not specified';

/** Human label for where an app can actually be used. */
export function platformLabelFor(app: WishlistAppLike | undefined | null): string {
  if (!app) return NOT_SPECIFIED;
  switch (platformOf(app as never)) {
    case 'both':
      return 'Android + Web';
    case 'android':
      return 'Android APK';
    case 'web':
      return 'Web app';
    default:
      return NOT_SPECIFIED;
  }
}

/** Whether the app has a real web target to launch. */
export function hasWebTarget(app: WishlistAppLike | undefined | null): boolean {
  return Boolean(app && webUrlOf(app as never));
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function isPublished(app: WishlistAppLike): boolean {
  // Fail closed: only an explicit `published: true` or an absent flag on a
  // catalog record that the caller already filtered. `false` always wins.
  return app.published !== false;
}

/**
 * Merge both stores into one de-duplicated list of published apps.
 *
 * Ordering: Lab saves are ordered by the roadmap order passed in, favourites
 * keep their stored order; favourites come first because that is the store the
 * AppCard bookmark writes to (the primary save action).
 */
export function mergeWishlist<A extends WishlistAppLike>({
  catalogIds,
  labIds,
  apps,
  roadmap,
}: MergeWishlistInput<A>): MergeWishlistResult<A> {
  const byKey = new Map<string, A>();
  for (const app of apps) {
    if (!app || typeof app.id !== 'string' || !app.id) continue;
    if (!byKey.has(app.id)) byKey.set(app.id, app);
    if (app.slug) byKey.set(app.slug, app);
  }

  const entries = new Map<string, WishlistEntry<A>>();
  let droppedInvalid = 0;
  let droppedDuplicates = 0;

  const push = (app: A, source: 'saved' | 'lab', labId?: string) => {
    const existing = entries.get(app.id);
    if (existing) {
      if (source === 'saved') existing.sources.saved = true;
      if (source === 'lab') {
        existing.sources.lab = true;
        if (labId && !existing.labIds.includes(labId)) existing.labIds.push(labId);
      }
      existing.duplicatesMerged = existing.sources.saved && existing.sources.lab;
      droppedDuplicates += 1;
      return;
    }
    entries.set(app.id, {
      app,
      sources: { saved: source === 'saved', lab: source === 'lab' },
      labIds: labId ? [labId] : [],
      platform: platformLabelFor(app),
      duplicatesMerged: false,
    });
  };

  const seenCatalog = new Set<string>();
  for (const rawId of toStringList(catalogIds)) {
    const key = rawId.trim();
    if (seenCatalog.has(key.toLowerCase())) {
      droppedDuplicates += 1;
      continue;
    }
    seenCatalog.add(key.toLowerCase());
    const app = byKey.get(key) || byKey.get(key.toLowerCase());
    if (!app || !isPublished(app)) {
      droppedInvalid += 1;
      continue;
    }
    push(app, 'saved');
  }

  const roadmapById = new Map<string, WishlistRoadmapLike>();
  for (const record of roadmap) {
    if (record && typeof record.id === 'string') roadmapById.set(record.id, record);
  }

  const seenLab = new Set<string>();
  for (const rawId of toStringList(labIds)) {
    const labId = rawId.trim();
    if (seenLab.has(labId)) {
      droppedDuplicates += 1;
      continue;
    }
    seenLab.add(labId);
    const record = roadmapById.get(labId);
    const targetSlug = record?.catalogSlug || record?.slug || labId;
    const app = byKey.get(targetSlug) || byKey.get(targetSlug.toLowerCase());
    if (!app || !isPublished(app)) {
      // A Lab save for an app that is not (or no longer) in the published
      // catalog is simply not shown — the Lab store itself is untouched.
      droppedInvalid += 1;
      continue;
    }
    push(app, 'lab', labId);
  }

  const list = Array.from(entries.values());
  return {
    entries: list,
    stats: {
      total: list.length,
      savedOnly: list.filter((e) => e.sources.saved && !e.sources.lab).length,
      labOnly: list.filter((e) => e.sources.lab && !e.sources.saved).length,
      mergedFromBoth: list.filter((e) => e.sources.saved && e.sources.lab).length,
      droppedInvalid,
      droppedDuplicates,
    },
  };
}

/** Local search across the saved list (name, category, type, developer). */
export function searchWishlist<A extends WishlistAppLike>(entries: WishlistEntry<A>[], query: string): WishlistEntry<A>[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(({ app }) => {
    const hay = [app.name, app.category, app.type, app.developer, app.developerSlug]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Which stores a removal must touch for this entry. */
export function removalTargets<A extends WishlistAppLike>(
  entry: WishlistEntry<A> | undefined | null
): { catalog: boolean; labIds: string[] } {
  if (!entry) return { catalog: false, labIds: [] };
  return { catalog: entry.sources.saved, labIds: [...entry.labIds] };
}
