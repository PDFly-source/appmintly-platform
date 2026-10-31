/**
 * AppMintly 2.0 — app comparison (Item 2).
 *
 * The engine must compare published catalog records only, never invent a value
 * and never let a stale local selection render a phantom app.
 */
import { describe, expect, it } from 'vitest';
import catalog from '../data/apps.json';
import {
  COMPARE_STORAGE_KEY,
  MAX_COMPARE,
  NOT_SPECIFIED,
  buildComparison,
  formatBytes,
  isReadyToCompare,
  loadSelection,
  parseStoredSelection,
  remainingSlots,
  sanitizeSelection,
  saveSelection,
  serializeSelection,
  toggleSelection,
  type ComparableApp,
  type StorageLike,
} from '../lib/compare';

const apps = catalog as unknown as ComparableApp[];
const published = apps.filter((a) => a.published);
const ids = published.slice(0, 3).map((a) => a.id as string);

const memoryStorage = (initial: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } => {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = v;
    },
    dump: () => map,
  };
};

const minimalApp = (over: Partial<ComparableApp> = {}): ComparableApp => ({
  id: 'min',
  slug: 'min',
  name: 'Minimal',
  published: true,
  ...over,
});

describe('selection rules', () => {
  it('compares two apps', () => {
    const result = buildComparison(apps, ids.slice(0, 2));
    expect(result.apps).toHaveLength(2);
    expect(result.ready).toBe(true);
    for (const row of result.rows) {
      expect(Object.keys(row.values)).toHaveLength(2);
    }
  });

  it('compares three apps', () => {
    const result = buildComparison(apps, ids);
    expect(result.apps).toHaveLength(3);
    expect(result.ready).toBe(true);
  });

  it('a single app is selected but not yet comparable', () => {
    const result = buildComparison(apps, ids.slice(0, 1));
    expect(result.apps).toHaveLength(1);
    expect(result.ready).toBe(false);
    expect(isReadyToCompare([ids[0]])).toBe(false);
  });

  it('duplicates are collapsed, never rendered twice', () => {
    const { ids: clean, duplicates } = sanitizeSelection([ids[0], ids[0], ids[1]], apps);
    expect(clean).toEqual([ids[0], ids[1]]);
    expect(duplicates).toEqual([ids[0]]);
  });

  it('enforces the three-app maximum', () => {
    const four = published.slice(0, 4).map((a) => a.id as string);
    const { ids: clean } = sanitizeSelection(four, apps);
    expect(clean).toHaveLength(MAX_COMPARE);
    expect(remainingSlots(clean)).toBe(0);
    const attempt = toggleSelection(clean, four[3], apps);
    expect(attempt.action).toBe('limit');
    expect(attempt.ids).toEqual(clean);
  });

  it('toggling adds then removes the same app', () => {
    const added = toggleSelection([], ids[0], apps);
    expect(added.action).toBe('added');
    const removed = toggleSelection(added.ids, ids[0], apps);
    expect(removed.action).toBe('removed');
    expect(removed.ids).toEqual([]);
  });

  it('invalid, unpublished and unknown ids are dropped', () => {
    const draft = (
      catalog as unknown as Array<ComparableApp & { published?: boolean }>
    ).find((a) => !a.published);
    const candidate = ['does-not-exist', draft?.id as string, ids[0]].filter(Boolean);
    const { ids: clean, removed } = sanitizeSelection(candidate, apps);
    expect(clean).toEqual([ids[0]]);
    expect(removed).toContain('does-not-exist');
    if (draft?.id) expect(removed).toContain(draft.id);
    expect(toggleSelection([], 'nope', apps).action).toBe('invalid');
  });

  it('a stale id passed straight to buildComparison cannot render', () => {
    const result = buildComparison(apps, ['ghost-app', ids[0]]);
    expect(result.apps.map((a) => a.id)).toEqual([ids[0]]);
    expect(result.removed).toContain('ghost-app');
  });
});

describe('comparison values are catalog truth', () => {
  it('renders every documented row for two apps', () => {
    const { rows } = buildComparison(apps, ids.slice(0, 2));
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual([
      'category',
      'type',
      'platforms',
      'version',
      'size',
      'download',
      'web',
      'network',
      'privacy',
      'features',
    ]);
  });

  it('missing metadata reads "Not specified", never a guess', () => {
    const bare = minimalApp({ id: 'bare', slug: 'bare' });
    const { rows } = buildComparison([bare], ['bare']);
    const byKey = new Map(rows.map((r) => [r.key, r.values['bare']]));
    expect(byKey.get('category')).toBe(NOT_SPECIFIED);
    expect(byKey.get('type')).toBe(NOT_SPECIFIED);
    expect(byKey.get('version')).toBe(NOT_SPECIFIED);
    expect(byKey.get('size')).toBe(NOT_SPECIFIED);
    expect(byKey.get('network')).toBe(NOT_SPECIFIED);
    expect(byKey.get('privacy')).toBe(NOT_SPECIFIED);
    expect(byKey.get('features')).toBe(NOT_SPECIFIED);
    expect(byKey.get('platforms')).toBe(NOT_SPECIFIED);
  });

  it('never exposes a fabricated score, rating or popularity row', () => {
    const { rows } = buildComparison(apps, ids);
    const text = JSON.stringify(rows).toLowerCase();
    for (const banned of ['rating', 'stars', 'popularity', 'downloads', 'security score', 'performance score']) {
      expect(text).not.toContain(banned);
    }
    for (const key of rows.map((r) => r.key)) {
      expect(['category','type','platforms','version','size','download','web','network','privacy','features']).toContain(key);
    }
  });

  it('formats file size honestly', () => {
    expect(formatBytes(undefined)).toBe(NOT_SPECIFIED);
    expect(formatBytes(0)).toBe(NOT_SPECIFIED);
    expect(formatBytes(276334)).toBe('270 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('download and web availability reflect real release evidence', () => {
    const withApk = published.find((a) => a.apk?.verified && a.apk?.sha256);
    if (withApk) {
      const { rows } = buildComparison(apps, [withApk.id as string]);
      const download = rows.find((r) => r.key === 'download')!.values[withApk.id as string];
      expect(download.startsWith('Available')).toBe(true);
    }
    const bare = minimalApp({ id: 'bare', slug: 'bare' });
    const { rows } = buildComparison([bare], ['bare']);
    expect(rows.find((r) => r.key === 'download')!.values['bare']).toBe('Not available');
    expect(rows.find((r) => r.key === 'web')!.values['bare']).toBe('Not available');
  });
});

describe('persistence and restoration', () => {
  it('round-trips through versioned storage', () => {
    const store = memoryStorage();
    saveSelection(store, ids.slice(0, 2));
    expect(store.getItem(COMPARE_STORAGE_KEY)).toBe(serializeSelection(ids.slice(0, 2)));
    expect(loadSelection(store, apps).ids).toEqual(ids.slice(0, 2));
    expect(JSON.parse(store.getItem(COMPARE_STORAGE_KEY) as string).version).toBe(1);
  });

  it('a saved selection survives a reload (new reader, same store)', () => {
    const store = memoryStorage();
    saveSelection(store, ids);
    expect(loadSelection(store, apps).ids).toEqual(ids);
  });

  it('repairs stale saved ids on load and rewrites storage', () => {
    const store = memoryStorage({
      [COMPARE_STORAGE_KEY]: JSON.stringify({ version: 1, ids: ['ghost', ids[0], ids[0]] }),
    });
    const result = loadSelection(store, apps);
    expect(result.ids).toEqual([ids[0]]);
    expect(result.removed).toEqual(['ghost']);
    expect(parseStoredSelection(store.getItem(COMPARE_STORAGE_KEY)).sort()).toEqual([ids[0]]);
  });

  it('tolerates corrupt, legacy and future payloads', () => {
    expect(parseStoredSelection('{not json')).toEqual([]);
    expect(parseStoredSelection(null)).toEqual([]);
    expect(parseStoredSelection(JSON.stringify(['a', 'b']))).toEqual(['a', 'b']);
    expect(parseStoredSelection(JSON.stringify({ version: 99, ids: ['a'] }))).toEqual(['a']);
    expect(parseStoredSelection(JSON.stringify({ version: 1, ids: [1, 'a'] }))).toEqual(['a']);
  });

  it('survives a blocked storage implementation', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveSelection(broken, ids)).not.toThrow();
    expect(loadSelection(broken, apps).ids).toEqual([]);
  });

  it('comparison storage never collides with the wishlist key', () => {
    expect(COMPARE_STORAGE_KEY).not.toContain('favorites');
    expect(COMPARE_STORAGE_KEY).toBe('appmintly.compare.v1');
  });
});

describe('removal, clear and empty state', () => {
  it('removing one app keeps the rest and their order', () => {
    const two = ids.slice(0, 2);
    const remaining = buildComparison(apps, two.filter((id) => id !== two[0]));
    expect(remaining.apps.map((a) => a.id)).toEqual([two[1]]);
  });

  it('clearing yields the empty state', () => {
    const empty = buildComparison(apps, []);
    expect(empty.apps).toEqual([]);
    expect(empty.rows.every((r) => Object.keys(r.values).length === 0)).toBe(true);
    expect(empty.ready).toBe(false);
  });

  it('sanitising an empty selection is a no-op', () => {
    expect(sanitizeSelection([], apps)).toEqual({ ids: [], removed: [], duplicates: [] });
    expect(sanitizeSelection(null, apps).ids).toEqual([]);
    expect(sanitizeSelection(undefined, apps).ids).toEqual([]);
  });
});

describe('presentation contract', () => {
  it('the compare page ships desktop and mobile layouts with remove and add actions', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const page = readFileSync(join(process.cwd(), 'app/compare/CompareClient.tsx'), 'utf8');
    expect(page).toContain('data-testid="compare-desktop"');
    expect(page).toContain('data-testid="compare-mobile"');
    expect(page).toContain('Add another app');
    expect(page).toContain('Clear');
    expect(page).toContain('Nothing to compare yet');
    // mobile layout must not require horizontal scrolling
    expect(page).not.toMatch(/overflow-x-auto|overflow-x-scroll/);
  });

  it('the page is noindex so it never becomes a thin public page', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const meta = readFileSync(join(process.cwd(), 'app/compare/page.tsx'), 'utf8');
    expect(meta).toContain('index: false');
  });
});
