/**
 * Item 10 / Batch 3 — category preferences and recommendation visibility.
 *
 * Pure helpers only: catalog validation for the preference chips and the
 * signal threshold that decides whether a recommendation block is honest
 * enough to render. No storage access, no React.
 */

import {
  PERSONALIZATION_LIMITS,
  isPublishedCatalogApp,
  normalizeCategory,
  setCategoryPreferences,
  type CatalogAppLike,
  type PersonalizationState,
} from './model';

/** At least two viewed apps is the weakest history signal worth acting on. */
export const MIN_VIEWS_FOR_RECOMMENDATIONS = 2;

export interface RecommendationSignals {
  views: number;
  saved: number;
  categories: number;
}

/**
 * Counts only real signals: published history, saved apps from the existing
 * favourites store (read-only) and followed categories. There is no
 * popularity, rating, download or engagement input anywhere.
 */
export function recommendationSignals(
  state: PersonalizationState,
  savedSlugs: unknown[] = []
): RecommendationSignals {
  return {
    views: state.recent.length,
    saved: savedSlugs.filter((slug) => typeof slug === 'string' && slug.trim() !== '').length,
    categories: state.preferences.categories.length,
  };
}

/**
 * The UI gate: 2+ viewed apps, or 1 saved app, or 1 followed category.
 * Below that the engine has nothing factual to say, so nothing renders.
 */
export function hasRecommendationSignal(
  state: PersonalizationState,
  savedSlugs: unknown[] = []
): boolean {
  const signals = recommendationSignals(state, savedSlugs);
  return (
    signals.views >= MIN_VIEWS_FOR_RECOMMENDATIONS ||
    signals.saved >= 1 ||
    signals.categories >= 1
  );
}

/** Categories that genuinely exist on published catalog records. */
export function catalogCategories(catalog: CatalogAppLike[]): string[] {
  const seen = new Map<string, string>();
  for (const app of catalog) {
    if (!isPublishedCatalogApp(app)) continue;
    const category = normalizeCategory(app.category);
    if (!category) continue;
    const key = category.toLowerCase();
    if (!seen.has(key)) seen.set(key, category);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export interface CategorySelectionResult {
  /** Canonical catalog spellings, de-duplicated and capped. */
  categories: string[];
  /** Inputs that are not real catalog categories. */
  rejected: string[];
}

/**
 * Validate a raw selection against the catalog. Unknown, malformed and
 * out-of-catalog categories are rejected rather than stored, so a preference
 * can never point at a category AppMintly cannot actually recommend.
 */
export function sanitizeCategorySelection(
  catalog: CatalogAppLike[],
  input: unknown[]
): CategorySelectionResult {
  const allowed = new Map<string, string>();
  for (const category of catalogCategories(catalog)) {
    allowed.set(category.toLowerCase(), category);
  }
  const categories: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input) ? input : []) {
    const normalized = normalizeCategory(raw);
    if (!normalized) {
      rejected.push(String(raw));
      continue;
    }
    const canonical = allowed.get(normalized.toLowerCase());
    if (!canonical) {
      rejected.push(normalized);
      continue;
    }
    if (seen.has(canonical.toLowerCase())) continue;
    if (categories.length >= PERSONALIZATION_LIMITS.categories) {
      rejected.push(canonical);
      continue;
    }
    seen.add(canonical.toLowerCase());
    categories.push(canonical);
  }
  return { categories, rejected };
}

export function isCategorySelected(state: PersonalizationState, category: unknown): boolean {
  const target = normalizeCategory(category);
  if (!target) return false;
  return state.preferences.categories.some((entry) => entry.toLowerCase() === target.toLowerCase());
}

/** Replace the selection with catalog-validated values. */
export function setCategoriesFromCatalog(
  state: PersonalizationState,
  catalog: CatalogAppLike[],
  input: unknown[]
): PersonalizationState {
  const { categories } = sanitizeCategorySelection(catalog, input);
  return setCategoryPreferences(state, categories);
}

/** Add or remove one category chip. */
export function toggleCatalogCategory(
  state: PersonalizationState,
  catalog: CatalogAppLike[],
  category: unknown
): PersonalizationState {
  const { categories } = sanitizeCategorySelection(catalog, [category]);
  const canonical = categories[0];
  if (!canonical) return state;
  const current = state.preferences.categories;
  const exists = current.some((entry) => entry.toLowerCase() === canonical.toLowerCase());
  const next = exists
    ? current.filter((entry) => entry.toLowerCase() !== canonical.toLowerCase())
    : [...current, canonical];
  return setCategoriesFromCatalog(state, catalog, next);
}
