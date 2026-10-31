/**
 * Item 10 / Batch 2 — Recently viewed integration helpers.
 *
 * The thin layer between the pure model (Batch 1) and the UI: it decides what
 * counts as a genuine visit, resolves stored history against the current
 * published catalog, and exposes the two user actions (clear, opt out) so the
 * Library page never touches storage directly.
 *
 * Rules enforced here:
 *  - Only a published app's real detail page records a visit.
 *  - Unpublished and unknown apps stay in storage but never render.
 *  - Clearing history removes history only. Saved apps, Lab wishlist, compare,
 *    update watch and download records live in other keys and are untouched.
 */

import {
  PERSONALIZATION_LIMITS,
  type CatalogAppLike,
  type PersonalizationState,
  clearRecentHistory,
  normalizeSlug,
  recordView,
  resolveRecentApps,
  removeRecentView,
  setPersonalizationOptions,
} from './model';
import { loadPersonalization, updatePersonalization } from './store';

export interface VisibleRecent<T extends CatalogAppLike> {
  app: T;
  at: number;
}

export interface VisibleRecentResult<T extends CatalogAppLike> {
  /** Newest first, published only. */
  items: VisibleRecent<T>[];
  /** Stored entries whose app is unpublished or no longer in the catalog. */
  hidden: number;
}

/**
 * Record a visit to a detail page. `published` must be the catalog's own flag:
 * anything other than `true` is ignored, so a draft or a stray route can never
 * enter history.
 */
export function recordPublishedVisit(
  slug: unknown,
  published: unknown,
  now: number = Date.now()
): boolean {
  if (published !== true || !normalizeSlug(slug)) return false;
  let changed = false;
  updatePersonalization((state) => {
    const next = recordView(state, slug, now);
    changed = next !== state;
    return next;
  }, now);
  return changed;
}

/** Resolve stored history against published catalog records only. */
export function resolveVisibleRecent<T extends CatalogAppLike>(
  catalog: T[],
  state: PersonalizationState,
  limit: number = PERSONALIZATION_LIMITS.recent
): VisibleRecentResult<T> {
  const resolved = resolveRecentApps(state, catalog, limit);
  return {
    items: resolved.items.map((entry) => ({ app: entry.app, at: entry.at })),
    hidden: resolved.hidden,
  };
}

/** User action: forget the view history. Nothing else is touched. */
export function clearRecentlyViewed(): PersonalizationState {
  return updatePersonalization((state) => clearRecentHistory(state));
}

/** Single-row removal from the history list. */
export function forgetVisit(slug: unknown): PersonalizationState {
  return updatePersonalization((state) => removeRecentView(state, slug));
}

/**
 * Switch history recording on or off. Turning it off stops new visits from
 * being recorded and keeps every existing entry, so the visitor's history is
 * still there if they turn it back on.
 */
export function setRecentRecording(enabled: boolean): PersonalizationState {
  return updatePersonalization((state) =>
    setPersonalizationOptions(state, { recentEnabled: enabled })
  );
}

/** Current recording preference, read directly from storage. */
export function isRecentRecordingEnabled(now: number = Date.now()): boolean {
  return loadPersonalization(now).preferences.recentEnabled;
}
