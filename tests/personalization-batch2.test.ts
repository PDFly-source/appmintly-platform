/**
 * Item 10 / Batch 2 — Recently Viewed experience.
 *
 * Proves the integration layer, not the rendering: which visits are recorded,
 * how history orders and caps, that unpublished apps are hidden but kept, that
 * clearing touches history only, and that the opt-out stops recording without
 * destroying what exists.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERSONALIZATION_LIMITS,
  PERSONALIZATION_STORAGE_KEY,
  emptyPersonalization,
  parsePersonalization,
  recordView,
  type CatalogAppLike,
} from '@/lib/personalization/model';
import {
  clearPersonalization,
  loadPersonalization,
  savePersonalization,
  subscribePersonalization,
} from '@/lib/personalization/store';
import {
  clearRecentlyViewed,
  forgetVisit,
  isRecentRecordingEnabled,
  recordPublishedVisit,
  resolveVisibleRecent,
  setRecentRecording,
} from '@/lib/personalization/visits';

const NOW = Date.parse('2026-10-31T11:00:00.000Z');

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

const CATALOG: CatalogAppLike[] = [
  { slug: 'cineflow', name: 'CineFlow', published: true, category: 'Entertainment' },
  { slug: 'studyria', name: 'Studyria', published: true, category: 'Education' },
  { slug: 'pdfminifly', name: 'PDFMiniFly', published: true, category: 'Utilities' },
  { slug: 'draft-app', name: 'Draft App', published: false, category: 'Utilities' },
];

describe('recently viewed — recording', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('records a genuine published detail visit', () => {
    expect(recordPublishedVisit('cineflow', true, NOW)).toBe(true);
    const state = loadPersonalization(NOW);
    expect(state.recent).toEqual([{ slug: 'cineflow', at: NOW }]);
  });

  it('refuses unpublished apps, unknown flags and malformed slugs', () => {
    expect(recordPublishedVisit('draft-app', false, NOW)).toBe(false);
    expect(recordPublishedVisit('cineflow', undefined, NOW)).toBe(false);
    expect(recordPublishedVisit('cineflow', 'true', NOW)).toBe(false);
    expect(recordPublishedVisit('../etc/passwd', true, NOW)).toBe(false);
    expect(recordPublishedVisit('CineFlow', true, NOW)).toBe(true);
    expect(loadPersonalization(NOW).recent.map((entry) => entry.slug)).toEqual(['cineflow']);
  });

  it('keeps the newest visit first and never duplicates an app', () => {
    recordPublishedVisit('cineflow', true, NOW - 3000);
    recordPublishedVisit('studyria', true, NOW - 2000);
    recordPublishedVisit('cineflow', true, NOW);
    const recent = loadPersonalization(NOW).recent;
    expect(recent.map((entry) => entry.slug)).toEqual(['cineflow', 'studyria']);
    expect(recent[0].at).toBe(NOW);
    expect(new Set(recent.map((entry) => entry.slug)).size).toBe(recent.length);
  });

  it('stops recording when the visitor turns history off, and keeps existing entries', () => {
    recordPublishedVisit('cineflow', true, NOW - 1000);
    const state = setRecentRecording(false);
    expect(state.preferences.recentEnabled).toBe(false);
    expect(isRecentRecordingEnabled(NOW)).toBe(false);

    expect(recordPublishedVisit('studyria', true, NOW)).toBe(false);
    const after = loadPersonalization(NOW);
    expect(after.recent.map((entry) => entry.slug)).toEqual(['cineflow']);
  });

  it('resumes recording when the visitor turns it back on', () => {
    recordPublishedVisit('cineflow', true, NOW - 2000);
    setRecentRecording(false);
    recordPublishedVisit('studyria', true, NOW - 1000);
    setRecentRecording(true);
    expect(recordPublishedVisit('studyria', true, NOW)).toBe(true);
    expect(loadPersonalization(NOW).recent.map((entry) => entry.slug)).toEqual([
      'studyria',
      'cineflow',
    ]);
  });
});

describe('recently viewed — history behaviour', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('keeps the 24 entry cap through the real store', () => {
    for (let i = 0; i < 30; i += 1) recordPublishedVisit(`app-${i}`, true, NOW + i);
    const recent = loadPersonalization(NOW + 100).recent;
    expect(recent).toHaveLength(PERSONALIZATION_LIMITS.recent);
    expect(recent[0].slug).toBe('app-29');
    expect(recent[recent.length - 1].slug).toBe('app-6');
  });

  it('clears history only, leaving saved apps and other stores untouched', () => {
    storage.setItem('appforge_local_favorites', '["cineflow"]');
    storage.setItem('appmintly_upcoming_wishlist_v1', '{"version":1,"items":[]}');
    storage.setItem('appmintly.compare.v1', '{"version":1,"ids":["studyria"]}');
    storage.setItem('appmintly_installs_v1', '{"schemaVersion":1,"apps":{}}');
    recordPublishedVisit('cineflow', true, NOW - 1000);
    recordPublishedVisit('studyria', true, NOW);

    const cleared = clearRecentlyViewed();

    expect(cleared.recent).toEqual([]);
    expect(storage.getItem('appforge_local_favorites')).toBe('["cineflow"]');
    expect(storage.getItem('appmintly_upcoming_wishlist_v1')).toBe('{"version":1,"items":[]}');
    expect(storage.getItem('appmintly.compare.v1')).toBe('{"version":1,"ids":["studyria"]}');
    expect(storage.getItem('appmintly_installs_v1')).toBe('{"schemaVersion":1,"apps":{}}');
    // Still one key for personalization, never a second one.
    expect(storage.length).toBe(5);
  });

  it('removes a single visit without touching the rest', () => {
    recordPublishedVisit('cineflow', true, NOW - 2000);
    recordPublishedVisit('studyria', true, NOW - 1000);
    const state = forgetVisit('CineFlow');
    expect(state.recent.map((entry) => entry.slug)).toEqual(['studyria']);
  });

  it('hides unpublished and unknown entries without deleting them', () => {
    savePersonalization({
      ...emptyPersonalization(),
      recent: [
        { slug: 'cineflow', at: NOW },
        { slug: 'draft-app', at: NOW - 1000 },
        { slug: 'vanished-app', at: NOW - 2000 },
      ],
    });
    const visible = resolveVisibleRecent(CATALOG, loadPersonalization(NOW));
    expect(visible.items.map((item) => item.app.slug)).toEqual(['cineflow']);
    expect(visible.hidden).toBe(2);
    // Nothing was destroyed: the records are still on disk.
    const stored = JSON.parse(storage.getItem(PERSONALIZATION_STORAGE_KEY) || '{}');
    expect(stored.recent.map((entry: { slug: string }) => entry.slug)).toEqual([
      'cineflow',
      'draft-app',
      'vanished-app',
    ]);
  });

  it('reports an empty visible list when every stored entry is unavailable', () => {
    savePersonalization({
      ...emptyPersonalization(),
      recent: [
        { slug: 'draft-app', at: NOW },
        { slug: 'vanished-app', at: NOW - 1000 },
      ],
    });
    const visible = resolveVisibleRecent(CATALOG, loadPersonalization(NOW));
    expect(visible.items).toEqual([]);
    expect(visible.hidden).toBe(2);
  });

  it('reads a Batch 1 payload unchanged (no schema change in Batch 2)', () => {
    const batchOne = JSON.stringify({
      version: 1,
      recent: [{ slug: 'cineflow', at: NOW - 500 }],
      seen: ['studyria'],
      preferences: { categories: ['Education'], recommendations: true, recentEnabled: false },
      lastVisit: NOW - 100,
    });
    storage.setItem(PERSONALIZATION_STORAGE_KEY, batchOne);
    const parsed = parsePersonalization(storage.getItem(PERSONALIZATION_STORAGE_KEY), NOW);
    expect(parsed.reset).toBe(false);
    expect(parsed.dropped).toBe(0);
    expect(parsed.state.recent).toEqual([{ slug: 'cineflow', at: NOW - 500 }]);
    expect(parsed.state.preferences.recentEnabled).toBe(false);
    // A disabled recording preference is respected on the way in.
    expect(recordPublishedVisit('studyria', true, NOW)).toBe(false);
  });

  it('does not create a second personalization key', () => {
    recordPublishedVisit('cineflow', true, NOW);
    setRecentRecording(false);
    clearRecentlyViewed();
    clearPersonalization();
    expect(storage.length).toBe(0);
  });
});

describe('recently viewed — synchronisation and UI selectors', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('notifies subscribers so the Library re-renders after a visit', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalization(listener);
    recordPublishedVisit('cineflow', true, NOW);
    expect(listener).toHaveBeenCalledTimes(1);
    clearRecentlyViewed();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    recordPublishedVisit('studyria', true, NOW);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reflects a write made by another tab', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalization(listener);
    const event = new Event('storage') as Event & { key: string | null };
    Object.defineProperty(event, 'key', { value: PERSONALIZATION_STORAGE_KEY });
    // Another tab writes: our snapshot must be replaced, not merged.
    storage.setItem(
      PERSONALIZATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        recent: [{ slug: 'studyria', at: NOW }],
        seen: [],
        preferences: { categories: [], recommendations: true, recentEnabled: true },
        lastVisit: null,
      })
    );
    fakeWindow.dispatchEvent(event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadPersonalization(NOW).recent.map((entry) => entry.slug)).toEqual(['studyria']);
    const visible = resolveVisibleRecent(CATALOG, loadPersonalization(NOW));
    expect(visible.items.map((item) => item.app.slug)).toEqual(['studyria']);
    unsubscribe();
  });

  it('orders visible history newest first and respects a display limit', () => {
    const state = {
      ...emptyPersonalization(),
      recent: [
        { slug: 'cineflow', at: NOW },
        { slug: 'studyria', at: NOW - 1000 },
        { slug: 'pdfminifly', at: NOW - 2000 },
      ],
    };
    const all = resolveVisibleRecent(CATALOG, state);
    expect(all.items.map((item) => item.app.slug)).toEqual(['cineflow', 'studyria', 'pdfminifly']);
    expect(all.items[0].at).toBe(NOW);
    const capped = resolveVisibleRecent(CATALOG, state, 2);
    expect(capped.items.map((item) => item.app.slug)).toEqual(['cineflow', 'studyria']);
  });

  it('produces an empty selector for a brand new browser', () => {
    const visible = resolveVisibleRecent(CATALOG, loadPersonalization(NOW));
    expect(visible).toEqual({ items: [], hidden: 0 });
    // recordView on an opted-out state is a no-op and returns the same object,
    // so no redundant write is triggered.
    const optedOut = {
      ...emptyPersonalization(),
      preferences: { categories: [], recommendations: true, recentEnabled: false },
    };
    expect(recordView(optedOut, 'cineflow', NOW)).toBe(optedOut);
  });
});
