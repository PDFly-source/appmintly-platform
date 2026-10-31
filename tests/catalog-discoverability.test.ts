/**
 * AppMintly 2.0 — discovery must not invent apps.
 *
 * Regression: data/collections.json referenced eight app ids that do not
 * exist in the published catalog, so collections could only have been shown
 * by publishing phantom apps. Collections are now derived from catalog facts
 * and every unknown id is dropped.
 */
import { describe, expect, it } from 'vitest';
import catalog from '../data/apps.json';
import curated from '../data/collections.json';
import { buildCollections, deriveCollections, isLocalFirst } from '../lib/catalog/collections';
import { similarApps } from '../lib/catalog/similar';

const apps = catalog as any[];
const realIds = new Set(apps.filter((a) => a.published).map((a) => a.id));

describe('collections', () => {
  it('the curated data file is cleaned of phantom ids', () => {
    const phantom: string[] = [];
    for (const c of curated as any[]) {
      for (const id of c.appIds) if (!realIds.has(id)) phantom.push(`${c.id}:${id}`);
    }
    expect(phantom).toEqual([]);
  });

  it('buildCollections never returns an app outside the published catalog', () => {
    const { collections } = buildCollections(apps, curated as any[]);
    expect(collections.length).toBeGreaterThan(0);
    for (const c of collections) {
      expect(c.apps.length).toBeGreaterThanOrEqual(2);
      for (const a of c.apps) expect(realIds.has(a.id)).toBe(true);
    }
  });

  it('drops unknown ids instead of displaying them', () => {
    const { collections, droppedIds } = buildCollections(apps, [
      { id: 'x', title: 'X', description: 'd', appIds: ['cineflow', 'no-such-app'] },
    ]);
    expect(droppedIds).toEqual(['no-such-app']);
    // one real member is not a collection, so the curated entry is not surfaced
    expect(collections.find((c) => c.id === 'x')).toBeUndefined();
  });

  it('derived collections follow real catalog facts', () => {
    const derived = deriveCollections(apps);
    const android = derived.find((c) => c.id === 'android-releases');
    expect(android, 'android collection should exist').toBeDefined();
    for (const a of android!.apps) expect((a as any).apk?.enabled || a.type === 'Android APK').toBe(true);
    const localFirst = derived.find((c) => c.id === 'local-first');
    for (const a of localFirst?.apps || []) expect(isLocalFirst(a as any)).toBe(true);
  });
});

describe('similar apps', () => {
  const target = apps.find((a) => a.slug === 'cineflow');

  it('never recommends the app itself or unpublished entries', () => {
    const result = similarApps(apps, target, { limit: 4 });
    expect(result.some((a) => a.slug === 'cineflow')).toBe(false);
    for (const a of result) expect(a.published).toBe(true);
  });

  it('ranks shared category or tags first', () => {
    const result = similarApps(apps, target, { limit: 3 });
    if (result.length > 1) {
      const sharesSignal = (a: any) =>
        a.category === target.category ||
        (a.tags || []).some((t: string) => (target.tags || []).includes(t));
      expect(sharesSignal(result[0])).toBe(true);
    }
  });

  it('returns an empty list for a missing target instead of throwing', () => {
    expect(similarApps(apps, null)).toEqual([]);
  });
});
