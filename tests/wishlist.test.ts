/**
 * AppMintly 2.0 — unified Library wishlist (Item 3).
 *
 * Two local stores exist and must keep existing independently:
 *   favourites  → `appforge_local_favorites`           (string[])
 *   Lab saves   → `appmintly_upcoming_wishlist_v1`     (id -> {savedAt})
 * The Library shows one de-duplicated list keyed on the published app id, and
 * a removal only touches the stores that actually hold the app.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import catalogData from '../data/apps.json';
import roadmapData from '../data/upcoming-apps.json';
import {
  mergeWishlist,
  searchWishlist,
  removalTargets,
  platformLabelFor,
} from '../lib/wishlist';

const apps = (catalogData as any[]).filter((a) => a.published);
const roadmap = roadmapData as any[];

/** In-memory stand-in for window.localStorage (node test environment). */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  keys() { return [...this.map.keys()]; }
}

function installWindow(storage: MemoryStorage) {
  const events: string[] = [];
  (globalThis as any).window = {
    localStorage: storage,
    dispatchEvent: (e: any) => { events.push(e.type); return true; },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return events;
}

const cineflow = apps.find((a) => a.slug === 'cineflow')!;
const billcraft = apps.find((a) => a.slug === 'billcraft')!;

describe('wishlist merge', () => {
  it('restores existing favourites (backward compatible)', () => {
    const { entries, stats } = mergeWishlist({
      catalogIds: [cineflow.id, billcraft.id],
      labIds: [],
      apps,
      roadmap,
    });
    expect(entries.map((e) => e.app.slug)).toEqual(['cineflow', 'billcraft']);
    expect(entries.every((e) => e.sources.saved && !e.sources.lab)).toBe(true);
    expect(stats.savedOnly).toBe(2);
  });

  it('de-duplicates the same app saved in Lab and favourites', () => {
    const labRecord = roadmap.find((r) => r.catalogSlug === 'cineflow')!;
    const { entries, stats } = mergeWishlist({
      catalogIds: [cineflow.id],
      labIds: [labRecord.id],
      apps,
      roadmap,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual({ saved: true, lab: true });
    expect(entries[0].duplicatesMerged).toBe(true);
    expect(stats.mergedFromBoth).toBe(1);
    expect(stats.total).toBe(1);
  });

  it('keeps Lab-only saves visible without inventing a favourite', () => {
    const labRecord = roadmap.find((r) => r.catalogSlug === 'billcraft')!;
    const { entries } = mergeWishlist({ catalogIds: [], labIds: [labRecord.id], apps, roadmap });
    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual({ saved: false, lab: true });
    expect(entries[0].labIds).toEqual([labRecord.id]);
  });

  it('collapses duplicate ids and enforces one row per app', () => {
    const labRecord = roadmap.find((r) => r.catalogSlug === 'cineflow')!;
    const { entries, stats } = mergeWishlist({
      catalogIds: [cineflow.id, cineflow.id, cineflow.slug],
      labIds: [labRecord.id, labRecord.id],
      apps,
      roadmap,
    });
    expect(entries).toHaveLength(1);
    expect(stats.droppedDuplicates).toBeGreaterThanOrEqual(2);
  });

  it('drops invalid, unpublished and unknown ids instead of rendering them', () => {
    const unpublished = (catalogData as any[]).find((a) => !a.published);
    const { entries, stats } = mergeWishlist({
      catalogIds: ['does-not-exist', unpublished ? unpublished.id : 'x', 42, null, ''],
      labIds: ['ghost-record'],
      apps,
      roadmap,
    });
    expect(entries).toEqual([]);
    expect(stats.droppedInvalid).toBeGreaterThanOrEqual(3);
  });

  it('survives malformed storage payloads', () => {
    for (const bad of [null, undefined, 'not-an-array', 7, { a: 1 }, [null, {}, [], 5]]) {
      const { entries } = mergeWishlist({ catalogIds: bad as any, labIds: bad as any, apps, roadmap });
      expect(entries).toEqual([]);
    }
  });

  it('treats an explicitly unpublished record as invalid even when present', () => {
    const draft = { id: 'draft-app', slug: 'draft-app', name: 'Draft', published: false };
    const { entries, stats } = mergeWishlist({
      catalogIds: ['draft-app'],
      labIds: [],
      apps: [...apps, draft],
      roadmap,
    });
    expect(entries).toEqual([]);
    expect(stats.droppedInvalid).toBe(1);
  });

  it('labels platform availability from catalog facts only', () => {
    expect(platformLabelFor(cineflow)).toBe('Android + Web');
    expect(platformLabelFor({ id: 'w', name: 'W', slug: 'w', launchUrl: 'https://example.test' })).toBe('Web app');
    expect(platformLabelFor({ id: 'n', name: 'N' })).toBe('Not specified');
    expect(platformLabelFor(undefined)).toBe('Not specified');
  });
});

describe('wishlist search', () => {
  it('finds saved apps by name, category, type and developer', () => {
    const { entries } = mergeWishlist({
      catalogIds: [cineflow.id, billcraft.id],
      labIds: [],
      apps,
      roadmap,
    });
    expect(searchWishlist(entries, 'cine')).toHaveLength(1);
    expect(searchWishlist(entries, 'ENTERTAINMENT').map((e) => e.app.slug)).toEqual(['cineflow']);
    expect(searchWishlist(entries, '   ')).toHaveLength(2);
    expect(searchWishlist(entries, 'zzzz')).toHaveLength(0);
  });
});

describe('wishlist removal targets', () => {
  it('removes from both stores only when both hold the app', () => {
    const labRecord = roadmap.find((r) => r.catalogSlug === 'cineflow')!;
    const { entries } = mergeWishlist({
      catalogIds: [cineflow.id],
      labIds: [labRecord.id],
      apps,
      roadmap,
    });
    expect(removalTargets(entries[0])).toEqual({ catalog: true, labIds: [labRecord.id] });
  });

  it('leaves the other store alone for a lab-only or saved-only entry', () => {
    const labRecord = roadmap.find((r) => r.catalogSlug === 'billcraft')!;
    const labOnly = mergeWishlist({ catalogIds: [], labIds: [labRecord.id], apps, roadmap }).entries[0];
    expect(removalTargets(labOnly)).toEqual({ catalog: false, labIds: [labRecord.id] });
    const savedOnly = mergeWishlist({ catalogIds: [cineflow.id], labIds: [], apps, roadmap }).entries[0];
    expect(removalTargets(savedOnly)).toEqual({ catalog: true, labIds: [] });
    expect(removalTargets(null)).toEqual({ catalog: false, labIds: [] });
  });
});

describe('persistence and store isolation', () => {
  let storage: MemoryStorage;
  let events: string[];
  beforeEach(() => {
    storage = new MemoryStorage();
    events = installWindow(storage);
  });

  it('saves, unsaves and persists favourites across a reload', async () => {
    const lib = await import('../lib/localLibrary');
    expect(lib.getLocalFavorites()).toEqual([]);
    expect(lib.toggleLocalFavorite(cineflow.id)).toBe(true);
    expect(lib.toggleLocalFavorite(billcraft.id)).toBe(true);
    expect(lib.getLocalFavorites()).toEqual([cineflow.id, billcraft.id]);
    expect(events).toContain('appmintly_local_updated');

    // "reload": fresh read from the same storage
    expect(lib.getLocalFavorites()).toEqual([cineflow.id, billcraft.id]);
    expect(lib.toggleLocalFavorite(cineflow.id)).toBe(false);
    expect(lib.getLocalFavorites()).toEqual([billcraft.id]);
  });

  it('recovers from malformed favourites storage without crashing', async () => {
    const lib = await import('../lib/localLibrary');
    storage.setItem('appforge_local_favorites', '{"not":"an array"}');
    expect(lib.getLocalFavorites()).toEqual([]);
    expect(lib.toggleLocalFavorite(cineflow.id)).toBe(true);
    expect(lib.getLocalFavorites()).toEqual([cineflow.id]);

    storage.setItem('appforge_local_favorites', '[1,2,null,"cineflow","cineflow","  "]');
    expect(lib.getLocalFavorites()).toEqual(['cineflow']);
  });

  it('never writes into the compare store', async () => {
    const lib = await import('../lib/localLibrary');
    const compare = await import('../lib/compare');
    expect(compare.COMPARE_STORAGE_KEY).toBe('appmintly.compare.v1');
    expect(compare.COMPARE_STORAGE_KEY).not.toBe('appforge_local_favorites');

    const { ids } = compare.toggleSelection([], cineflow.id, apps);
    compare.saveSelection(storage as any, ids);
    expect(storage.getItem(compare.COMPARE_STORAGE_KEY)).toBeTruthy();
    expect(storage.getItem('appforge_local_favorites')).toBeNull();

    lib.toggleLocalFavorite(billcraft.id);
    const compareIds = compare.loadSelection(storage as any, apps).ids;
    expect(compareIds).toEqual([cineflow.id]);
    expect(lib.getLocalFavorites()).toEqual([billcraft.id]);
  });

  it('resolves the merged list from both stores after a reload', async () => {
    const lib = await import('../lib/localLibrary');
    const lab = await import('../lib/upcoming-wishlist');
    lib.toggleLocalFavorite(cineflow.id);
    const labRecord = roadmap.find((r) => r.catalogSlug === 'cineflow')!;
    lab.toggleWishlist(labRecord.id);

    const { entries } = mergeWishlist({
      catalogIds: lib.getLocalFavorites(),
      labIds: lab.localWishlistIds(),
      apps,
      roadmap,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual({ saved: true, lab: true });
  });
});

describe('empty state', () => {
  it('produces zero entries when both stores are empty', () => {
    const { entries, stats } = mergeWishlist({ catalogIds: [], labIds: [], apps, roadmap });
    expect(entries).toEqual([]);
    expect(stats).toMatchObject({ total: 0, savedOnly: 0, labOnly: 0, mergedFromBoth: 0 });
  });
});
