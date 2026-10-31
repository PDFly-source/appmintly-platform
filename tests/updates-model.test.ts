import { describe, expect, it } from 'vitest';
import {
  buildUpdateCenter,
  latestVersionOf,
  recentlyUpdated,
  releaseNotesFor,
  versionHistoryFor,
  versionKnowledge,
  webUpdateHint,
} from '@/lib/updates/model';
import { parseWatchList, sanitizeWatched } from '@/lib/updates/watch';

/**
 * Item 6 — the Update Center must never invent a version, a date, a note or an
 * update. These tests pin those rules.
 */
const verifiedRelease = {
  id: 'cineflow',
  slug: 'cineflow',
  name: 'CineFlow',
  published: true,
  version: '0.2.2',
  lastUpdated: '2026-10-29',
  releaseDate: '2026-10-29',
  releaseNotes: ['Landscape rotation fix', 'Restored position on resume'],
  changelog: ['v0.2.0: Shorts feed', 'v0.1.0: First public build'],
  previousVersion: '0.2.1',
  launchUrl: 'https://appmintly.pages.dev/app/cineflow/',
  apk: {
    enabled: true,
    verified: true,
    sha256: 'a'.repeat(64),
    apkUrl: 'https://github.com/PDFly-source/appmintly-releases/releases/download/cineflow-v0.2.2/CineFlow-0.2.2.apk',
    versionName: '0.2.2',
    versionCode: 202,
    releaseDate: '2026-10-29',
  },
};

describe('latest version detection', () => {
  it('reads the release version from the published record', () => {
    expect(latestVersionOf(verifiedRelease)).toBe('0.2.2');
  });
  it('never invents a version for a record without one', () => {
    expect(latestVersionOf({ id: 'x', published: true })).toBe('');
    expect(latestVersionOf(null)).toBe('');
  });
});

describe('version comparison and update detection', () => {
  it('detects a real newer release', () => {
    const k = versionKnowledge(verifiedRelease, '0.2.1');
    expect(k.state).toBe('update-available');
    expect(k.updateAvailable).toBe(true);
    expect(k.label).toContain('0.2.2');
  });

  it('compares numerically, not lexically', () => {
    expect(versionKnowledge({ ...verifiedRelease, version: '0.2.10', apk: { ...verifiedRelease.apk, versionName: '0.2.10' } }, '0.2.9').updateAvailable).toBe(true);
    expect(versionKnowledge(verifiedRelease, '0.2.10').state).toBe('catalog-behind');
  });

  it('reports up to date only with a real local baseline', () => {
    expect(versionKnowledge(verifiedRelease, '0.2.2').state).toBe('up-to-date');
  });

  it('refuses to claim anything without a local baseline', () => {
    const k = versionKnowledge(verifiedRelease, '');
    expect(k.state).toBe('no-baseline');
    expect(k.updateAvailable).toBe(false);
    expect(k.label).not.toMatch(/up to date/i);
  });

  it('flags a catalog that lags behind the browser instead of offering an update', () => {
    const k = versionKnowledge(verifiedRelease, '0.2.5');
    expect(k.state).toBe('catalog-behind');
    expect(k.updateAvailable).toBe(false);
  });

  it('does not treat an unverified or unpublished release as an update', () => {
    const unverified = { ...verifiedRelease, apk: { ...verifiedRelease.apk, verified: false } };
    expect(versionKnowledge(unverified, '0.2.1').updateAvailable).toBe(true);
    expect(versionKnowledge(unverified, '0.2.1').deliverable).toBe(false);
    const unpublished = { ...verifiedRelease, published: false };
    const buckets = buildUpdateCenter([unpublished], { cineflow: '0.2.1' });
    expect(buckets.totalPublished).toBe(0);
    expect(buckets.available).toHaveLength(0);
  });
});

describe('release notes', () => {
  it('returns the catalog notes verbatim', () => {
    expect(releaseNotesFor(verifiedRelease)).toEqual(['Landscape rotation fix', 'Restored position on resume']);
  });
  it('returns nothing rather than placeholder prose', () => {
    expect(releaseNotesFor({ published: true, version: '1.0.0' })).toEqual([]);
    expect(releaseNotesFor({ published: true, releaseNotes: '  ' } as never)).toEqual([]);
  });
});

describe('version history', () => {
  it('lists the current release first, with its real date', () => {
    const history = versionHistoryFor(verifiedRelease);
    expect(history[0]).toMatchObject({ version: '0.2.2', date: '2026-10-29', source: 'current-release' });
  });

  it('includes only versions the record actually declares, with no invented dates', () => {
    const history = versionHistoryFor(verifiedRelease);
    const versions = history.map((h) => h.version);
    expect(versions).toContain('0.2.1');
    expect(versions).toContain('0.2.0');
    expect(versions).toContain('0.1.0');
    expect(versions).not.toContain('0.2.3');
    for (const entry of history.slice(1)) expect(entry.date).toBeNull();
  });

  it('has an honest empty form for a record with no release history', () => {
    expect(versionHistoryFor({ published: true, version: '1.0.0' })).toEqual([
      { version: '1.0.0', date: null, notes: [], source: 'current-release' },
    ]);
    expect(versionHistoryFor(null)).toEqual([]);
  });
});

describe('recently updated', () => {
  it('orders by the dates the catalog carries and drops unpublished apps', () => {
    const older = { ...verifiedRelease, id: 'older', apk: { ...verifiedRelease.apk, releaseDate: '2026-09-01' } };
    const draft = { ...verifiedRelease, id: 'draft', published: false };
    const rows = recentlyUpdated([older, verifiedRelease, draft]);
    expect(rows.map((r) => r.app.id)).toEqual(['cineflow', 'older']);
    expect(rows[0].dateField).toBe('apk.releaseDate');
  });

  it('marks a missing date instead of substituting one', () => {
    const noDates = { id: 'nodates', published: true, version: '1.0.0', lastUpdated: '', releaseDate: '' };
    const rows = recentlyUpdated([noDates as never]);
    expect(rows[0].date).toBeNull();
    expect(rows[0].dateField).toBeNull();
  });
});

describe('update center buckets', () => {
  it('separates available, up-to-date and unknown, never guessing', () => {
    const local = { cineflow: '0.2.0' };
    const buckets = buildUpdateCenter([verifiedRelease], local);
    expect(buckets.available.map((r) => r.knowledge.localVersion)).toEqual(['0.2.0']);
    const none = buildUpdateCenter([verifiedRelease], {});
    expect(none.unknown).toHaveLength(1);
    expect(none.upToDate).toHaveLength(0);
    expect(none.available).toHaveLength(0);
  });
});

describe('web update indicator', () => {
  it('describes a web target without inventing a version', () => {
    const hint = webUpdateHint(verifiedRelease);
    expect(hint.state).toBe('web-always-current');
    expect(hint.label).not.toMatch(/\d+\.\d+/);
  });
  it('reports the absence of a web target', () => {
    expect(webUpdateHint({ ...verifiedRelease, launchUrl: '' }).state).toBe('no-web-target');
  });
});

describe('watch list storage contract', () => {
  it('accepts valid ids, drops junk and duplicates', () => {
    expect(sanitizeWatched(['cineflow', 'cineflow', '../etc', '', 42, 'nexdrop'])).toEqual(['cineflow', 'nexdrop']);
  });
  it('never throws on malformed storage', () => {
    expect(parseWatchList('not json')).toEqual([]);
    expect(parseWatchList('{"watched":"nope"}')).toEqual([]);
    expect(parseWatchList('{"v":1,"watched":["cineflow"]}')).toEqual(['cineflow']);
    expect(parseWatchList('["cineflow","bad id"]')).toEqual(['cineflow']);
  });
});
