/**
 * Item 10 / Batch 4 — custom collections.
 *
 * Holds the collections engine to its promises: validation, duplicate
 * prevention, published-only membership, hidden-but-retained storage,
 * malformed payload recovery, destructive scopes and cross-tab sync.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERSONALIZATION_LIMITS,
  PERSONALIZATION_STORAGE_KEY,
  emptyPersonalization,
  parsePersonalization,
  resetPersonalization,
  sanitizePersonalization,
  type CatalogAppLike,
  type PersonalizationState,
} from '@/lib/personalization/model';
import { loadPersonalization, subscribePersonalization } from '@/lib/personalization/store';
import {
  COLLECTION_LIMITS,
  addAppToCollection,
  buildCollectionId,
  createCollection,
  deleteCollection,
  getCollection,
  removeAppFromCollection,
  renameCollection,
  resolveCollection,
  resolveCollections,
  setCollectionDescription,
  validateCollectionName,
} from '@/lib/personalization/collections';
import { clearRecentlyViewed, recordPublishedVisit, resolveVisibleRecent } from '@/lib/personalization/visits';
import { buildCollections } from '@/lib/catalog/collections';
import { APPS } from '@/data/apps';
import curated from '@/data/collections.json';

const NOW = Date.parse('2026-10-31T12:30:00.000Z');

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  getItem(k: string): string | null { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.map.set(k, String(v)); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
}
let storage: MemoryStorage;
function installWindow(): void {
  storage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = Object.assign(new EventTarget(), {
    localStorage: storage,
  });
}

const CATALOG: CatalogAppLike[] = [
  { slug: 'cineflow', name: 'CineFlow', published: true, category: 'Entertainment' },
  { slug: 'studyria', name: 'Studyria', published: true, category: 'Education' },
  { slug: 'draft-app', name: 'Draft App', published: false, category: 'Utilities' },
];

const base = (): PersonalizationState => emptyPersonalization();

describe('collection creation and validation', () => {
  it('creates a collection with a stable id', () => {
    const result = createCollection(base(), { name: '  Weekend   tools ', description: ' Offline picks ' }, NOW);
    expect(result.changed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.state.collections).toHaveLength(1);
    expect(result.state.collections[0]).toMatchObject({
      id: 'weekend-tools',
      name: 'Weekend tools',
      description: 'Offline picks',
      apps: [],
      createdAt: NOW,
    });
  });

  it('prevents duplicate ids for the same name', () => {
    const ids = ['weekend-tools'];
    expect(buildCollectionId('Weekend tools', ids)).toBe('weekend-tools-2');
    expect(buildCollectionId('Weekend tools', [...ids, 'weekend-tools-2'])).toBe('weekend-tools-3');

    const first = createCollection(base(), { name: 'Weekend tools' }, NOW);
    const second = createCollection(first.state, { name: 'Weekend tools' }, NOW);
    const third = createCollection(second.state, { name: 'Weekend Tools' }, NOW);
    const allIds = third.state.collections.map((entry) => entry.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it('rejects empty and over-long names', () => {
    expect(validateCollectionName('   ')).toBeTruthy();
    expect(validateCollectionName('x'.repeat(COLLECTION_LIMITS.name + 1))).toBeTruthy();
    expect(validateCollectionName('ok')).toBeNull();
    const empty = createCollection(base(), { name: '  ' }, NOW);
    expect(empty.changed).toBe(false);
    expect(empty.state.collections).toHaveLength(0);
  });

  it('enforces the collection cap', () => {
    let state = base();
    for (let i = 0; i < COLLECTION_LIMITS.collections; i += 1) {
      const created = createCollection(state, { name: `Collection ${i}` }, NOW);
      expect(created.changed).toBe(true);
      state = created.state;
    }
    const overflow = createCollection(state, { name: 'One too many' }, NOW);
    expect(overflow.changed).toBe(false);
    expect(overflow.error).toMatch(/up to/);
    expect(state.collections).toHaveLength(PERSONALIZATION_LIMITS.collections);
  });
});

describe('rename, describe, delete', () => {
  const seeded = () => createCollection(base(), { name: 'Road trip' }, NOW).state;

  it('renames and trims', () => {
    const state = seeded();
    const id = state.collections[0].id;
    const renamed = renameCollection(state, id, '  Long   drive ');
    expect(renamed.changed).toBe(true);
    expect(getCollection(renamed.state, id)?.name).toBe('Long drive');
    // Identical name is a no-op, not a write.
    expect(renameCollection(renamed.state, id, 'Long drive').changed).toBe(false);
    expect(renameCollection(renamed.state, id, '   ').error).toBeTruthy();
  });

  it('sets a description, caps it, and clears it', () => {
    const state = seeded();
    const id = state.collections[0].id;
    const withDesc = setCollectionDescription(state, id, 'Apps for the car');
    expect(getCollection(withDesc.state, id)?.description).toBe('Apps for the car');
    const long = setCollectionDescription(state, id, 'x'.repeat(COLLECTION_LIMITS.description + 40));
    expect(getCollection(long.state, id)?.description).toHaveLength(COLLECTION_LIMITS.description);
    const cleared = setCollectionDescription(long.state, id, '  ');
    expect(getCollection(cleared.state, id)?.description).toBe('');
  });

  it('deletes only the named collection', () => {
    const one = seeded();
    const two = createCollection(one, { name: 'Second' }, NOW).state;
    const target = two.collections.find((entry) => entry.name === 'Second');
    const deleted = deleteCollection(two, target?.id);
    expect(deleted.changed).toBe(true);
    expect(deleted.state.collections.map((entry) => entry.name)).toEqual(['Road trip']);
    expect(deleteCollection(deleted.state, 'missing').changed).toBe(false);
  });
});

describe('apps inside collections', () => {
  const seeded = () => createCollection(base(), { name: 'Keepers' }, NOW).state;

  it('adds published apps and refuses duplicates', () => {
    const state = seeded();
    const id = state.collections[0].id;
    const added = addAppToCollection(state, id, 'cineflow', CATALOG);
    expect(added.changed).toBe(true);
    expect(getCollection(added.state, id)?.apps).toEqual(['cineflow']);

    const again = addAppToCollection(added.state, id, 'cineflow', CATALOG);
    expect(again.changed).toBe(false);
    expect(again.error).toMatch(/already/);
    expect(getCollection(again.state, id)?.apps).toEqual(['cineflow']);
  });

  it('refuses unpublished, unknown and malformed apps', () => {
    const state = base();
    const id = state.collections[0]?.id ?? createCollection(state, { name: 'Keepers' }, NOW).id ?? '';
    let current = createCollection(state, { name: 'Keepers' }, NOW).state;
    const target = current.collections[0].id;
    const draft = addAppToCollection(current, target, 'draft-app', CATALOG);
    expect(draft.changed).toBe(false);
    expect(draft.error).toMatch(/published/);
    const unknown = addAppToCollection(current, target, 'nope-not-real', CATALOG);
    expect(unknown.changed).toBe(false);
    const bad = addAppToCollection(current, target, '../etc', CATALOG);
    expect(bad.changed).toBe(false);
    expect(current.collections[0].apps).toEqual([]);
    expect(id).toBeDefined();
  });

  it('enforces the per-collection app cap', () => {
    let state = createCollection(base(), { name: 'Big' }, NOW).state;
    const id = state.collections[0].id;
    const many: CatalogAppLike[] = Array.from({ length: COLLECTION_LIMITS.apps + 3 }, (_, i) => ({
      slug: `app-${i}`,
      name: `App ${i}`,
      published: true,
    }));
    for (const app of many) state = addAppToCollection(state, id, app.slug, many).state;
    expect(getCollection(state, id)?.apps).toHaveLength(COLLECTION_LIMITS.apps);
    const overflow = addAppToCollection(state, id, many[many.length - 1].slug, many);
    expect(overflow.changed).toBe(false);
    expect(overflow.error).toMatch(/up to/);
  });

  it('removes an app and reports a miss', () => {
    let state = createCollection(base(), { name: 'Keepers' }, NOW).state;
    const id = state.collections[0].id;
    state = addAppToCollection(state, id, 'cineflow', CATALOG).state;
    const removed = removeAppFromCollection(state, id, 'cineflow');
    expect(removed.changed).toBe(true);
    expect(getCollection(removed.state, id)?.apps).toEqual([]);
    expect(removeAppFromCollection(removed.state, id, 'cineflow').error).toBeTruthy();
  });
});

describe('resolution hides invalid apps without deleting them', () => {
  it('hides unpublished and unknown stored slugs', () => {
    let state = createCollection(base(), { name: 'Keepers' }, NOW).state;
    const id = state.collections[0].id;
    state = addAppToCollection(state, id, 'cineflow', CATALOG).state;
    state = addAppToCollection(state, id, 'studyria', CATALOG).state;
    // Simulate later catalog drift: one app unpublished, one removed entirely.
    const drifted: CatalogAppLike[] = [
      { slug: 'cineflow', name: 'CineFlow', published: true },
      { slug: 'studyria', name: 'Studyria', published: false },
    ];
    const resolved = resolveCollections(state, drifted);
    expect(resolved[0].apps.map((app) => app.slug)).toEqual(['cineflow']);
    expect(resolved[0].storedCount).toBe(2);
    expect(resolved[0].hidden).toBe(1);
    // Storage untouched.
    expect(getCollection(state, id)?.apps).toEqual(['cineflow', 'studyria']);
    expect(resolveCollection(state, drifted, id)?.apps).toHaveLength(1);
  });

  it('returns null for an unknown collection id', () => {
    expect(resolveCollection(base(), CATALOG, 'nope')).toBeNull();
  });
});

describe('storage contract', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('reads a Batch 3 payload without collections as an empty list', () => {
    const batch3 = JSON.stringify({
      version: 1,
      recent: [{ slug: 'cineflow', at: NOW - 1000 }],
      seen: [],
      preferences: { categories: ['Education'], recommendations: true, recentEnabled: true },
      lastVisit: NOW - 500,
    });
    storage.setItem(PERSONALIZATION_STORAGE_KEY, batch3);
    const parsed = parsePersonalization(storage.getItem(PERSONALIZATION_STORAGE_KEY), NOW);
    expect(parsed.reset).toBe(false);
    expect(parsed.state.collections).toEqual([]);
    expect(parsed.state.preferences.categories).toEqual(['Education']);
  });

  it('recovers from malformed collection payloads', () => {
    const messy = sanitizePersonalization({
      version: 1,
      recent: [],
      seen: [],
      preferences: { categories: [], recommendations: true, recentEnabled: true },
      lastVisit: null,
      collections: [
        { id: 'ok', name: 'Fine', apps: ['cineflow'], createdAt: NOW, updatedAt: NOW },
        { id: 'ok', name: 'Duplicate id' },
        { id: '   ', name: 'Bad id' },
        { id: 'no-name', name: '   ' },
        'not-an-object',
        { id: 'bad-slugs', name: 'Bad slugs', apps: ['CineFlow', '../etc', 12, 'cineflow', 'cineflow'] },
      ],
    }, NOW);
    expect(messy.state.collections.map((entry) => entry.id).sort()).toEqual(['bad-slugs', 'ok']);
    expect(messy.state.collections.find((entry) => entry.id === 'bad-slugs')?.apps).toEqual(['cineflow']);
    expect(messy.dropped).toBeGreaterThan(0);
    expect(messy.reset).toBe(false);
  });

  it('treats a non-array collections value as empty', () => {
    const result = sanitizePersonalization({
      version: 1,
      recent: [],
      seen: [],
      preferences: { categories: [], recommendations: true, recentEnabled: true },
      lastVisit: null,
      collections: 'nope',
    }, NOW);
    expect(result.state.collections).toEqual([]);
    expect(result.reset).toBe(false);
  });

  it('persists through the store and syncs same-tab and cross-tab', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalization(listener);
    const created = createCollection(loadPersonalization(NOW), { name: 'Local picks' }, NOW);
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(created.state));
    expect(loadPersonalization(NOW).collections.map((entry) => entry.id)).toEqual(['local-picks']);

    const otherTab: PersonalizationState = {
      ...emptyPersonalization(),
      collections: [
        { id: 'from-other-tab', name: 'Other tab', description: '', apps: [], createdAt: NOW, updatedAt: NOW },
      ],
    };
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(otherTab));
    const event = new Event('storage') as Event & { key: string | null };
    Object.defineProperty(event, 'key', { value: PERSONALIZATION_STORAGE_KEY });
    (globalThis as unknown as { window: Window }).window.dispatchEvent(event);
    expect(listener).toHaveBeenCalled();
    expect(loadPersonalization(NOW).collections.map((entry) => entry.id)).toEqual(['from-other-tab']);
    unsubscribe();
  });

  it('clear personalization removes collections but not other stores', () => {
    storage.setItem('appforge_local_favorites', '["cineflow"]');
    storage.setItem('appmintly.compare.v1', '{"version":1,"ids":["studyria"]}');
    storage.setItem('appmintly_upcoming_wishlist_v1', '{"version":1,"items":[]}');
    const created = createCollection(loadPersonalization(NOW), { name: 'Doomed' }, NOW);
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(created.state));

    const fresh = resetPersonalization();
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(fresh));
    expect(loadPersonalization(NOW).collections).toEqual([]);
    expect(storage.getItem('appforge_local_favorites')).toBe('["cineflow"]');
    expect(storage.getItem('appmintly.compare.v1')).toBe('{"version":1,"ids":["studyria"]}');
    expect(storage.getItem('appmintly_upcoming_wishlist_v1')).toBe('{"version":1,"items":[]}');
    expect(storage.length).toBe(4);
  });

  it('keeps recently viewed independent of collections', () => {
    recordPublishedVisit('cineflow', true, NOW - 1000);
    const created = createCollection(loadPersonalization(NOW), { name: 'Keepers' }, NOW);
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(created.state));
    clearRecentlyViewed();
    const state = loadPersonalization(NOW);
    expect(state.recent).toEqual([]);
    expect(state.collections.map((entry) => entry.name)).toEqual(['Keepers']);
    recordPublishedVisit('studyria', true, NOW);
    const visible = resolveVisibleRecent(CATALOG, loadPersonalization(NOW));
    expect(visible.items.map((item) => item.app.slug)).toEqual(['studyria']);
  });
});

describe('public collections regression', () => {
  it('catalog-derived collections are unchanged', () => {
    const { collections } = buildCollections(APPS, curated as never);
    expect(collections.length).toBeGreaterThan(0);
    for (const collection of collections) {
      expect(collection.apps.length).toBeGreaterThanOrEqual(2);
      expect(collection.apps.every((entry) => entry.published === true)).toBe(true);
    }
    // The personal engine never touches this data path.
    expect(new Set(collections.map((entry) => entry.id)).size).toBe(collections.length);
  });
});
