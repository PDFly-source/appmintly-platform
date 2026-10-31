/**
 * AppMintly 2.0 — Item 10 personalization foundation (pure model).
 *
 * Everything here is a pure function over catalog facts and a versioned local
 * state object. No React, no window, no storage: the same inputs always produce
 * the same output, which is what makes recommendations explainable and testable
 * and what keeps the first render identical on the server and in the browser.
 *
 * Honesty rules baked into this module:
 *  - Only catalogued facts may influence a score: category, type, tags,
 *    publisher and real release/update dates. There is no popularity, download,
 *    rating or engagement signal anywhere, because AppMintly does not have
 *    reliable numbers for those and must never invent them.
 *  - A reason is emitted only for the signal that actually contributed to the
 *    score of that app. No generic "you might like this" filler.
 *  - Apps that are not published are never resolved or recommended, but their
 *    stored slugs are kept on disk: hiding is a read-time decision, deleting is
 *    the user's decision.
 */

/** Storage key — versioned, following the existing `appmintly.*` convention. */
export const PERSONALIZATION_STORAGE_KEY = 'appmintly.personalization.v1';

/** Schema version. Bump only with a migration in MIGRATIONS. */
export const PERSONALIZATION_SCHEMA_VERSION = 1 as const;

/** Window event fired after a successful local write (same tab + listeners). */
export const PERSONALIZATION_EVENT = 'appmintly_personalization_updated';

/** Hard caps. Anything longer is trimmed on the way in and out. */
export const PERSONALIZATION_LIMITS = {
  recent: 24,
  seen: 200,
  categories: 12,
  /** Personal collections (Item 10 / Batch 4). */
  collections: 20,
  collectionApps: 50,
} as const;

/** Scoring weights, exported so tests assert the real contract. */
export const RECOMMENDATION_WEIGHTS = {
  followedCategory: 5,
  savedCategory: 3,
  viewedCategory: 2,
  sharedTag: 1,
  sharedTagCap: 4,
  sameType: 2,
  freshness: 1,
} as const;

/** A release/update inside this window counts as "recent" (real dates only). */
export const FRESH_WINDOW_DAYS = 90;

/** Clock skew tolerance for a stored timestamp from another tab. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Catalog slugs are lowercase alphanumeric with single hyphens. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Category names are display strings, not slugs. */
const MAX_CATEGORY_LENGTH = 48;

export interface PersonalizationPreferences {
  /** Categories the visitor explicitly follows (catalog display names). */
  categories: string[];
  /** Whether personalized recommendations may be shown at all. */
  recommendations: boolean;
  /** Whether recent history may be recorded and shown. */
  recentEnabled: boolean;
}

export interface RecentEntry {
  slug: string;
  /** Epoch milliseconds, validated and clamped on read. */
  at: number;
}

/**
 * A visitor's own collection (Item 10 / Batch 4). Purely local: no id from the
 * server, no sharing, no publish flag. `apps` holds catalog slugs only.
 */
export interface PersonalizationCollection {
  id: string;
  name: string;
  description: string;
  apps: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonalizationState {
  version: typeof PERSONALIZATION_SCHEMA_VERSION;
  recent: RecentEntry[];
  /** Slugs already shown as recommendations, so they are not repeated. */
  seen: string[];
  /** Visitor-created collections. Added in Batch 4 as an optional field. */
  collections: PersonalizationCollection[];
  preferences: PersonalizationPreferences;
  lastVisit: number | null;
}

export interface SanitizeResult {
  state: PersonalizationState;
  /** How many individual values were rejected, trimmed or repaired. */
  dropped: number;
  /** True when the payload could not be trusted at all and was reset. */
  reset: boolean;
  /** Machine-readable reason for a reset, null when nothing was reset. */
  reason: string | null;
}

/** Minimal structural shape this module needs from a catalog record. */
export interface CatalogAppLike {
  slug: string;
  name?: string;
  published?: boolean;
  category?: string;
  type?: string;
  tags?: string[];
  developerSlug?: string;
  updatedAt?: string;
  lastUpdated?: string;
  publishedAt?: string;
}

export function emptyPersonalization(): PersonalizationState {
  return {
    version: PERSONALIZATION_SCHEMA_VERSION,
    recent: [],
    collections: [],
    seen: [],
    preferences: { categories: [], recommendations: true, recentEnabled: true },
    lastVisit: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalise a candidate slug. Returns null for anything that is not shaped
 * like a catalog slug, so a hand-edited storage payload cannot smuggle markup
 * or a path into a link.
 */
export function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return SLUG_PATTERN.test(trimmed) ? trimmed : null;
}

/** Normalise a category display name. Returns null when unusable. */
export function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > MAX_CATEGORY_LENGTH) return null;
  // Display names only: letters, digits, spaces, ampersands, hyphens, slashes.
  if (!/^[\p{L}\p{N} &\-/]+$/u.test(trimmed)) return null;
  return trimmed;
}

function sanitizeSlugList(
  raw: unknown,
  cap: number,
  droppedRef: { n: number }
): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    droppedRef.n += 1;
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const slug = normalizeSlug(item);
    if (!slug) {
      droppedRef.n += 1;
      continue;
    }
    if (seen.has(slug)) {
      droppedRef.n += 1;
      continue;
    }
    if (out.length >= cap) {
      droppedRef.n += 1;
      continue;
    }
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function sanitizeRecent(raw: unknown, now: number, droppedRef: { n: number }): RecentEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    droppedRef.n += 1;
    return [];
  }
  const out: RecentEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) {
      droppedRef.n += 1;
      continue;
    }
    const slug = normalizeSlug(item.slug);
    const at = item.at;
    if (!slug || typeof at !== 'number' || !Number.isFinite(at) || at <= 0) {
      droppedRef.n += 1;
      continue;
    }
    if (seen.has(slug)) {
      // Keep the newest timestamp for a slug instead of two rows.
      droppedRef.n += 1;
      const existing = out.find((entry) => entry.slug === slug);
      if (existing && at > existing.at) existing.at = Math.min(at, now + MAX_FUTURE_SKEW_MS);
      continue;
    }
    if (out.length >= PERSONALIZATION_LIMITS.recent) {
      droppedRef.n += 1;
      continue;
    }
    seen.add(slug);
    out.push({ slug, at: Math.min(Math.round(at), now + MAX_FUTURE_SKEW_MS) });
  }
  return out.sort((a, b) => b.at - a.at);
}

function sanitizePreferences(raw: unknown, droppedRef: { n: number }): PersonalizationPreferences {
  const base = emptyPersonalization().preferences;
  if (raw === undefined) return base;
  if (!isRecord(raw)) {
    droppedRef.n += 1;
    return base;
  }
  const categories: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.categories)) {
    for (const item of raw.categories) {
      const category = normalizeCategory(item);
      if (!category) {
        droppedRef.n += 1;
        continue;
      }
      const key = category.toLowerCase();
      if (seen.has(key)) {
        droppedRef.n += 1;
        continue;
      }
      if (categories.length >= PERSONALIZATION_LIMITS.categories) {
        droppedRef.n += 1;
        continue;
      }
      seen.add(key);
      categories.push(category);
    }
  } else if (raw.categories !== undefined) {
    droppedRef.n += 1;
  }
  const bool = (value: unknown, fallback: boolean): boolean => {
    if (typeof value === 'boolean') return value;
    if (value !== undefined) droppedRef.n += 1;
    return fallback;
  };
  return {
    categories,
    recommendations: bool(raw.recommendations, base.recommendations),
    recentEnabled: bool(raw.recentEnabled, base.recentEnabled),
  };
}

/**
 * Migrations for future schema versions. A v1 payload needs no migration, and a
 * payload from an unknown future version is reset rather than guessed at.
 */
const MIGRATIONS: Record<number, (input: Record<string, unknown>) => Record<string, unknown>> = {};

const COLLECTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_COLLECTION_NAME = 40;
const MAX_COLLECTION_DESCRIPTION = 160;

/**
 * Sanitize the collections array. A v1 payload written before Batch 4 simply
 * has no `collections` key, which reads as an empty list; nothing about the
 * existing fields changes, so no migration is needed and no stored history is
 * touched.
 */
function sanitizeCollections(
  raw: unknown,
  droppedRef: { n: number }
): PersonalizationCollection[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    droppedRef.n += 1;
    return [];
  }
  const out: PersonalizationCollection[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    if (out.length >= PERSONALIZATION_LIMITS.collections) {
      droppedRef.n += 1;
      continue;
    }
    if (!isRecord(entry)) {
      droppedRef.n += 1;
      continue;
    }
    const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
    if (!COLLECTION_ID_PATTERN.test(id) || ids.has(id)) {
      droppedRef.n += 1;
      continue;
    }
    const name =
      typeof entry.name === 'string'
        ? entry.name.trim().replace(/\s+/g, ' ').slice(0, MAX_COLLECTION_NAME)
        : '';
    if (name === '') {
      droppedRef.n += 1;
      continue;
    }
    const description =
      typeof entry.description === 'string'
        ? entry.description.trim().slice(0, MAX_COLLECTION_DESCRIPTION)
        : '';
    const apps = sanitizeSlugList(entry.apps, PERSONALIZATION_LIMITS.collectionApps, droppedRef);
    const createdAt =
      typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) && entry.createdAt > 0
        ? Math.round(entry.createdAt)
        : 0;
    const updatedAt =
      typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) && entry.updatedAt > 0
        ? Math.round(entry.updatedAt)
        : createdAt;
    ids.add(id);
    out.push({ id, name, description, apps, createdAt, updatedAt });
  }
  return out;
}

/**
 * Validate an already-parsed payload. Never throws. Anything that is not a
 * recognisable versioned object yields a clean empty state with `reset: true`
 * and a reason, so the caller can log or explain instead of crashing.
 */
export function sanitizePersonalization(raw: unknown, now: number = Date.now()): SanitizeResult {
  const droppedRef = { n: 0 };
  if (raw === undefined) {
    // No stored value at all: a first visit, not a corrupt payload.
    return { state: emptyPersonalization(), dropped: 0, reset: false, reason: null };
  }
  if (!isRecord(raw)) {
    return { state: emptyPersonalization(), dropped: 0, reset: true, reason: 'not-an-object' };
  }
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { state: emptyPersonalization(), dropped: 0, reset: true, reason: 'missing-version' };
  }
  let payload: Record<string, unknown> = raw;
  if (version !== PERSONALIZATION_SCHEMA_VERSION) {
    if (version > PERSONALIZATION_SCHEMA_VERSION) {
      // Written by a newer build of the site. Do not guess at its meaning.
      return { state: emptyPersonalization(), dropped: 0, reset: true, reason: 'future-version' };
    }
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      return { state: emptyPersonalization(), dropped: 0, reset: true, reason: `no-migration-from-${version}` };
    }
    payload = migrate(raw);
  }
  const state: PersonalizationState = {
    version: PERSONALIZATION_SCHEMA_VERSION,
    recent: sanitizeRecent(payload.recent, now, droppedRef),
    seen: sanitizeSlugList(payload.seen, PERSONALIZATION_LIMITS.seen, droppedRef),
    collections: sanitizeCollections(payload.collections, droppedRef),
    preferences: sanitizePreferences(payload.preferences, droppedRef),
    lastVisit:
      typeof payload.lastVisit === 'number' &&
      Number.isFinite(payload.lastVisit) &&
      payload.lastVisit > 0
        ? Math.min(Math.round(payload.lastVisit), now + MAX_FUTURE_SKEW_MS)
        : null,
  };
  if (payload.lastVisit !== undefined && state.lastVisit === null) droppedRef.n += 1;
  return { state, dropped: droppedRef.n, reset: false, reason: null };
}

/**
 * Safe parse of a raw localStorage string. Corrupt JSON is a reset, not a crash
 * and not a silent partial read.
 */
export function parsePersonalization(raw: string | null, now: number = Date.now()): SanitizeResult {
  if (raw === null || raw === '') {
    return { state: emptyPersonalization(), dropped: 0, reset: false, reason: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: emptyPersonalization(), dropped: 0, reset: true, reason: 'invalid-json' };
  }
  return sanitizePersonalization(parsed, now);
}

/** Serialise state for storage. Always the current version and caps. */
export function serializePersonalization(state: PersonalizationState): string {
  return JSON.stringify(state);
}

/* ------------------------------------------------------------------ *
 * Pure reducers — the only way state is allowed to change.
 * ------------------------------------------------------------------ */

/** Record a real view. Dedupes, caps, and respects the recent opt-out. */
export function recordView(
  state: PersonalizationState,
  slug: unknown,
  at: number = Date.now()
): PersonalizationState {
  const normalized = normalizeSlug(slug);
  if (!normalized || !state.preferences.recentEnabled) return state;
  const rest = state.recent.filter((entry) => entry.slug !== normalized);
  const recent = [{ slug: normalized, at }, ...rest].slice(0, PERSONALIZATION_LIMITS.recent);
  return { ...state, recent };
}

/** Mark slugs as already recommended. Dedupes and keeps the newest at the end. */
export function markAppsSeen(state: PersonalizationState, slugs: unknown[]): PersonalizationState {
  const incoming: string[] = [];
  for (const raw of slugs) {
    const slug = normalizeSlug(raw);
    if (slug && !incoming.includes(slug)) incoming.push(slug);
  }
  if (incoming.length === 0) return state;
  const merged = [...state.seen.filter((slug) => !incoming.includes(slug)), ...incoming];
  return { ...state, seen: merged.slice(-PERSONALIZATION_LIMITS.seen) };
}

/** Replace the followed categories with a sanitized, capped list. */
export function setCategoryPreferences(
  state: PersonalizationState,
  categories: unknown[]
): PersonalizationState {
  const droppedRef = { n: 0 };
  const prefs = sanitizePreferences({ ...state.preferences, categories }, droppedRef);
  return { ...state, preferences: prefs };
}

/** Toggle the two personalization switches. */
export function setPersonalizationOptions(
  state: PersonalizationState,
  patch: Partial<Pick<PersonalizationPreferences, 'recommendations' | 'recentEnabled'>>
): PersonalizationState {
  const preferences: PersonalizationPreferences = {
    ...state.preferences,
    recommendations:
      typeof patch.recommendations === 'boolean'
        ? patch.recommendations
        : state.preferences.recommendations,
    recentEnabled:
      typeof patch.recentEnabled === 'boolean'
        ? patch.recentEnabled
        : state.preferences.recentEnabled,
  };
  // Disabling recent history stops recording; it does not silently wipe what
  // the visitor already has. Clearing is an explicit action.
  return { ...state, preferences };
}

/** Explicit user action: forget the view history. */
export function clearRecentHistory(state: PersonalizationState): PersonalizationState {
  return { ...state, recent: [] };
}

/** Explicit user action: forget a single visit (Library row removal). */
export function removeRecentView(
  state: PersonalizationState,
  slug: unknown
): PersonalizationState {
  const target = normalizeSlug(slug);
  if (!target) return state;
  const recent = state.recent.filter((entry) => entry.slug !== target);
  return recent.length === state.recent.length ? state : { ...state, recent };
}

/** Explicit user action: forget recommendation memory as well. */
export function clearSeen(state: PersonalizationState): PersonalizationState {
  return { ...state, seen: [] };
}

/** Explicit user action: remove all personalization from this browser. */
export function resetPersonalization(): PersonalizationState {
  return emptyPersonalization();
}

/* ------------------------------------------------------------------ *
 * Catalog resolution — published-only, at read time.
 * ------------------------------------------------------------------ */

export interface ResolvedRecent<T extends CatalogAppLike> {
  app: T;
  at: number;
}

export interface ResolveRecentResult<T extends CatalogAppLike> {
  items: ResolvedRecent<T>[];
  /** Stored entries that resolved to nothing (unpublished, unknown, malformed). */
  hidden: number;
}

/** A record counts as published only when the catalog says so. */
export function isPublishedCatalogApp(app: CatalogAppLike | null | undefined): boolean {
  return !!app && app.published === true;
}

/**
 * Resolve recent slugs to catalog records. Unpublished and unknown entries are
 * counted as hidden and left in storage untouched, matching the Library rule
 * from Item 3.
 */
export function resolveRecentApps<T extends CatalogAppLike>(
  state: PersonalizationState,
  catalog: T[],
  limit: number = PERSONALIZATION_LIMITS.recent
): ResolveRecentResult<T> {
  const bySlug = new Map<string, T>();
  for (const app of catalog) {
    if (!isPublishedCatalogApp(app)) continue;
    const slug = normalizeSlug(app.slug);
    if (slug) bySlug.set(slug, app);
  }
  const items: ResolvedRecent<T>[] = [];
  let hidden = 0;
  for (const entry of state.recent) {
    const app = bySlug.get(entry.slug);
    if (!app) {
      hidden += 1;
      continue;
    }
    if (items.length >= limit) break;
    items.push({ app, at: entry.at });
  }
  return { items, hidden };
}

/* ------------------------------------------------------------------ *
 * Recommendations — catalog facts only, explainable, deterministic.
 * ------------------------------------------------------------------ */

export interface RecommendInput<T extends CatalogAppLike> {
  /** Published catalog records. Pass `publishedApps` from useCatalog. */
  catalog: T[];
  state: PersonalizationState;
  /** Slugs saved in the existing favourites/wishlist stores (read-only). */
  savedSlugs?: string[];
  /** Real clock value, injected so scoring stays deterministic in tests. */
  now?: number;
  limit?: number;
}

export interface Recommendation<T extends CatalogAppLike> {
  app: T;
  score: number;
  /** Non-empty. Each entry names a fact that contributed to `score`. */
  reasons: string[];
}

function stampOf(app: CatalogAppLike): number {
  return (
    new Date(app.updatedAt || app.lastUpdated || app.publishedAt || 0).getTime() || 0
  );
}

function tagsOf(app: CatalogAppLike): string[] {
  return Array.isArray(app.tags)
    ? app.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
    : [];
}

interface Signals {
  categories: Set<string>;
  types: Set<string>;
  tags: Set<string>;
  savedCategories: Set<string>;
  savedTags: Set<string>;
}

function collectSignals<T extends CatalogAppLike>(
  catalog: T[],
  viewedSlugs: string[],
  savedSlugs: string[],
  followed: string[]
): Signals {
  const bySlug = new Map<string, T>();
  for (const app of catalog) {
    const slug = normalizeSlug(app.slug);
    if (slug) bySlug.set(slug, app);
  }
  const categories = new Set<string>();
  const types = new Set<string>();
  const tags = new Set<string>();
  const savedCategories = new Set<string>();
  const savedTags = new Set<string>();

  for (const slug of viewedSlugs) {
    const app = bySlug.get(slug);
    if (!app) continue;
    if (app.category) categories.add(app.category);
    if (app.type) types.add(app.type);
    for (const tag of tagsOf(app)) tags.add(tag.toLowerCase());
  }
  for (const slug of savedSlugs) {
    const app = bySlug.get(slug);
    if (!app) continue;
    if (app.category) savedCategories.add(app.category);
    for (const tag of tagsOf(app)) savedTags.add(tag.toLowerCase());
  }
  for (const category of followed) {
    const normalized = normalizeCategory(category);
    if (normalized) categories.add(normalized);
  }
  return { categories, types, tags, savedCategories, savedTags };
}

function isFresh(app: CatalogAppLike, now: number): boolean {
  const stamp = stampOf(app);
  if (!stamp) return false;
  return now - stamp <= FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Score every eligible app and return the best `limit`, each with the facts
 * that earned it a place. Exclusion: unpublished, already viewed, already
 * saved, already recommended (seen), or carrying no personal signal at all.
 */
export function recommendApps<T extends CatalogAppLike>(
  input: RecommendInput<T>
): Recommendation<T>[] {
  const { catalog, state } = input;
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const limit = Math.max(0, input.limit ?? 3);
  const savedSlugs = (input.savedSlugs ?? [])
    .map((slug) => normalizeSlug(slug))
    .filter((slug): slug is string => !!slug);
  const viewedSlugs = state.recent.map((entry) => entry.slug);
  const excluded = new Set<string>([...savedSlugs, ...viewedSlugs, ...state.seen]);
  const followed = state.preferences.categories;
  const followedKeys = new Set(followed.map((category) => category.toLowerCase()));

  const signals = collectSignals(catalog, viewedSlugs, savedSlugs, followed);
  const results: Recommendation<T>[] = [];
  const taken = new Set<string>();

  for (const app of catalog) {
    if (!isPublishedCatalogApp(app)) continue;
    const slug = normalizeSlug(app.slug);
    if (!slug || excluded.has(slug) || taken.has(slug)) continue;

    const reasons: { weight: number; text: string }[] = [];
    let score = 0;

    const category = app.category;
    if (category) {
      if (followedKeys.has(category.toLowerCase())) {
        score += RECOMMENDATION_WEIGHTS.followedCategory;
        reasons.push({
          weight: RECOMMENDATION_WEIGHTS.followedCategory,
          text: `In a category you follow: ${category}.`,
        });
      } else if (signals.savedCategories.has(category)) {
        score += RECOMMENDATION_WEIGHTS.savedCategory;
        reasons.push({
          weight: RECOMMENDATION_WEIGHTS.savedCategory,
          text: `Same category as an app you saved: ${category}.`,
        });
      } else if (signals.categories.has(category)) {
        score += RECOMMENDATION_WEIGHTS.viewedCategory;
        reasons.push({
          weight: RECOMMENDATION_WEIGHTS.viewedCategory,
          text: `Same category as apps you opened: ${category}.`,
        });
      }
    }

    const sharedTags: string[] = [];
    for (const tag of tagsOf(app)) {
      const key = tag.toLowerCase();
      if (signals.tags.has(key) || signals.savedTags.has(key)) {
        if (!sharedTags.includes(tag)) sharedTags.push(tag);
      }
    }
    if (sharedTags.length > 0) {
      const counted = Math.min(sharedTags.length, RECOMMENDATION_WEIGHTS.sharedTagCap);
      score += counted * RECOMMENDATION_WEIGHTS.sharedTag;
      reasons.push({
        weight: counted * RECOMMENDATION_WEIGHTS.sharedTag,
        text: `Shares ${plural(counted, 'tag')} with apps you opened or saved: ${sharedTags
          .slice(0, counted)
          .join(', ')}.`,
      });
    }

    if (app.type && signals.types.has(app.type)) {
      score += RECOMMENDATION_WEIGHTS.sameType;
      reasons.push({
        weight: RECOMMENDATION_WEIGHTS.sameType,
        text: `Same app type as apps you opened: ${app.type}.`,
      });
    }

    // Freshness only boosts an app that already earned a personal signal, so a
    // brand-new app can never appear with freshness as its only "reason".
    if (score > 0 && isFresh(app, now)) {
      score += RECOMMENDATION_WEIGHTS.freshness;
      reasons.push({
        weight: RECOMMENDATION_WEIGHTS.freshness,
        text: `Updated within the last ${FRESH_WINDOW_DAYS} days.`,
      });
    }

    if (score <= 0 || reasons.length === 0) continue;

    taken.add(slug);
    reasons.sort((a, b) => b.weight - a.weight);
    results.push({
      app,
      score,
      reasons: reasons.slice(0, 3).map((reason) => reason.text),
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const stampDiff = stampOf(b.app) - stampOf(a.app);
    if (stampDiff !== 0) return stampDiff;
    const nameDiff = (a.app.name ?? a.app.slug).localeCompare(b.app.name ?? b.app.slug);
    if (nameDiff !== 0) return nameDiff;
    return a.app.slug.localeCompare(b.app.slug);
  });

  return results.slice(0, limit);
}

/**
 * Whether this visitor has given the engine anything to work with. The UI uses
 * this to avoid rendering an empty, apologetic recommendation block.
 */
export function hasPersonalizationSignal(
  state: PersonalizationState,
  savedSlugs: string[] = []
): boolean {
  return (
    state.recent.length > 0 ||
    state.preferences.categories.length > 0 ||
    savedSlugs.some((slug) => normalizeSlug(slug) !== null)
  );
}
