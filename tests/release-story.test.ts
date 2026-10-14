/**
 * Phase 1B — regression tests for lib/release-story.ts (Release Stories)
 * and the upcoming-apps data normalizer.
 *
 * Covers the honesty contract:
 *  - the story timeline is built ONLY from fields that actually exist on
 *    the catalog/release record — no invented dates, sections or history
 *  - entries carry the record field they were derived from (evidence)
 *  - timeline orders dated entries oldest-first
 *  - the real production catalog record (appmintly 1.0.9) produces a real,
 *    verifiable story — tested against data/apps.json itself
 *  - upcoming-apps.json records survive normalization only when they carry
 *    a valid roadmap status and a real https source repository link
 */

import { describe, it, expect } from 'vitest';
import { buildReleaseStory, shortHash } from '../lib/release-story';
import { UPCOMING_APPS, getUpcomingAppBySlug } from '../data/upcoming-apps';
import { APPS } from '../data/apps';

const appmintly = APPS.find((a) => a.slug === 'appmintly');

describe('buildReleaseStory — metadata-only narrative', () => {
  it('derives a story from the REAL production appmintly record', () => {
    expect(appmintly).toBeDefined();
    const story = buildReleaseStory(appmintly as never);
    expect(story.appName).toBe('AppMintly');
    expect(story.version).toBe('1.0.9');
    expect(story.timeline.length).toBeGreaterThan(0);
    // Release notes are passed through verbatim — never rewritten.
    expect(story.releaseNotes).toEqual((appmintly as unknown as { releaseNotes: string[] }).releaseNotes);
  });

  it('every entry names its evidence source record fields', () => {
    const story = buildReleaseStory(appmintly as never);
    for (const entry of story.timeline) {
      expect(entry.source).toBeTruthy();
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });

  it('includes the release + integrity entries for the appmintly record', () => {
    const story = buildReleaseStory(appmintly as never);
    const labels = story.timeline.map((e) => e.label);
    expect(labels).toContain('Listed on AppMintly');
    expect(labels).toContain('Latest release published');
    expect(labels).toContain('Integrity verified in the release pipeline');
    expect(labels).toContain('Catalog record updated');
  });

  it('states the REAL version/build — 1.0.9 / 10009', () => {
    const story = buildReleaseStory(appmintly as never);
    const rel = story.timeline.find((e) => e.label === 'Latest release published');
    expect(rel?.detail).toContain('1.0.9');
    expect(rel?.detail).toContain('10009');
  });

  it('orders dated entries oldest-first', () => {
    const story = buildReleaseStory(appmintly as never);
    const dates = story.timeline
      .filter((e) => e.at)
      .map((e) => new Date(e.at as string).getTime());
    for (let i = 1; i < dates.length; i++) expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
  });

  it('omits sections when metadata is missing — never invents', () => {
    const sparse = { name: 'Bare App' } as never;
    const story = buildReleaseStory(sparse);
    expect(story.timeline).toEqual([]);
    expect(story.releaseNotes).toEqual([]);
  });

  it('omits the APK section when there is no authoritative release', () => {
    const webOnly = { name: 'Webby', publishedAt: '2026-01-01', lastUpdated: '2026-02-01' } as never;
    const story = buildReleaseStory(webOnly);
    const labels = story.timeline.map((e) => e.label);
    expect(labels).not.toContain('Latest release published');
    expect(labels).not.toContain('Integrity verified in the release pipeline');
    expect(labels).toContain('Listed on AppMintly');
  });

  it('shortHash keeps long hashes recognizable and verifiable', () => {
    const hash = 'dbafc6d389516069518826d1e1320cebcf7970eec9249d749de699b730f61368';
    const short = shortHash(hash);
    expect(short.startsWith('dbafc6d38951')).toBe(true);
    expect(short.endsWith('1368')).toBe(true);
    expect(shortHash(undefined)).toBe('');
  });
});

describe('upcoming-apps data — normalization honesty', () => {
  it('all shipped records carry purpose, users, features, capabilities, status', () => {
    for (const u of UPCOMING_APPS) {
      expect(u.purpose.length).toBeGreaterThan(0);
      expect(u.intendedUsers.length).toBeGreaterThan(0);
      expect(u.proposedFeatures.length).toBeGreaterThan(0);
      expect(u.plannedCapabilities.length).toBeGreaterThan(0);
      expect(['planned', 'in-development', 'early-testing']).toContain(u.roadmapStatus);
    }
  });

  it('every record links to a real https source repository', () => {
    for (const u of UPCOMING_APPS) expect(u.sourceRepo.startsWith('https://github.com/')).toBe(true);
  });

  it('records carry the draft-note honesty label', () => {
    for (const u of UPCOMING_APPS) expect(u.draftNote).toContain('Draft roadmap entry');
  });

  it('lookups by slug work', () => {
    expect(getUpcomingAppBySlug('publisher-console')?.name).toBe('AppMintly Publisher Console');
    expect(getUpcomingAppBySlug('does-not-exist')).toBeUndefined();
  });
});
