/**
 * AppMintly 2.0 — individual collection pages (Item 4).
 *
 * The route, the hub and the sitemap all derive from buildCollections(), so
 * these tests assert the invariants that make that safe: no phantom slugs, no
 * duplicate URLs, no build-clock lastmod, no unpublished apps.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import catalog from '../data/apps.json';
import curated from '../data/collections.json';
import sitemap from '../app/sitemap';
import {
  buildCollections,
  collectionContentDate,
  collectionPlatformSplit,
  collectionSlug,
  findCollectionBySlug,
} from '../lib/catalog/collections';

const APPS = catalog as never[];
const { collections } = buildCollections(APPS, curated as never);
const publishedIds = new Set(
  (catalog as Array<{ id: string; published?: boolean }>).filter((a) => a.published).map((a) => a.id)
);

describe('collection routes', () => {
  it('generates one slug per real collection, all URL-safe and unique', () => {
    const slugs = collections.map((c) => collectionSlug(c.id));
    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('resolves every generated slug and rejects unknown ones', () => {
    for (const collection of collections) {
      const slug = collectionSlug(collection.id);
      expect(findCollectionBySlug(collections, slug)?.id).toBe(collection.id);
    }
    expect(findCollectionBySlug(collections, 'does-not-exist')).toBeUndefined();
    expect(findCollectionBySlug(collections, '')).toBeUndefined();
  });

  it('renders published apps only and never duplicates one inside a collection', () => {
    for (const collection of collections) {
      const ids = collection.apps.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(publishedIds.has(id)).toBe(true);
      expect(collection.apps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('drops unknown app ids instead of rendering them', () => {
    const { collections: built, droppedIds } = buildCollections(APPS, [
      { id: 'phantom-test', title: 'Phantom', description: 'x', appIds: ['ghost-app', 'cinflow', 'cineflow', 'billcraft'] },
    ]);
    expect(droppedIds).toEqual(['ghost-app', 'cinflow']);
    const phantom = built.find((c) => c.id === 'phantom-test')!;
    expect(phantom.apps.map((a) => a.id)).toEqual(['cineflow', 'billcraft']);
  });

  it('collapses a repeated app id', () => {
    const { collections: built } = buildCollections(APPS, [
      { id: 'dup-test', title: 'Dup', description: 'x', appIds: ['cineflow', 'cineflow', 'billcraft'] },
    ]);
    expect(built.find((c) => c.id === 'dup-test')!.apps).toHaveLength(2);
  });

  it('never surfaces a collection with fewer than two real apps', () => {
    const { collections: built } = buildCollections(APPS, [
      { id: 'lonely', title: 'Lonely', description: 'x', appIds: ['cineflow', 'ghost-app'] },
    ]);
    expect(built.find((c) => c.id === 'lonely')).toBeUndefined();
  });

  it('dates a collection from its newest member, not the build clock', () => {
    for (const collection of collections) {
      const date = collectionContentDate(collection);
      expect(date).toBeInstanceOf(Date);
      // Same field priority as collectionContentDate (updatedAt → lastUpdated
      // → publishedAt), so the assertion compares like with like.
      const memberDates = collection.apps
        .map((a) => {
          const loose = a as never as { updatedAt?: string; lastUpdated?: string; publishedAt?: string };
          const raw = loose.updatedAt || loose.lastUpdated || loose.publishedAt;
          return raw ? new Date(raw).getTime() : NaN;
        })
        .filter((t) => Number.isFinite(t));
      if (memberDates.length) {
        expect(date!.getTime()).toBeGreaterThanOrEqual(Math.min(...memberDates));
        expect(date!.getTime()).toBeLessThanOrEqual(Math.max(...memberDates));
      }
    }
  });

  it('reports platform counts from authoritative evidence only', () => {
    for (const collection of collections) {
      const split = collectionPlatformSplit(collection);
      expect(split.android).toBeLessThanOrEqual(collection.apps.length);
      expect(split.web).toBeLessThanOrEqual(collection.apps.length);
      expect(split.both).toBeLessThanOrEqual(Math.min(split.android, split.web));
    }
  });

  it('declares the route file contract: static params, no dynamic params, 404 for unknown', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'collections', '[slug]', 'page.tsx'),
      'utf8'
    );
    expect(src).toContain('export function generateStaticParams');
    expect(src).toContain('export const dynamicParams = false');
    expect(src).toContain('notFound()');
    expect(src).toContain('buildCollections');
    expect(src).not.toContain('lifesync');
  });
});

describe('collection SEO + sitemap', () => {
  it('builds a unique title and description per collection', () => {
    const titles = collections.map((c) => `${c.title} — App Collection | AppMintly`);
    const descriptions = collections.map((c) => c.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const d of descriptions) expect(d.length).toBeGreaterThan(20);
  });

  it('lists every collection page exactly once in the sitemap', () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);

    for (const collection of collections) {
      const slug = collectionSlug(collection.id);
      const matches = urls.filter((u) => new URL(u).pathname.replace(/\/$/, '') === `/collections/${slug}`);
      expect(matches, `sitemap missing /collections/${slug}`).toHaveLength(1);
    }
  });

  it('does not invent collection URLs for unknown ids', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.includes('does-not-exist'))).toBe(false);
    expect(urls.some((u) => u.includes('/collections/catalog-'))).toBe(false);
  });

  it('uses content dates rather than one build-clock stamp on collections', () => {
    const entries = sitemap();
    const collectionEntries = entries.filter((e) => new URL(e.url).pathname.includes('/collections/') && new URL(e.url).pathname.replace(/\/$/, '') !== '/collections');
    expect(collectionEntries.length).toBe(collections.length);
    for (const entry of collectionEntries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
