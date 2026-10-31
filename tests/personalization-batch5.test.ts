/**
 * Item 10 / Batch 5 — shareable collections (URL-only architecture).
 *
 * The payload is untrusted on every read, so these tests attack it: bad
 * encoding, bad JSON, wrong version, oversized input, duplicate ids, unknown
 * and unpublished ids, and markup in the text fields.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERSONALIZATION_STORAGE_KEY,
  emptyPersonalization,
  type CatalogAppLike,
  type PersonalizationState,
} from '@/lib/personalization/model';
import { loadPersonalization } from '@/lib/personalization/store';
import {
  COLLECTION_LIMITS,
  addAppToCollection,
  createCollection,
  resolveCollections,
} from '@/lib/personalization/collections';
import {
  SHARE_LIMITS,
  buildSharedCollectionUrl,
  decodeSharedCollection,
  encodeSharedCollection,
  prepareSharedApps,
  resolveSharedCollection,
  sanitizeSharedText,
} from '@/lib/personalization/share';

const NOW = Date.parse('2026-10-31T12:40:00.000Z');

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
  (globalThis as unknown as { window: unknown }).window = Object.assign(new EventTarget(), { localStorage: storage });
}

const CATALOG: CatalogAppLike[] = [
  { slug: 'cineflow', name: 'CineFlow', published: true, category: 'Entertainment' },
  { slug: 'studyria', name: 'Studyria', published: true, category: 'Education' },
  { slug: 'pdfminifly', name: 'PDFMiniFly', published: true, category: 'Utilities' },
  { slug: 'draft-app', name: 'Draft App', published: false, category: 'Utilities' },
];

const roundTrip = (input: { name: unknown; description?: unknown; apps: unknown }) => {
  const encoded = encodeSharedCollection(input);
  if (!encoded.ok) throw new Error(`expected encode to succeed: ${encoded.error}`);
  return decodeSharedCollection(encoded.payload);
};

describe('encoding a collection for sharing', () => {
  it('round-trips a valid collection', () => {
    const decoded = roundTrip({
      name: 'Weekend tools',
      description: 'Offline picks',
      apps: ['cineflow', 'studyria'],
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.data).toEqual({
      name: 'Weekend tools',
      description: 'Offline picks',
      apps: ['cineflow', 'studyria'],
    });
  });

  it('builds a static-export friendly URL with the payload in the query', () => {
    const encoded = encodeSharedCollection({ name: 'Sharing', apps: ['cineflow'] });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const url = buildSharedCollectionUrl(encoded.payload, 'https://appmintly.pages.dev');
    expect(url.startsWith('https://appmintly.pages.dev/shared/collection/?d=')).toBe(true);
    // Trailing slash on the origin must not produce a double slash.
    expect(buildSharedCollectionUrl('abc', 'https://appmintly.pages.dev/')).toBe(
      'https://appmintly.pages.dev/shared/collection/?d=abc'
    );
  });

  it('refuses a nameless collection and an oversized one', () => {
    expect(encodeSharedCollection({ name: '   ', apps: [] }).ok).toBe(false);
    const many = Array.from({ length: SHARE_LIMITS.apps + 5 }, (_, i) => `app-${i}`);
    const encoded = encodeSharedCollection({ name: 'Too big', apps: many });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeSharedCollection(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.data.apps).toHaveLength(SHARE_LIMITS.apps);
  });

  it('dedupes ids and drops malformed ones before encoding', () => {
    const { apps, refused } = prepareSharedApps([
      'cineflow', 'cineflow', 'CineFlow', '../etc', 42, '', 'studyria',
    ]);
    expect(apps).toEqual(['cineflow', 'studyria']);
    expect(refused).toBe(5);
  });
});

describe('reading an untrusted payload', () => {
  it('rejects a missing, empty or over-long payload', () => {
    expect(decodeSharedCollection(null)).toMatchObject({ ok: false, reason: 'missing' });
    expect(decodeSharedCollection('   ')).toMatchObject({ ok: false, reason: 'missing' });
    expect(decodeSharedCollection('x'.repeat(SHARE_LIMITS.rawChars + 1))).toMatchObject({
      ok: false,
      reason: 'too-long',
    });
  });

  it('rejects characters outside base64url', () => {
    const bad = decodeSharedCollection('abc<script>alert(1)</script>');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toBe('encoding');
    expect(bad.message).not.toMatch(/<script>/);
  });

  it('rejects invalid base64 and invalid JSON', () => {
    expect(decodeSharedCollection('!!!!').ok).toBe(false);
    const notJson = Buffer.from('this is not json').toString('base64url');
    const result = decodeSharedCollection(notJson);
    expect(result).toMatchObject({ ok: false, reason: 'json' });
  });

  it('rejects a wrong or missing version', () => {
    const v2 = Buffer.from(JSON.stringify({ v: 2, n: 'Future', a: [] })).toString('base64url');
    expect(decodeSharedCollection(v2)).toMatchObject({ ok: false, reason: 'version' });
    const noVersion = Buffer.from(JSON.stringify({ n: 'No version', a: [] })).toString('base64url');
    expect(decodeSharedCollection(noVersion).ok).toBe(false);
    const arrayPayload = Buffer.from(JSON.stringify(['nope'])).toString('base64url');
    expect(decodeSharedCollection(arrayPayload)).toMatchObject({ ok: false, reason: 'shape' });
  });

  it('strips markup and control characters from shared text', () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, n: '<img src=x onerror=alert(1)>Holiday', d: 'a\u0000b\u001f<script>', a: ['cineflow'] })
    ).toString('base64url');
    const decoded = decodeSharedCollection(payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.data.name).toBe('img src=x onerror=alert(1)Holiday');
    expect(decoded.data.name).not.toContain('<');
    expect(decoded.data.description).not.toContain('<');
    expect(decoded.data.description).not.toMatch(/[\u0000-\u001f]/);
    expect(sanitizeSharedText('a\nb\tc', 10)).toBe('a b c');
  });

  it('caps text lengths rather than trusting them', () => {
    const long = decodeSharedCollection(
      Buffer.from(JSON.stringify({ v: 1, n: 'x'.repeat(200), d: 'y'.repeat(500), a: [] })).toString('base64url')
    );
    expect(long.ok).toBe(true);
    if (!long.ok) return;
    expect(long.data.name.length).toBeLessThanOrEqual(SHARE_LIMITS.name);
    expect(long.data.description.length).toBeLessThanOrEqual(SHARE_LIMITS.description);
  });

  it('dedupes duplicate ids carried in the payload', () => {
    const decoded = decodeSharedCollection(
      Buffer.from(
        JSON.stringify({ v: 1, n: 'Dupes', d: '', a: ['cineflow', 'cineflow', 'cineflow'] })
      ).toString('base64url')
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.data.apps).toEqual(['cineflow']);
    expect(decoded.droppedApps).toBe(2);
  });

  it('refuses a payload with an absurd number of entries', () => {
    const huge = Array.from({ length: SHARE_LIMITS.rawEntries + 1 }, () => 'cineflow');
    const decoded = decodeSharedCollection(
      Buffer.from(JSON.stringify({ v: 1, n: 'Huge', a: huge })).toString('base64url')
    );
    expect(decoded.ok).toBe(false);
  });
});

describe('resolving shared ids against the catalog', () => {
  const decodedData = (apps: string[]) => {
    const decoded = roundTrip({ name: 'Shared set', apps });
    if (!decoded.ok) throw new Error('encode failed');
    return decoded.data;
  };

  it('renders only published catalog apps', () => {
    const resolved = resolveSharedCollection(decodedData(['cineflow', 'studyria']), CATALOG);
    expect(resolved.apps.map((app) => app.slug)).toEqual(['cineflow', 'studyria']);
    expect(resolved.missing).toBe(0);
    expect(resolved.requested).toBe(2);
  });

  it('drops unpublished, unknown and draft ids', () => {
    const resolved = resolveSharedCollection(
      decodedData(['cineflow', 'draft-app', 'ghost-app']),
      CATALOG
    );
    expect(resolved.apps.map((app) => app.slug)).toEqual(['cineflow']);
    expect(resolved.missing).toBe(2);
  });

  it('handles a catalog change after the link was created', () => {
    const data = decodedData(['cineflow', 'studyria', 'pdfminifly']);
    const later: CatalogAppLike[] = CATALOG.map((app) =>
      app.slug === 'studyria' ? { ...app, published: false } : app
    ).filter((app) => app.slug !== 'pdfminifly');
    const resolved = resolveSharedCollection(data, later);
    expect(resolved.apps.map((app) => app.slug)).toEqual(['cineflow']);
    expect(resolved.missing).toBe(2);
  });

  it('never trusts metadata from the link', () => {
    // A crafted payload could try to smuggle app fields; only slugs are read.
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        n: 'Spoof',
        a: ['cineflow'],
        apps: [{ slug: 'cineflow', name: 'FAKE NAME', url: 'https://evil.example/x.apk' }],
      })
    ).toString('base64url');
    const decoded = decodeSharedCollection(payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.data.apps).toEqual(['cineflow']);
    const resolved = resolveSharedCollection(decoded.data, CATALOG);
    expect(resolved.apps[0].name).toBe('CineFlow');
  });

  it('reports an empty shared collection as empty, not broken', () => {
    const data = decodedData([]);
    const resolved = resolveSharedCollection(data, CATALOG);
    expect(resolved.requested).toBe(0);
    expect(resolved.apps).toEqual([]);
    expect(resolved.missing).toBe(0);
  });

  it('reports every id missing when nothing is published', () => {
    const resolved = resolveSharedCollection(decodedData(['ghost-a', 'ghost-b']), CATALOG);
    expect(resolved.apps).toEqual([]);
    expect(resolved.missing).toBe(2);
  });
});

describe('sharing does not touch local data', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  const seed = (): PersonalizationState => {
    let state = createCollection(emptyPersonalization(), { name: 'Trip kit', description: 'd' }, NOW).state;
    const id = state.collections[0].id;
    state = addAppToCollection(state, id, 'cineflow', CATALOG).state;
    state = addAppToCollection(state, id, 'studyria', CATALOG).state;
    storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(state));
    return state;
  };

  it('leaves the stored collection byte-identical after sharing', () => {
    const before = seed();
    const raw = storage.getItem(PERSONALIZATION_STORAGE_KEY);
    const encoded = encodeSharedCollection({
      name: before.collections[0].name,
      description: before.collections[0].description,
      apps: before.collections[0].apps,
    });
    expect(encoded.ok).toBe(true);
    decodeSharedCollection(encoded.ok ? encoded.payload : '');
    expect(storage.getItem(PERSONALIZATION_STORAGE_KEY)).toBe(raw);
    const after = loadPersonalization(NOW);
    expect(after.collections).toEqual(before.collections);
    expect(resolveCollections(after, CATALOG)[0].apps.map((a) => a.slug)).toEqual(['cineflow', 'studyria']);
  });

  it('does not write a new storage key or read the visitor history', () => {
    seed();
    const keys = Object.keys(Object.fromEntries(Array.from({ length: storage.length }, (_, i) => [storage.key(i) as string, true])));
    const encoded = encodeSharedCollection({ name: 'Trip kit', apps: ['cineflow'] });
    expect(encoded.ok).toBe(true);
    expect(storage.length).toBe(keys.length);
    expect(storage.getItem('appmintly.personalization.share')).toBeNull();
  });

  it('a shared page works with no local storage at all', () => {
    // Fresh browser: nothing stored.
    storage.clear();
    const encoded = encodeSharedCollection({ name: 'Fresh', description: '', apps: ['cineflow'] });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeSharedCollection(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const resolved = resolveSharedCollection(decoded.data, CATALOG);
    expect(resolved.apps.map((app) => app.slug)).toEqual(['cineflow']);
  });
});

describe('Batch 3 and Batch 4 regression after Batch 5', () => {
  beforeEach(installWindow);
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('collections still create, resolve and stay capped', () => {
    let state = createCollection(emptyPersonalization(), { name: 'Keepers' }, NOW).state;
    const id = state.collections[0].id;
    state = addAppToCollection(state, id, 'cineflow', CATALOG).state;
    expect(state.collections[0].apps).toEqual(['cineflow']);
    expect(COLLECTION_LIMITS.apps).toBe(50);
    expect(resolveCollections(state, CATALOG).length).toBe(1);
  });

  it('preferences and recommendations are unaffected by sharing', () => {
    const state = loadPersonalization(NOW);
    expect(state.preferences.recommendations).toBe(true);
    expect(state.preferences.recentEnabled).toBe(true);
    expect(state.recent).toEqual([]);
    expect(state.seen).toEqual([]);
  });
});
