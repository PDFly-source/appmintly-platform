/**
 * Item 10 / Batch 4 — visitor-created collections.
 *
 * Pure functions over PersonalizationState. Nothing here touches storage, the
 * network or another store: the caller persists the returned state through the
 * existing appmintly.personalization.v1 store.
 *
 * Two rules are absolute:
 *  - only published catalog apps can ENTER a collection;
 *  - stored slugs are never deleted just because an app was unpublished or
 *    removed from the catalog. Rendering hides them, storage keeps them.
 */

import {
  PERSONALIZATION_LIMITS,
  isPublishedCatalogApp,
  normalizeSlug,
  type CatalogAppLike,
  type PersonalizationCollection,
  type PersonalizationState,
} from './model';

export const COLLECTION_LIMITS = {
  collections: PERSONALIZATION_LIMITS.collections,
  apps: PERSONALIZATION_LIMITS.collectionApps,
  name: 40,
  description: 160,
} as const;

export interface CollectionMutation {
  state: PersonalizationState;
  /** True when the state actually changed. */
  changed: boolean;
  /** User-facing explanation when nothing changed. */
  error: string | null;
  /** Set on create. */
  id?: string;
}

const fail = (state: PersonalizationState, error: string): CollectionMutation => ({
  state,
  changed: false,
  error,
});

export function normalizeCollectionName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, COLLECTION_LIMITS.name);
}

export function validateCollectionName(raw: unknown): string | null {
  const name = normalizeCollectionName(raw);
  if (name.length === 0) return 'Give the collection a name.';
  if (typeof raw === 'string' && raw.trim().length > COLLECTION_LIMITS.name) {
    return `Keep the name under ${COLLECTION_LIMITS.name} characters.`;
  }
  return null;
}

export function normalizeDescription(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, COLLECTION_LIMITS.description);
}

/** Deterministic, collision-free id: `name-slug`, then `-2`, `-3`, ... */
export function buildCollectionId(name: string, existing: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'collection';
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${existing.length + 1}`;
}

export function getCollection(
  state: PersonalizationState,
  id: unknown
): PersonalizationCollection | null {
  if (typeof id !== 'string' || id === '') return null;
  return state.collections.find((entry) => entry.id === id) ?? null;
}

export function createCollection(
  state: PersonalizationState,
  draft: { name: unknown; description?: unknown },
  now: number = Date.now()
): CollectionMutation {
  const error = validateCollectionName(draft.name);
  if (error) return fail(state, error);
  if (state.collections.length >= COLLECTION_LIMITS.collections) {
    return fail(state, `You can keep up to ${COLLECTION_LIMITS.collections} collections.`);
  }
  const name = normalizeCollectionName(draft.name);
  const id = buildCollectionId(name, state.collections.map((entry) => entry.id));
  const collection: PersonalizationCollection = {
    id,
    name,
    description: normalizeDescription(draft.description),
    apps: [],
    createdAt: now,
    updatedAt: now,
  };
  return { state: { ...state, collections: [collection, ...state.collections] }, changed: true, error: null, id };
}

export function renameCollection(
  state: PersonalizationState,
  id: unknown,
  name: unknown,
  now: number = Date.now()
): CollectionMutation {
  const target = getCollection(state, id);
  if (!target) return fail(state, 'That collection no longer exists.');
  const error = validateCollectionName(name);
  if (error) return fail(state, error);
  const next = normalizeCollectionName(name);
  if (next === target.name) return { state, changed: false, error: null };
  return {
    state: {
      ...state,
      collections: state.collections.map((entry) =>
        entry.id === target.id ? { ...entry, name: next, updatedAt: now } : entry
      ),
    },
    changed: true,
    error: null,
  };
}

export function setCollectionDescription(
  state: PersonalizationState,
  id: unknown,
  description: unknown,
  now: number = Date.now()
): CollectionMutation {
  const target = getCollection(state, id);
  if (!target) return fail(state, 'That collection no longer exists.');
  const next = normalizeDescription(description);
  if (next === target.description) return { state, changed: false, error: null };
  return {
    state: {
      ...state,
      collections: state.collections.map((entry) =>
        entry.id === target.id ? { ...entry, description: next, updatedAt: now } : entry
      ),
    },
    changed: true,
    error: null,
  };
}

export function deleteCollection(state: PersonalizationState, id: unknown): CollectionMutation {
  const target = getCollection(state, id);
  if (!target) return fail(state, 'That collection no longer exists.');
  return {
    state: { ...state, collections: state.collections.filter((entry) => entry.id !== target.id) },
    changed: true,
    error: null,
  };
}

/**
 * Add a published catalog app. Unpublished, unknown and already-present apps
 * are refused with an explanation, so nothing silently appears in a collection.
 */
export function addAppToCollection(
  state: PersonalizationState,
  id: unknown,
  slug: unknown,
  catalog: CatalogAppLike[],
  now: number = Date.now()
): CollectionMutation {
  const target = getCollection(state, id);
  if (!target) return fail(state, 'That collection no longer exists.');
  const normalized = normalizeSlug(slug);
  if (!normalized) return fail(state, 'That app cannot be added.');
  const record = catalog.find((app) => normalizeSlug(app.slug) === normalized);
  if (!record || !isPublishedCatalogApp(record)) {
    return fail(state, 'Only published apps can be added to a collection.');
  }
  if (target.apps.includes(normalized)) return fail(state, 'That app is already in this collection.');
  if (target.apps.length >= COLLECTION_LIMITS.apps) {
    return fail(state, `A collection holds up to ${COLLECTION_LIMITS.apps} apps.`);
  }
  return {
    state: {
      ...state,
      collections: state.collections.map((entry) =>
        entry.id === target.id
          ? { ...entry, apps: [...entry.apps, normalized], updatedAt: now }
          : entry
      ),
    },
    changed: true,
    error: null,
  };
}

export function removeAppFromCollection(
  state: PersonalizationState,
  id: unknown,
  slug: unknown,
  now: number = Date.now()
): CollectionMutation {
  const target = getCollection(state, id);
  if (!target) return fail(state, 'That collection no longer exists.');
  const normalized = normalizeSlug(slug);
  if (!normalized || !target.apps.includes(normalized)) {
    return fail(state, 'That app is not in this collection.');
  }
  return {
    state: {
      ...state,
      collections: state.collections.map((entry) =>
        entry.id === target.id
          ? { ...entry, apps: entry.apps.filter((s) => s !== normalized), updatedAt: now }
          : entry
      ),
    },
    changed: true,
    error: null,
  };
}

export interface ResolvedCollection {
  id: string;
  name: string;
  description: string;
  /** Published catalog apps, catalog order preserved by stored order. */
  apps: CatalogAppLike[];
  /** How many apps are stored (includes hidden ones). */
  storedCount: number;
  /** Stored apps that are unpublished or no longer in the catalog. */
  hidden: number;
  createdAt: number;
  updatedAt: number;
}

function resolveOne(
  collection: PersonalizationCollection,
  catalog: CatalogAppLike[]
): ResolvedCollection {
  const bySlug = new Map<string, CatalogAppLike>();
  for (const app of catalog) {
    const slug = normalizeSlug(app.slug);
    if (slug && isPublishedCatalogApp(app)) bySlug.set(slug, app);
  }
  const apps: CatalogAppLike[] = [];
  for (const slug of collection.apps) {
    const match = bySlug.get(slug);
    if (match) apps.push(match);
  }
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    apps,
    storedCount: collection.apps.length,
    hidden: collection.apps.length - apps.length,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

/** Collections with published apps resolved and invalid entries hidden. */
export function resolveCollections(
  state: PersonalizationState,
  catalog: CatalogAppLike[]
): ResolvedCollection[] {
  return state.collections.map((entry) => resolveOne(entry, catalog));
}

export function resolveCollection(
  state: PersonalizationState,
  catalog: CatalogAppLike[],
  id: unknown
): ResolvedCollection | null {
  const target = getCollection(state, id);
  return target ? resolveOne(target, catalog) : null;
}
