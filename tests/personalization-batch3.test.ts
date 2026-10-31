/**
 * Item 10 / Batch 3 — recommendations UI contract + category preferences.
 *
 * The pure layer is what these tests hold to account: the visibility
 * threshold, catalog validation of categories, honest reasons, exclusions,
 * published-only filtering, the switches, and the destructive actions.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERSONALIZATION_LIMITS,
  PERSONALIZATION_STORAGE_KEY,
  emptyPersonalization,
  recommendApps,
  resetPersonalization,
  setCategoryPreferences,
  setPersonalizationOptions,
  type CatalogAppLike,
  type PersonalizationState,
} from '@/lib/personalization/model';
import { loadPersonalization, subscribePersonalization } from '@/lib/personalization/store';
import {
  MIN_VIEWS_FOR_RECOMMENDATIONS,
  catalogCategories,
  hasRecommendationSignal,
  isCategorySelected,
  recommendationSignals,
  sanitizeCategorySelection,
  setCategoriesFromCatalog,
  toggleCatalogCategory,
} from '@/lib/personalization/preferences';
import { clearRecentlyViewed, recordPublishedVisit, resolveVisibleRecent } from '@/lib/personalization/visits';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const DAY = 86_400_000;

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
const app = (over: Partial<CatalogAppLike> & { slug: string }): CatalogAppLike => ({
  name: over.slug,
  published: true,
  category: 'Utilities',
  type: 'Android APK',
  tags: [],
  updatedAt: new Date(NOW - 400 * DAY).toISOString(),
  ...over,
});

const CATALOG: CatalogAppLike[] = [
  app({ slug: 'cineflow', name: 'CineFlow', category: 'Entertainment', tags: ['video'] }),
  app({ slug: 'studyria', name: 'Studyria', category: 'Education', tags: ['exam'] }),
  app({ slug: 'pdfminifly', name: 'PDFMiniFly', category: 'Utilities', tags: ['pdf'] }),
  app({ slug: 'billcraft', name: 'BillCraft', category: 'Utilities', tags: ['invoice'] }),
  app({ slug: 'draft-app', name: 'Draft App', category: 'Utilities', published: false }),
];

describe('recommendation visibility threshold', () => {
  it('needs two views, one saved app or one followed category', () => {
    const empty = emptyPersonalization();
    expect(hasRecommendationSignal(empty)).toBe(false);

    const oneView: PersonalizationState = { ...empty, recent: [{ slug: 'cineflow', at: NOW }] };
    expect(hasRecommendationSignal(oneView)).toBe(false);
    expect(MIN_VIEWS_FOR_RECOMMENDATIONS).toBe(2);

    const twoViews: PersonalizationState = {
      ...empty,
      recent: [{ slug: 'cineflow', at: NOW }, { slug: 'studyria', at: NOW - 1000 }],
    };
    expect(hasRecommendationSignal(twoViews)).toBe(true);

    expect(hasRecommendationSignal(empty, ['cineflow'])).toBe(true);
    // An empty or malformed saved list is not a signal.
    expect(hasRecommendationSignal(empty, [''])).toBe(false);
    expect(hasRecommendationSignal(empty, [null as unknown as string])).toBe(false);

    const followed = setCategoryPreferences(empty, ['Education']);
    expect(hasRecommendationSignal(followed)).toBe(true);
    expect(recommendationSignals(followed)).toEqual({ views: 0, saved: 0, categories: 1 });
  });
});

describe('category preferences', () => {
  it('offers only published catalog categories, de-duplicated and sorted', () => {
    const categories = catalogCategories(CATALOG);
    expect(categories).toEqual(['Education', 'Entertainment', 'Utilities']);
    expect(categories).not.toContain('Draft App');
  });

  it('rejects categories that are not in the catalog', () => {
    const { categories, rejected } = sanitizeCategorySelection(CATALOG, [
      'Education',
      'Astrology',
      '',
      42,
      'education',
      { nope: true },
    ]);
    expect(categories).toEqual(['Education']);
    expect(rejected).toEqual(['Astrology', '', '42', '[object Object]']);
  });

  it('enforces the existing 12 category cap without a schema change', () => {
    const many: CatalogAppLike[] = Array.from({ length: 15 }, (_, i) =>
      app({ slug: `app-${i}`, category: `Category ${i}` })
    );
    const { categories, rejected } = sanitizeCategorySelection(many, many.map((entry) => entry.category));
    expect(categories).toHaveLength(PERSONALIZATION_LIMITS.categories);
    expect(rejected).toHaveLength(15 - PERSONALIZATION_LIMITS.categories);
  });

  it('persists a validated selection and toggles a chip off again', () => {
    installWindow();
    const withEd = setCategoriesFromCatalog(emptyPersonalization(), CATALOG, ['Education', 'Bogus']);
    expect(withEd.preferences.categories).toEqual(['Education']);
    expect(isCategorySelected(withEd, 'education')).toBe(true);

    const withBoth = toggleCatalogCategory(withEd, CATALOG, 'Utilities');
    expect(withBoth.preferences.categories).toEqual(['Education', 'Utilities']);

    const removed = toggleCatalogCategory(withBoth, CATALOG, 'Education');
    expect(removed.preferences.categories).toEqual(['Utilities']);

    // Unknown categories are ignored rather than stored.
    expect(toggleCatalogCategory(removed, CATALOG, 'Astrology')).toBe(removed);
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('round-trips categories and switches through the store', () => {
    installWindow();
    const saved = setCategoriesFromCatalog(loadPersonalization(NOW), CATALOG, ['Entertainment']);
    const storage2 = Object.assign(new EventTarget(), { localStorage: storage });
    (globalThis as unknown as { window: unknown }).window = storage2;
    const withSwitches = setPersonalizationOptions(saved, { recommendations: false, recentEnabled: false });
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(withSwitches));
    const reloaded = loadPersonalization(NOW);
    expect(reloaded.preferences.categories).toEqual(['Entertainment']);
    expect(reloaded.preferences.recommendations).toBe(false);
    expect(reloaded.preferences.recentEnabled).toBe(false);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});

describe('recommendation honesty', () => {
  it('never recommends viewed, saved or unpublished apps', () => {
    const state: PersonalizationState = {
      ...emptyPersonalization(),
      recent: [{ slug: 'cineflow', at: NOW }, { slug: 'studyria', at: NOW - 1000 }],
      preferences: { categories: ['Utilities'], recommendations: true, recentEnabled: true },
    };
    const results = recommendApps({ catalog: CATALOG, state, savedSlugs: ['billcraft'], now: NOW, limit: 5 });
    const slugs = results.map((entry) => entry.app.slug);
    expect(slugs).not.toContain('cineflow');
    expect(slugs).not.toContain('studyria');
    expect(slugs).not.toContain('billcraft');
    expect(slugs).not.toContain('draft-app');
    expect(slugs).toEqual(['pdfminifly']);
  });

  it('gives every recommendation a factual reason and caps at three', () => {
    const state: PersonalizationState = {
      ...emptyPersonalization(),
      recent: [{ slug: 'cineflow', at: NOW }, { slug: 'studyria', at: NOW - 1000 }],
      preferences: { categories: ['Utilities'], recommendations: true, recentEnabled: true },
    };
    const results = recommendApps({ catalog: CATALOG, state, now: NOW, limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    for (const entry of results) {
      expect(entry.reasons.length).toBeGreaterThan(0);
      expect(entry.reasons[0].length).toBeGreaterThan(0);
      expect(entry.reasons.join(' ')).not.toMatch(/popular|trending|trend|download count|users also|other users|rating/i);
    }
  });

  it('returns nothing when the catalog has no eligible published app', () => {
    const state: PersonalizationState = {
      ...emptyPersonalization(),
      preferences: { categories: ['Utilities'], recommendations: true, recentEnabled: true },
    };
    const onlyDrafts: CatalogAppLike[] = [app({ slug: 'draft-app', published: false }), app({ slug: 'ghost', published: undefined as unknown as boolean })];
    expect(recommendApps({ catalog: onlyDrafts, state, now: NOW, limit: 3 })).toEqual([]);
  });

  it('produces an empty disabled state without touching stored data', () => {
    installWindow();
    recordPublishedVisit('cineflow', true, NOW - 2000);
    recordPublishedVisit('studyria', true, NOW - 1000);
    const off = setPersonalizationOptions(loadPersonalization(NOW), { recommendations: false });
    expect(off.preferences.recommendations).toBe(false);
    // Turning recommendations off must not erase history.
    expect(off.recent).toHaveLength(2);
    expect(off.preferences.categories).toEqual([]);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});

describe('settings actions', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('clears history but leaves saved apps and other stores intact', () => {
    storage.setItem('appforge_local_favorites', '["cineflow"]');
    storage.setItem('appmintly.compare.v1', '{"version":1,"ids":["studyria"]}');
    const withCats = setCategoriesFromCatalog(loadPersonalization(NOW), CATALOG, ['Utilities']);
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(withCats));
    recordPublishedVisit('cineflow', true, NOW);

    const cleared = clearRecentlyViewed();
    expect(cleared.recent).toEqual([]);
    // Category preferences survive a history clear.
    expect(cleared.preferences.categories).toEqual(['Utilities']);
    expect(storage.getItem('appforge_local_favorites')).toBe('["cineflow"]');
    expect(storage.getItem('appmintly.compare.v1')).toBe('{"version":1,"ids":["studyria"]}');
  });

  it('removes all personalization without touching other keys', () => {
    storage.setItem('appforge_local_favorites', '["cineflow"]');
    storage.setItem('appmintly_upcoming_wishlist_v1', '{"version":1,"items":[]}');
    const seeded = setPersonalizationOptions(
      setCategoriesFromCatalog(loadPersonalization(NOW), CATALOG, ['Education']),
      { recommendations: false }
    );
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify({ ...seeded, recent: [{ slug: 'studyria', at: NOW }] }));

    const fresh = resetPersonalization();
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(fresh));
    const reloaded = loadPersonalization(NOW);
    expect(reloaded.recent).toEqual([]);
    expect(reloaded.preferences.categories).toEqual([]);
    expect(reloaded.preferences.recommendations).toBe(true);
    expect(storage.getItem('appforge_local_favorites')).toBe('["cineflow"]');
    expect(storage.getItem('appmintly_upcoming_wishlist_v1')).toBe('{"version":1,"items":[]}');
    expect(storage.length).toBe(3);
  });

  it('notifies the UI on same-tab writes and other-tab writes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalization(listener);
    setCategoriesFromCatalog(loadPersonalization(NOW), CATALOG, ['Education']);
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(setCategoryPreferences(emptyPersonalization(), ['Utilities'])));
    const event = new Event('storage') as Event & { key: string | null };
    Object.defineProperty(event, 'key', { value: PERSONALIZATION_STORAGE_KEY });
    (globalThis as unknown as { window: Window }).window.dispatchEvent(event);
    expect(listener).toHaveBeenCalled();
    expect(loadPersonalization(NOW).preferences.categories).toEqual(['Utilities']);
    unsubscribe();
  });
});

describe('recently viewed regression after Batch 3', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('still records, resolves and hides exactly as Batch 2 did', () => {
    recordPublishedVisit('cineflow', true, NOW - 2000);
    recordPublishedVisit('pdfminifly', true, NOW - 1000);
    expect(recordPublishedVisit('draft-app', false, NOW)).toBe(false);
    const state = loadPersonalization(NOW);
    expect(state.recent.map((entry) => entry.slug)).toEqual(['pdfminifly', 'cineflow']);
    const visible = resolveVisibleRecent(CATALOG, state);
    expect(visible.items.map((item) => item.app.slug)).toEqual(['pdfminifly', 'cineflow']);
    expect(visible.hidden).toBe(0);
    // Recommendations exclude what history already knows about.
    const results = recommendApps({ catalog: CATALOG, state, now: NOW, limit: 5 });
    expect(results.map((entry) => entry.app.slug)).not.toContain('cineflow');
    expect(results.map((entry) => entry.app.slug)).not.toContain('pdfminifly');
  });

  it('keeps a disabled recording preference authoritative', () => {
    recordPublishedVisit('cineflow', true, NOW);
    setPersonalizationOptions(loadPersonalization(NOW), { recentEnabled: false });
    storage.setItem(
      PERSONALIZATION_STORAGE_KEY,
      JSON.stringify(setPersonalizationOptions(loadPersonalization(NOW), { recentEnabled: false }))
    );
    expect(recordPublishedVisit('studyria', true, NOW + 1)).toBe(false);
    expect(loadPersonalization(NOW + 1).recent.map((entry) => entry.slug)).toEqual(['cineflow']);
  });
});
