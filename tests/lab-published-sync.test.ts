/**
 * Phase 9 — Published/Released catalog sync tests.
 *
 * The sync logic must be derived (never hardcoded), idempotent, honest
 * about drafts/internal entries, and safe on catalog failures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeSync,
  publishedCatalogApps,
  matchRoadmapRecord,
  publishedRecordFor,
  detailUrlFor,
} from '../scripts/sync-published-lab.mjs';

const REPO = join(__dirname, '..');
const catalog = JSON.parse(readFileSync(join(REPO, 'data', 'apps.json'), 'utf8'));
const roadmap = JSON.parse(readFileSync(join(REPO, 'data', 'upcoming-apps.json'), 'utf8'));

describe('Phase 2/4 — catalog sync honesty', () => {
  it('the published set is DERIVED from the real catalog (no hardcoded seven)', () => {
    const published = publishedCatalogApps(catalog);
    expect(published.length).toBeGreaterThan(0);
    // Drafts/internal/test records are excluded from the published set.
    for (const a of published) {
      expect(a.status).toBe('published');
      expect(a.published).toBe(true);
    }
    expect(catalog.some((a: any) => a.slug === 'distribution-test' && a.status === 'draft')).toBe(true);
    expect(published.some((a: any) => a.slug === 'distribution-test')).toBe(false);
  });

  it('preserves every curated roadmap record and its metadata', () => {
    const before = roadmap.filter((r: any) => !r.syncManaged).length;
    const { records } = computeSync(catalog, roadmap);
    const after = records.filter((r: any) => !r.syncManaged).length;
    expect(before).toBe(33);
    expect(after).toBe(33);
    // Curated records keep their exact payloads.
    for (const rec of roadmap) {
      const out = records.find((r: any) => r.id === rec.id);
      expect(out).toBeDefined();
      expect(out.roadmapStatus).toBe(rec.roadmapStatus);
      expect(out.milestones).toEqual(rec.milestones);
    }
  });

  it('maps the actual published catalog apps by stable identifiers', () => {
    const { records } = computeSync(catalog, roadmap);
    for (const app of publishedCatalogApps(catalog)) {
      const rec = matchRoadmapRecord(records, app.slug);
      expect(rec, `no roadmap record for catalog app ${app.slug}`).not.toBeNull();
      expect(rec.catalogSlug).toBe(app.slug);
      expect(rec.roadmapStatus).toBe('published');
      expect(rec.publicUrl).toBe(detailUrlFor(app.slug));
      expect(rec.publicUrl.startsWith('https://')).toBe(true);
      expect(rec.releaseVersion).toBe(app.version);
      expect(rec.logo && rec.logo.startsWith('/brand/')).toBe(true);
    }
    // The record set matches the catalog 1:1 — no duplicates per catalog slug.
    for (const app of publishedCatalogApps(catalog)) {
      expect(records.filter((r: any) => r.catalogSlug === app.slug)).toHaveLength(1);
    }
  });

  it('repeated synchronization is idempotent', () => {
    const first = computeSync(catalog, roadmap);
    const second = computeSync(catalog, first.records);
    expect(second.changes).toHaveLength(0);
    // Third run on the already-synced output is also stable.
    const third = computeSync(catalog, second.records);
    expect(third.changes).toHaveLength(0);
    expect(JSON.stringify(third.records)).toBe(JSON.stringify(second.records));
  });

  it('a new public release creates the correct record; overlap maps, not duplicates', () => {
    const synced = computeSync(catalog, roadmap).records;
    // Simulate a NEW public release.
    const newApp = {
      ...catalog[0],
      id: 'newapp',
      slug: 'newapp',
      name: 'NewApp',
      status: 'published',
      published: true,
      version: '1.0.0',
      features: ['Feature A'],
    };
    const withNew = computeSync([...catalog, newApp], synced);
    expect(withNew.changes.join(' ')).toContain('create published record for newapp');
    const created = withNew.records.find((r: any) => r.slug === 'newapp');
    expect(created.syncManaged).toBe(true);
    expect(created.roadmapStatus).toBe('published');

    // Overlap: a curated record explicitly linked via catalogSlug is UPDATED,
    // never duplicated.
    const linked = [...synced];
    linked.push({
      id: 'linkedroadmap',
      slug: 'linkedroadmap',
      catalogSlug: 'newapp',
      name: 'Linked Roadmap',
      roadmapStatus: 'in-development',
      milestones: [],
    });
    const overlap = computeSync([...catalog, newApp], linked);
    expect(overlap.records.filter((r: any) => r.catalogSlug === 'newapp')).toHaveLength(1);
    const mapped = overlap.records.find((r: any) => r.id === 'linkedroadmap');
    expect(mapped.roadmapStatus).toBe('published');
    expect(mapped.name).toBe('Linked Roadmap'); // curated content preserved
    // Counting: the total reflects UNIQUE records, never double counting.
    expect(overlap.records.filter((r: any) => r.roadmapStatus === 'published').length)
      .toBe(publishedCatalogApps([...catalog, newApp]).length);
  });

  it('unpublishing removes sync-managed records but reverts curated ones safely', () => {
    const synced = computeSync(catalog, roadmap).records;
    // A curated record linked to a catalog app gets published by sync.
    const curated = [...synced];
    curated.push({
      id: 'curatedlinked',
      slug: 'curatedlinked',
      catalogSlug: 'nexdrop',
      name: 'Curated Linked',
      roadmapStatus: 'planned',
      milestones: [],
    });
    const pub = computeSync(catalog, curated);
    expect(pub.records.find((r: any) => r.id === 'curatedlinked').roadmapStatus).toBe('published');

    // The catalog app is withdrawn — curated record reverts (never deleted),
    // sync-managed record is removed (retention policy).
    const withdrawn = catalog.map((a: any) => (a.slug === 'nexdrop' ? { ...a, status: 'unpublished', published: false } : a));
    const after = computeSync(withdrawn, pub.records);
    const curatedAfter = after.records.find((r: any) => r.id === 'curatedlinked');
    expect(curatedAfter).toBeDefined();
    expect(curatedAfter.roadmapStatus).toBe('early-testing');
    expect(curatedAfter.publicUrl).toBeUndefined();
    expect(after.records.some((r: any) => r.id === 'catalog-nexdrop')).toBe(false);
    // Nothing else was harmed.
    expect(after.records.filter((r: any) => !r.syncManaged).length).toBe(34); // 33 + curatedlinked
  });

  it('draft and internal-only catalog entries never enter the published set', () => {
    const drafts = [
      { slug: 'internal-x', status: 'draft', published: false },
      { slug: 'test-y', status: 'published', published: false },
      { slug: 'hidden-z', status: 'draft', published: true }, // inconsistent — not genuinely published
      { slug: 'real-w', status: 'published', published: true },
    ];
    const published = publishedCatalogApps(drafts);
    expect(published.map((a: any) => a.slug)).toEqual(['real-w']);
  });

  it('catalog failures never produce a false zero-count overwrite', () => {
    // A malformed/failed catalog read must throw BEFORE any write happens.
    expect(() => publishedCatalogApps(null as any)).toThrow();
    expect(() => publishedCatalogApps('not-an-array' as any)).toThrow();
    expect(() => computeSync(null, roadmap)).toThrow();
    expect(() => computeSync(catalog, null)).toThrow();
    // An empty-but-valid catalog legitimately clears sync-managed records
    // but never touches curated ones.
    const synced = computeSync(catalog, roadmap).records;
    const emptied = computeSync([], synced);
    expect(emptied.records.some((r: any) => r.syncManaged)).toBe(false);
    expect(emptied.records.filter((r: any) => !r.syncManaged).length).toBe(33);
  });

  it('published record fields derive from the catalog (authoritative source)', () => {
    const app = publishedCatalogApps(catalog).find((a: any) => a.slug === 'cineflow');
    const rec = publishedRecordFor(app);
    expect(rec.name).toBe('CineFlow');
    expect(rec.category).toBe(app.category);
    expect(rec.type).toBe(app.type);
    expect(rec.developer).toBe(app.developer);
    expect(rec.releaseVersion).toBe(app.version);
    expect(rec.publicUrl).toBe('https://appmintly.pages.dev/app/cineflow/');
    // Honest verification: the release check cites the catalog itself.
    expect(rec.verification.checks).toHaveLength(1);
    expect(rec.verification.checks[0].category).toBe('release');
    expect(rec.verification.checks[0].result).toBe('passed');
    expect(rec.verification.checks[0].evidence_class).toBe('repository-inspection');
    expect(rec.verification.source).toContain('data/apps.json');
    // No install/download claims are fabricated — the record is a link to
    // the official marketplace detail page only.
    expect(rec.milestones).toHaveLength(1);
    expect(rec.milestones[0].status).toBe('done');
  });
});
