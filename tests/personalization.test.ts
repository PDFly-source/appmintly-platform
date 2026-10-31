/**
 * Item 10 — Batch 1 regression tests for the personalization foundation.
 *
 * The model must be pure, deterministic and honest:
 *  - malformed / foreign / future storage never crashes and never half-applies
 *  - unpublished apps are hidden at read time without deleting stored slugs
 *  - recommendations come from catalogued facts only, with a reason for every
 *    point that was awarded, and no popularity signal anywhere
 *  - ties break deterministically so the same catalog always renders the same
 *
 * The store must never touch another module's key and must survive a browser
 * where localStorage throws.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  FRESH_WINDOW_DAYS,
  PERSONALIZATION_LIMITS,
  PERSONALIZATION_SCHEMA_VERSION,
  PERSONALIZATION_STORAGE_KEY,
  RECOMMENDATION_WEIGHTS,
  clearRecentHistory,
  clearSeen,
  emptyPersonalization,
  hasPersonalizationSignal,
  isPublishedCatalogApp,
  markAppsSeen,
  normalizeCategory,
  normalizeSlug,
  parsePersonalization,
  recommendApps,
  recordView,
  resetPersonalization,
  resolveRecentApps,
  sanitizePersonalization,
  setCategoryPreferences,
  setPersonalizationOptions,
  type CatalogAppLike,
  type PersonalizationState,
} from '@/lib/personalization/model';
import {
  PERSONALIZATION_EVENT,
  clearPersonalization,
  isPersonalizationAvailable,
  loadPersonalization,
  loadPersonalizationDetailed,
  savePersonalization,
  subscribePersonalization,
  updatePersonalization,
} from '@/lib/personalization/store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-31T11:00:00.000Z');

/* ------------------------------------------------------------------ *
 * Fake browser storage (the test environment is plain node)
 * ------------------------------------------------------------------ */

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

let storage: MemoryStorage;
let fakeWindow: EventTarget & { localStorage: MemoryStorage };

function installWindow(): void {
  storage = new MemoryStorage();
  fakeWindow = Object.assign(new EventTarget(), { localStorage: storage });
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
}

function removeWindow(): void {
  delete (globalThis as unknown as { window?: unknown }).window;
}

function dispatchStorageEvent(key: string | null): void {
  const event = new Event('storage') as Event & { key: string | null };
  Object.defineProperty(event, 'key', { value: key });
  fakeWindow.dispatchEvent(event);
}

/* ------------------------------------------------------------------ *
 * Fixtures: a small catalog with facts only (no popularity anywhere)
 * ------------------------------------------------------------------ */

function app(partial: Partial<CatalogAppLike> & { slug: string }): CatalogAppLike {
  return { published: true, ...partial };
}

const CATALOG: CatalogAppLike[] = [
  app({ slug: 'cineflow', name: 'CineFlow', category: 'Entertainment', type: 'android', tags: ['video', 'player', 'offline'], updatedAt: '2026-10-29T00:00:00.000Z' }),
  app({ slug: 'studyria', name: 'Studyria', category: 'Education', type: 'both', tags: ['notes', 'offline'], updatedAt: '2026-10-20T00:00:00.000Z' }),
  app({ slug: 'pdfminifly', name: 'PDFMiniFly', category: 'Utilities', type: 'android', tags: ['pdf', 'offline'], updatedAt: '2026-09-01T00:00:00.000Z' }),
  app({ slug: 'niramay', name: 'Niramay', category: 'Health', type: 'android', tags: ['wellness'], updatedAt: '2026-01-01T00:00:00.000Z' }),
  app({ slug: 'billcraft', name: 'BillCraft', category: 'Business', type: 'both', tags: ['invoices', 'offline'], updatedAt: '2026-03-01T00:00:00.000Z' }),
  app({ slug: 'nexdrop', name: 'NexDrop', category: 'Utilities', type: 'android', tags: ['transfer', 'offline'], updatedAt: '2026-10-25T00:00:00.000Z' }),
  app({ slug: 'appmintly', name: 'AppMintly', category: 'Productivity', type: 'web', tags: ['directory'], updatedAt: '2026-10-30T00:00:00.000Z' }),
  app({ slug: 'unpublished-demo', name: 'Draft App', published: false, category: 'Entertainment', type: 'android', tags: ['video'], updatedAt: '2026-10-30T00:00:00.000Z' }),
];

function stateWith(partial: Partial<PersonalizationState>): PersonalizationState {
  return { ...emptyPersonalization(), ...partial };
}

/* ------------------------------------------------------------------ *
 * Storage parsing and versioning
 * ------------------------------------------------------------------ */

describe('personalization model — storage parsing', () => {
  it('accepts a well-formed v1 payload', () => {
    const parsed = parsePersonalization(
      JSON.stringify({
        version: 1,
        recent: [{ slug: 'cineflow', at: NOW - 1000 }],
        seen: ['studyria'],
        preferences: { categories: ['Education'], recommendations: false, recentEnabled: true },
        lastVisit: NOW - 5000,
      }),
      NOW
    );
    expect(parsed.reset).toBe(false);
    expect(parsed.dropped).toBe(0);
    expect(parsed.state.recent).toEqual([{ slug: 'cineflow', at: NOW - 1000 }]);
    expect(parsed.state.seen).toEqual(['studyria']);
    expect(parsed.state.preferences).toEqual({
      categories: ['Education'],
      recommendations: false,
      recentEnabled: true,
    });
    expect(parsed.state.lastVisit).toBe(NOW - 5000);
  });

  it('treats missing storage as an empty state, not a failure', () => {
    for (const raw of [null, '']) {
      const parsed = parsePersonalization(raw, NOW);
      expect(parsed.state).toEqual(emptyPersonalization());
      expect(parsed.reset).toBe(false);
      expect(parsed.reason).toBeNull();
    }
  });

  it('resets on corrupt JSON instead of throwing', () => {
    const parsed = parsePersonalization('{not json', NOW);
    expect(parsed.reset).toBe(true);
    expect(parsed.reason).toBe('invalid-json');
    expect(parsed.state).toEqual(emptyPersonalization());
  });

  it('resets values that are not objects', () => {
    for (const raw of ['null', '5', '"text"', '[]', 'true']) {
      const parsed = parsePersonalization(raw, NOW);
      expect(parsed.reset, raw).toBe(true);
      expect(parsed.reason, raw).toBe('not-an-object');
      expect(parsed.state, raw).toEqual(emptyPersonalization());
    }
  });

  it('resets a payload with no version', () => {
    const parsed = sanitizePersonalization({ recent: [], seen: [] }, NOW);
    expect(parsed.reset).toBe(true);
    expect(parsed.reason).toBe('missing-version');
  });

  it('resets a payload written by a newer version instead of guessing', () => {
    const parsed = sanitizePersonalization({ version: 2, recent: [{ slug: 'cineflow', at: 1 }] }, NOW);
    expect(parsed.reset).toBe(true);
    expect(parsed.reason).toBe('future-version');
    expect(parsed.state.recent).toEqual([]);
  });

  it('resets an older version that has no registered migration', () => {
    const parsed = sanitizePersonalization({ version: 0, recent: [] }, NOW);
    expect(parsed.reset).toBe(true);
    expect(parsed.reason).toBe('no-migration-from-0');
  });

  it('keeps the current version on every parse of a valid payload', () => {
    const parsed = sanitizePersonalization({ version: PERSONALIZATION_SCHEMA_VERSION }, NOW);
    expect(parsed.state.version).toBe(PERSONALIZATION_SCHEMA_VERSION);
    expect(parsed.reset).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Sanitization
 * ------------------------------------------------------------------ */

describe('personalization model — sanitization', () => {
  it('normalises slug casing and rejects impossible slugs', () => {
    expect(normalizeSlug('  CineFlow  ')).toBe('cineflow');
    expect(normalizeSlug('cine-flow')).toBe('cine-flow');
    for (const bad of ['', ' ', '../etc/passwd', 'cine flow', '<script>', 'a'.repeat(80), 42, null, {}]) {
      expect(normalizeSlug(bad), String(bad)).toBeNull();
    }
  });

  it('drops duplicates, keeping the newest timestamp', () => {
    const parsed = sanitizePersonalization(
      {
        version: 1,
        recent: [
          { slug: 'cineflow', at: NOW - 9000 },
          { slug: 'CineFlow', at: NOW - 1000 },
          { slug: 'studyria', at: NOW - 5000 },
        ],
      },
      NOW
    );
    expect(parsed.state.recent).toEqual([
      { slug: 'cineflow', at: NOW - 1000 },
      { slug: 'studyria', at: NOW - 5000 },
    ]);
    expect(parsed.dropped).toBe(1);
  });

  it('drops recent entries with invalid timestamps or shapes', () => {
    const parsed = sanitizePersonalization(
      {
        version: 1,
        recent: [
          { slug: 'cineflow', at: 'yesterday' },
          { slug: 'studyria', at: -5 },
          { slug: 'nexdrop', at: Number.NaN },
          'cineflow',
          null,
          { slug: 'billcraft', at: NOW - 10 },
        ],
      },
      NOW
    );
    expect(parsed.state.recent).toEqual([{ slug: 'billcraft', at: NOW - 10 }]);
    expect(parsed.dropped).toBe(5);
  });

  it('clamps a timestamp from the future instead of trusting it', () => {
    const future = NOW + 6 * 60 * 60 * 1000;
    const parsed = sanitizePersonalization({ version: 1, recent: [{ slug: 'cineflow', at: future }] }, NOW);
    expect(parsed.state.recent[0].at).toBeLessThanOrEqual(NOW + 5 * 60 * 1000);
  });

  it('enforces the caps on recent, seen and categories', () => {
    const manyRecent = Array.from({ length: 40 }, (_, i) => ({ slug: `app-${i}`, at: NOW - i * 1000 }));
    const manySeen = Array.from({ length: 300 }, (_, i) => `seen-${i}`);
    const manyCategories = Array.from({ length: 20 }, (_, i) => `Category ${i}`);
    const parsed = sanitizePersonalization(
      { version: 1, recent: manyRecent, seen: manySeen, preferences: { categories: manyCategories } },
      NOW
    );
    expect(parsed.state.recent).toHaveLength(PERSONALIZATION_LIMITS.recent);
    expect(parsed.state.seen).toHaveLength(PERSONALIZATION_LIMITS.seen);
    expect(parsed.state.preferences.categories).toHaveLength(PERSONALIZATION_LIMITS.categories);
    // Trimming is reported, not silent, and the newest entries survive.
    expect(parsed.state.recent[0].slug).toBe('app-0');
    expect(parsed.dropped).toBeGreaterThan(0);
  });

  it('dedupes and caps the seen list', () => {
    const parsed = sanitizePersonalization(
      { version: 1, seen: ['cineflow', 'CineFlow', 'studyria', 12, ''] },
      NOW
    );
    expect(parsed.state.seen).toEqual(['cineflow', 'studyria']);
    expect(parsed.dropped).toBe(3);
  });

  it('repairs invalid booleans to the safe default (on)', () => {
    const parsed = sanitizePersonalization(
      { version: 1, preferences: { recommendations: 'yes', recentEnabled: 1 } },
      NOW
    );
    expect(parsed.state.preferences.recommendations).toBe(true);
    expect(parsed.state.preferences.recentEnabled).toBe(true);
    expect(parsed.dropped).toBe(2);
  });

  it('sanitizes category names and rejects markup', () => {
    expect(normalizeCategory('  Education ')).toBe('Education');
    expect(normalizeCategory('Health & Fitness')).toBe('Health & Fitness');
    expect(normalizeCategory('<img src=x onerror=alert(1)>')).toBeNull();
    expect(normalizeCategory('x'.repeat(60))).toBeNull();
    const parsed = sanitizePersonalization(
      { version: 1, preferences: { categories: ['Education', 'education', 'Utilities', '<b>bad</b>'] } },
      NOW
    );
    expect(parsed.state.preferences.categories).toEqual(['Education', 'Utilities']);
    expect(parsed.dropped).toBe(2);
  });

  it('ignores unknown keys instead of copying them through', () => {
    const parsed = sanitizePersonalization(
      { version: 1, recent: [], seen: [], admin: true, downloads: 999 },
      NOW
    );
    // Batch 4 added `collections` to the contract; the test still proves that
    // arbitrary keys from storage are dropped rather than copied through.
    expect(Object.keys(parsed.state).sort()).toEqual(
      ['collections', 'lastVisit', 'preferences', 'recent', 'seen', 'version'].sort()
    );
    expect(parsed.state).not.toHaveProperty('admin');
    expect(parsed.state).not.toHaveProperty('downloads');
  });
});

/* ------------------------------------------------------------------ *
 * Reducers
 * ------------------------------------------------------------------ */

describe('personalization model — reducers', () => {
  it('records a view, moves a repeat view to the front and caps the list', () => {
    let state = emptyPersonalization();
    for (let i = 0; i < 30; i += 1) {
      state = recordView(state, `app-${i}`, NOW + i);
    }
    expect(state.recent).toHaveLength(PERSONALIZATION_LIMITS.recent);
    state = recordView(state, 'app-20', NOW + 1000);
    expect(state.recent[0]).toEqual({ slug: 'app-20', at: NOW + 1000 });
    expect(state.recent.filter((entry) => entry.slug === 'app-20')).toHaveLength(1);
  });

  it('does not record a view when recent history is switched off', () => {
    const state = setPersonalizationOptions(emptyPersonalization(), { recentEnabled: false });
    expect(recordView(state, 'cineflow', NOW).recent).toEqual([]);
  });

  it('ignores an unusable slug rather than storing it', () => {
    const state = recordView(emptyPersonalization(), '../etc/passwd', NOW);
    expect(state.recent).toEqual([]);
  });

  it('never wipes existing history when history is switched off', () => {
    const seeded = recordView(emptyPersonalization(), 'cineflow', NOW);
    const off = setPersonalizationOptions(seeded, { recentEnabled: false });
    expect(off.recent).toHaveLength(1);
    expect(clearRecentHistory(off).recent).toEqual([]);
  });

  it('marks seen apps without duplicates and keeps the newest', () => {
    let state = markAppsSeen(emptyPersonalization(), ['cineflow', 'studyria']);
    state = markAppsSeen(state, ['cineflow', 'nexdrop', 'bad slug']);
    expect(state.seen).toEqual(['studyria', 'cineflow', 'nexdrop']);
    expect(clearSeen(state).seen).toEqual([]);
  });

  it('sets categories through the sanitizer', () => {
    const state = setCategoryPreferences(emptyPersonalization(), ['Education', 'Education', '<b>']);
    expect(state.preferences.categories).toEqual(['Education']);
  });

  it('resets to a clean empty state', () => {
    const state = resetPersonalization();
    expect(state).toEqual(emptyPersonalization());
    expect(state.recent).toEqual([]);
    expect(state.seen).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Catalog resolution
 * ------------------------------------------------------------------ */

describe('personalization model — catalog resolution', () => {
  it('requires an explicit published flag', () => {
    expect(isPublishedCatalogApp(app({ slug: 'a' }))).toBe(true);
    expect(isPublishedCatalogApp(app({ slug: 'a', published: false }))).toBe(false);
    expect(isPublishedCatalogApp({ slug: 'a' })).toBe(false);
    expect(isPublishedCatalogApp(null)).toBe(false);
  });

  it('hides unpublished and unknown apps without touching storage', () => {
    const state = stateWith({
      recent: [
        { slug: 'cineflow', at: NOW - 1000 },
        { slug: 'unpublished-demo', at: NOW - 2000 },
        { slug: 'not-in-catalog', at: NOW - 3000 },
      ],
    });
    const resolved = resolveRecentApps(state, CATALOG);
    expect(resolved.items.map((item) => item.app.slug)).toEqual(['cineflow']);
    expect(resolved.hidden).toBe(2);
    // The stored payload is unchanged: hiding is a read-time decision.
    expect(state.recent).toHaveLength(3);
  });

  it('returns nothing at all when the catalog is empty', () => {
    const state = stateWith({ recent: [{ slug: 'cineflow', at: NOW }] });
    expect(resolveRecentApps(state, []).items).toEqual([]);
    expect(resolveRecentApps(state, []).hidden).toBe(1);
  });

  it('respects the display limit', () => {
    const state = stateWith({
      recent: [
        { slug: 'cineflow', at: NOW - 1 },
        { slug: 'studyria', at: NOW - 2 },
        { slug: 'nexdrop', at: NOW - 3 },
      ],
    });
    const resolved = resolveRecentApps(state, CATALOG, 2);
    expect(resolved.items.map((item) => item.app.slug)).toEqual(['cineflow', 'studyria']);
  });
});

/* ------------------------------------------------------------------ *
 * Recommendations
 * ------------------------------------------------------------------ */

describe('personalization model — recommendations', () => {
  it('recommends from a followed category and says so', () => {
    const state = setCategoryPreferences(emptyPersonalization(), ['Education']);
    const results = recommendApps({ catalog: CATALOG, state, now: NOW, limit: 5 });
    const studyria = results.find((entry) => entry.app.slug === 'studyria');
    expect(studyria).toBeDefined();
    expect(studyria?.reasons[0]).toBe('In a category you follow: Education.');
    expect(studyria?.score).toBeGreaterThanOrEqual(RECOMMENDATION_WEIGHTS.followedCategory);
  });

  it('uses the category of an app the visitor opened', () => {
    const state = recordView(emptyPersonalization(), 'cineflow', NOW);
    const results = recommendApps({ catalog: CATALOG, state, now: NOW, limit: 5 });
    const studyria = results.find((entry) => entry.app.slug === 'studyria');
    // Studyria shares the "offline" tag with CineFlow, which is the real signal.
    expect(studyria?.reasons.some((reason) => reason.startsWith('Shares 1 tag'))).toBe(true);
  });

  it('never recommends an app the visitor already viewed, saved or was shown', () => {
    const state = stateWith({
      recent: [{ slug: 'cineflow', at: NOW - 1 }],
      seen: ['studyria'],
      preferences: { categories: ['Entertainment'], recommendations: true, recentEnabled: true },
    });
    const results = recommendApps({
      catalog: CATALOG,
      state,
      savedSlugs: ['nexdrop'],
      now: NOW,
      limit: 10,
    });
    const slugs = results.map((entry) => entry.app.slug);
    expect(slugs).not.toContain('cineflow');
    expect(slugs).not.toContain('studyria');
    expect(slugs).not.toContain('nexdrop');
  });

  it('never recommends an unpublished app', () => {
    const state = setCategoryPreferences(emptyPersonalization(), ['Entertainment']);
    const results = recommendApps({ catalog: CATALOG, state, now: NOW, limit: 10 });
    expect(results.map((entry) => entry.app.slug)).not.toContain('unpublished-demo');
    expect(results.every((entry) => entry.app.published === true)).toBe(true);
  });

  it('returns nothing when the visitor has given no signal', () => {
    const results = recommendApps({ catalog: CATALOG, state: emptyPersonalization(), now: NOW, limit: 5 });
    expect(results).toEqual([]);
    expect(hasPersonalizationSignal(emptyPersonalization())).toBe(false);
  });

  it('reports a signal only when one exists', () => {
    expect(hasPersonalizationSignal(stateWith({ recent: [{ slug: 'cineflow', at: NOW }] }))).toBe(true);
    expect(hasPersonalizationSignal(stateWith({ preferences: { categories: ['Education'], recommendations: true, recentEnabled: true } }))).toBe(true);
    expect(hasPersonalizationSignal(emptyPersonalization(), ['cineflow'])).toBe(true);
  });

  it('scores only from catalog facts, never from invented popularity', () => {
    const plain = recommendApps({
      catalog: CATALOG,
      state: setCategoryPreferences(emptyPersonalization(), ['Utilities']),
      now: NOW,
      limit: 10,
    });
    // Same catalog, same signals, but with fake engagement numbers bolted on.
    const withFakeMetrics = CATALOG.map((entry) => ({
      ...entry,
      downloads: 10_000_000,
      installs: 5_000_000,
      rating: 4.9,
      ratingCount: 12_345,
      popularity: 99,
      trending: true,
    }));
    const noisy = recommendApps({
      catalog: withFakeMetrics,
      state: setCategoryPreferences(emptyPersonalization(), ['Utilities']),
      now: NOW,
      limit: 10,
    });
    expect(noisy.map((entry) => [entry.app.slug, entry.score])).toEqual(
      plain.map((entry) => [entry.app.slug, entry.score])
    );
  });

  it('awards freshness only to an app that already earned a personal signal', () => {
    const recent = new Date(NOW - 10 * DAY).toISOString();
    const stale = new Date(NOW - (FRESH_WINDOW_DAYS + 30) * DAY).toISOString();
    const pair: CatalogAppLike[] = [
      app({ slug: 'fresh-util', name: 'Fresh Util', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: recent }),
      app({ slug: 'stale-util', name: 'Stale Util', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: stale }),
      // Fresh, but nothing about it matches this visitor: must not appear at all.
      app({ slug: 'fresh-other', name: 'Fresh Other', category: 'Music', type: 'web', tags: ['y'], updatedAt: recent }),
    ];
    const state = setCategoryPreferences(emptyPersonalization(), ['Utilities']);
    const results = recommendApps({ catalog: pair, state, now: NOW, limit: 10 });
    const slugs = results.map((entry) => entry.app.slug);
    expect(slugs).toEqual(['fresh-util', 'stale-util']);
    expect(results[0].reasons).toContain(`Updated within the last ${FRESH_WINDOW_DAYS} days.`);
    expect(results[1].reasons.some((reason) => reason.startsWith('Updated within the last'))).toBe(false);
    expect(results[1].score).toBe(results[0].score - RECOMMENDATION_WEIGHTS.freshness);
    expect(slugs).not.toContain('fresh-other');
  });

  it('explains every recommendation with at least one real reason', () => {
    const state = markAppsSeen(recordView(emptyPersonalization(), 'cineflow', NOW), []);
    const results = recommendApps({
      catalog: CATALOG,
      state: setCategoryPreferences(state, ['Utilities']),
      now: NOW,
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.reasons.length).toBeGreaterThan(0);
      expect(entry.reasons.length).toBeLessThanOrEqual(3);
      expect(entry.score).toBeGreaterThan(0);
      for (const reason of entry.reasons) {
        // No filler, no popularity language.
        expect(reason).not.toMatch(/popular|trending|most downloaded|installs|rating|% of users/i);
      }
    }
  });

  it('is deterministic and breaks ties by name then slug', () => {
    const twins: CatalogAppLike[] = [
      app({ slug: 'zulu', name: 'Zulu', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: '2026-09-01T00:00:00.000Z' }),
      app({ slug: 'alpha', name: 'Alpha', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: '2026-09-01T00:00:00.000Z' }),
      app({ slug: 'bravo', name: 'Bravo', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: '2026-09-01T00:00:00.000Z' }),
    ];
    const state = setCategoryPreferences(emptyPersonalization(), ['Utilities']);
    const first = recommendApps({ catalog: twins, state, now: NOW, limit: 3 });
    const second = recommendApps({ catalog: twins, state, now: NOW, limit: 3 });
    expect(first.map((entry) => entry.app.slug)).toEqual(['alpha', 'bravo', 'zulu']);
    expect(second).toEqual(first);
  });

  it('breaks an equal-score tie by the newer real release date first', () => {
    const pair: CatalogAppLike[] = [
      app({ slug: 'older', name: 'Same Name', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: '2026-01-01T00:00:00.000Z' }),
      app({ slug: 'newer', name: 'Same Name', category: 'Utilities', type: 'android', tags: ['x'], updatedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    const state = setCategoryPreferences(emptyPersonalization(), ['Utilities']);
    const results = recommendApps({ catalog: pair, state, now: NOW, limit: 2 });
    expect(results.map((entry) => entry.app.slug)).toEqual(['newer', 'older']);
  });

  it('honours the limit and returns at most what qualifies', () => {
    const state = setCategoryPreferences(emptyPersonalization(), ['Utilities']);
    expect(recommendApps({ catalog: CATALOG, state, now: NOW, limit: 1 })).toHaveLength(1);
    expect(recommendApps({ catalog: CATALOG, state, now: NOW, limit: 0 })).toEqual([]);
  });

  it('cannot produce two recommendations for the same app', () => {
    const duplicated = [...CATALOG, ...CATALOG];
    const state = setCategoryPreferences(emptyPersonalization(), ['Utilities']);
    const results = recommendApps({ catalog: duplicated, state, now: NOW, limit: 10 });
    const slugs = results.map((entry) => entry.app.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

/* ------------------------------------------------------------------ *
 * Store: versioned key, isolation, corrupt storage, cross-tab
 * ------------------------------------------------------------------ */

describe('personalization store', () => {
  beforeEach(() => installWindow());
  afterEach(() => {
    removeWindow();
    vi.restoreAllMocks();
  });

  it('uses the versioned key and nothing else', () => {
    expect(PERSONALIZATION_STORAGE_KEY).toBe('appmintly.personalization.v1');
    updatePersonalization((state) => recordView(state, 'cineflow', NOW), NOW);
    expect(storage.getItem(PERSONALIZATION_STORAGE_KEY)).toBeTruthy();
    expect(storage.length).toBe(1);
  });

  it('round-trips a record and reloads it', () => {
    const state = recordView(emptyPersonalization(), 'cineflow', NOW);
    expect(savePersonalization(state)).toBe(true);
    const loaded = loadPersonalization(NOW);
    expect(loaded.recent).toEqual([{ slug: 'cineflow', at: NOW }]);
    expect(loaded.version).toBe(PERSONALIZATION_SCHEMA_VERSION);
  });

  it('sanitizes before writing, so caps cannot be bypassed by a caller', () => {
    const oversized: PersonalizationState = {
      ...emptyPersonalization(),
      recent: Array.from({ length: 50 }, (_, i) => ({ slug: `app-${i}`, at: NOW - i })),
    };
    savePersonalization(oversized);
    const stored = JSON.parse(storage.getItem(PERSONALIZATION_STORAGE_KEY) || '{}');
    expect(stored.recent).toHaveLength(PERSONALIZATION_LIMITS.recent);
  });

  it('recovers from corrupt storage without throwing', () => {
    storage.setItem(PERSONALIZATION_STORAGE_KEY, '{oops');
    const detailed = loadPersonalizationDetailed(NOW);
    expect(detailed.reset).toBe(true);
    expect(detailed.reason).toBe('invalid-json');
    expect(detailed.recovered).toBe(true);
    expect(detailed.state).toEqual(emptyPersonalization());
    // The unreadable payload is left alone until the next successful write.
    expect(storage.getItem(PERSONALIZATION_STORAGE_KEY)).toBe('{oops');
  });

  it('recovers from a foreign schema version', () => {
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify({ version: 7, recent: [] }));
    const detailed = loadPersonalizationDetailed(NOW);
    expect(detailed.reset).toBe(true);
    expect(detailed.reason).toBe('future-version');
  });

  it('only ever removes its own key', () => {
    storage.setItem('appforge_local_favorites', '["cineflow"]');
    storage.setItem('appmintly.compare.v1', '{"version":1,"ids":["cineflow"]}');
    storage.setItem('appmintly_update_watch_v1', '["cineflow"]');
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(emptyPersonalization()));

    clearPersonalization();

    expect(storage.getItem(PERSONALIZATION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('appforge_local_favorites')).toBe('["cineflow"]');
    expect(storage.getItem('appmintly.compare.v1')).toBe('{"version":1,"ids":["cineflow"]}');
    expect(storage.getItem('appmintly_update_watch_v1')).toBe('["cineflow"]');
  });

  it('leaves other modules keys untouched during ordinary writes', () => {
    storage.setItem('appforge_local_opened', '[{"appId":"cineflow","at":1}]');
    storage.setItem('appmintly_installs_v1', '{"schemaVersion":1,"apps":{}}');
    updatePersonalization((state) => recordView(state, 'studyria', NOW), NOW);
    expect(storage.getItem('appforge_local_opened')).toBe('[{"appId":"cineflow","at":1}]');
    expect(storage.getItem('appmintly_installs_v1')).toBe('{"schemaVersion":1,"apps":{}}');
  });

  it('fires a same-tab event after a write', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalization(listener);
    updatePersonalization((state) => recordView(state, 'cineflow', NOW), NOW);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    savePersonalization(emptyPersonalization());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reacts to a write from another tab', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalization(listener);
    dispatchStorageEvent(PERSONALIZATION_STORAGE_KEY);
    expect(listener).toHaveBeenCalledTimes(1);
    dispatchStorageEvent('some-other-key');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('treats a throwing localStorage as unavailable, not as a crash', () => {
    expect(isPersonalizationAvailable()).toBe(true);
    const original = fakeWindow.localStorage.setItem.bind(fakeWindow.localStorage);
    fakeWindow.localStorage.setItem = () => {
      throw new Error('quota');
    };
    expect(isPersonalizationAvailable()).toBe(false);
    expect(savePersonalization(emptyPersonalization())).toBe(false);
    fakeWindow.localStorage.setItem = original;
  });

  it('reports no storage at all when window is missing (server render)', () => {
    removeWindow();
    expect(isPersonalizationAvailable()).toBe(false);
    expect(loadPersonalization(NOW)).toEqual(emptyPersonalization());
    expect(savePersonalization(emptyPersonalization())).toBe(false);
    expect(subscribePersonalization(() => {})()).toBeUndefined();
    expect(PERSONALIZATION_EVENT).toBe('appmintly_personalization_updated');
    installWindow();
  });
});
