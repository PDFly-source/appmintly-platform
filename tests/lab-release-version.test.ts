import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * [lab-release-version] The Lab roadmap must not advertise a version the
 * catalog no longer ships.
 *
 * 2026-11-02: PDFMiniFly went to 2.1.3 in the catalog while
 * data/upcoming-apps.json still said releaseVersion 2.1.2, so the Lab card
 * rendered "v2.1.2" and lib/notifications/engine's releaseVersionOf() would
 * have compared updates against a stale baseline. The Android release workflow
 * updates data/apps.json but has no knowledge of this roadmap field, so the
 * drift is silent without this test.
 *
 * The assertions resolve the intended record by id. They do not rewrite or
 * pattern-match every "2.1.x" string in the file.
 */

const REPO = process.cwd();
const catalog = JSON.parse(readFileSync(join(REPO, 'data', 'apps.json'), 'utf8')) as any[];
const roadmap = JSON.parse(readFileSync(join(REPO, 'data', 'upcoming-apps.json'), 'utf8')) as any[];

const catalogVersion = (slug: string) =>
  (catalog.find((a) => a.slug === slug)?.apk as any)?.versionName as string | undefined;

describe('Lab roadmap — release versions follow the catalog', () => {
  it('the PDFMiniFly Lab record advertises the shipped 2.1.3', () => {
    const rec = roadmap.find((r) => r.id === 'catalog-pdfminifly');
    expect(rec).toBeDefined();
    expect(rec.releaseVersion).toBe('2.1.3');
    expect(rec.releaseVersion).toBe(catalogVersion('pdfminifly'));
  });

  it('resolves exactly one PDFMiniFly roadmap record (no duplicate cards)', () => {
    const matches = roadmap.filter((r) => r.id === 'catalog-pdfminifly' || r.slug === 'pdfminifly');
    expect(matches).toHaveLength(1);
  });

  it('every sync-managed roadmap record matches its catalog version', () => {
    const drift = roadmap
      .filter((r) => r.syncManaged === true && typeof r.releaseVersion === 'string')
      .map((r) => ({ id: r.id, lab: r.releaseVersion, catalog: catalogVersion(r.slug) }))
      .filter((row) => row.catalog && row.lab !== row.catalog);
    expect(drift).toEqual([]);
  });

  it('roadmap ids and slugs stay unique', () => {
    const ids = roadmap.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = roadmap.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
