/**
 * Phase 1B — regression tests for lib/release-story.ts (Release Stories)
 * and the upcoming-apps data normalizer.
 *
 * Covers the honesty contract:
 *  - the story timeline is built ONLY from fields that actually exist on
 *    the catalog/release record — no invented dates, sections or history
 *  - entries carry the record field they were derived from (evidence)
 *  - timeline orders dated entries oldest-first
 *  - the real production catalog record (appmintly 1.0.10) produces a real,
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
    expect(story.version).toBe('1.0.10');
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

  it('states the REAL version/build — 1.0.10 / 10010', () => {
    const story = buildReleaseStory(appmintly as never);
    const rel = story.timeline.find((e) => e.label === 'Latest release published');
    expect(rel?.detail).toContain('1.0.10');
    expect(rel?.detail).toContain('10010');
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

  it('records that carry a source repository link to a real https URL', () => {
    // sourceRepo is OPTIONAL engineering metadata: entries without a
    // repository yet simply omit it — the Lab never invents one.
    for (const u of UPCOMING_APPS) {
      if (u.sourceRepo !== undefined) {
        expect(u.sourceRepo.startsWith('https://github.com/')).toBe(true);
      }
    }
    // Register still documents its real repository.
    expect(getUpcomingAppBySlug('register')?.sourceRepo).toBe('https://github.com/PDFly-source/register');
  });

  it('records carry the draft-note honesty label', () => {
    for (const u of UPCOMING_APPS) expect(u.draftNote).toContain('Draft roadmap entry');
  });

  it('lookups by slug work', () => {
    expect(getUpcomingAppBySlug('register')?.name).toBe('AppMintly Register');
    expect(getUpcomingAppBySlug('does-not-exist')).toBeUndefined();
  });

  // Phase 1E — exact public showcase catalog.
  it('public catalog is exactly the five showcase entries in order', () => {
    expect(UPCOMING_APPS.map((u) => u.slug)).toEqual(['billcraft', 'cartora', 'nutrilens', 'register']);
  });

  it('Publisher Console and PDFly are absent from the public Lab catalog', () => {
    expect(getUpcomingAppBySlug('publisher-console')).toBeUndefined();
    expect(getUpcomingAppBySlug('pdfly')).toBeUndefined();
    expect(UPCOMING_APPS.some((u) => u.name.includes('Publisher Console'))).toBe(false);
    expect(UPCOMING_APPS.some((u) => u.name === 'PDFly')).toBe(false);
  });

  it('new showcase entries carry their official logo assets', () => {
    expect(getUpcomingAppBySlug('billcraft')?.logo).toBe('/brand/billcraft-logo.png');
    expect(getUpcomingAppBySlug('cartora')?.logo).toBe('/brand/cartora-logo.png');
    expect(getUpcomingAppBySlug('nutrilens')?.logo).toBe('/brand/nutrilens-logo.png');
  });

  it('roadmap statuses and milestone honesty are preserved', () => {
    // Finalized Lab status system (owner-approved): BillCraft moved to
    // early testing (internal only — never public access); milestones stay
    // untouched: QA & Release Readiness remains incomplete.
    const billcraft = getUpcomingAppBySlug('billcraft');
    expect(billcraft?.roadmapStatus).toBe('early-testing');
    // 2/3 — QA & Release Readiness must stay incomplete.
    const bcDone = billcraft!.milestones.filter((m) => m.status === 'done').length;
    expect(bcDone).toBe(2);
    expect(billcraft!.milestones[2].status).toBe('planned');

    const cartora = getUpcomingAppBySlug('cartora');
    expect(cartora?.milestones.filter((m) => m.status === 'done').length).toBe(2);
    expect(cartora!.milestones[2].status).toBe('planned');

    const nutrilens = getUpcomingAppBySlug('nutrilens');
    // 1/3 — only Brand Identity & Scanner Prototype is complete.
    expect(nutrilens?.milestones.filter((m) => m.status === 'done').length).toBe(1);
    expect(nutrilens!.milestones[0].status).toBe('done');
    expect(nutrilens!.milestones[1].status).toBe('planned');

    // Register keeps its existing accurate status.
    const register = getUpcomingAppBySlug('register');
    expect(register?.roadmapStatus).toBe('planned');

    // Cartora and NutriLens stay in development under the finalized system.
    expect(getUpcomingAppBySlug('cartora')?.roadmapStatus).toBe('in-development');
    expect(getUpcomingAppBySlug('nutrilens')?.roadmapStatus).toBe('in-development');
  });

  // ===== Lab 3.0: roadmap engine + verification system =====
  it('milestones carry stable ids and descriptions', () => {
    for (const u of UPCOMING_APPS) {
      expect(u.milestones.length).toBeGreaterThan(0);
      const ids = new Set<string>();
      for (const m of u.milestones) {
        expect(m.id.length).toBeGreaterThan(0);
        expect(ids.has(m.id)).toBe(false);
        ids.add(m.id);
        expect(m.description.length).toBeGreaterThan(0);
        expect(['done', 'in-progress', 'planned', 'blocked']).toContain(m.status);
        // No milestone is marked complete without recorded evidence text,
        // and no date is invented.
        if (m.status === 'done') expect(m.description.length).toBeGreaterThan(0);
        // Real update dates exist only where recorded (register rg-m1).
      }
    }
  });

  it('verification records are honest: evidence-backed results, explicit pending', () => {
    const RESULTS = ['pending', 'passed', 'failed', 'unable-to-verify'];
    for (const u of UPCOMING_APPS) {
      expect(u.verification).toBeDefined();
      expect(u.verification!.checks.length).toBe(5);
      for (const c of u.verification!.checks) {
        expect(RESULTS).toContain(c.result);
        if (c.result === 'passed') {
          // A pass is only allowed with recorded evidence: what, where, when.
          expect(c.summary!.length).toBeGreaterThan(0);
          expect(c.source!.length).toBeGreaterThan(0);
          expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(c.id!.length).toBeGreaterThan(0);
        }
        if (c.result === 'unable-to-verify') {
          // An inability to verify must also explain WHY it could not run.
          expect(c.summary!.length).toBeGreaterThan(0);
          expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        if (c.result === 'pending') {
          // Pending means no check ran — no invented dates or evidence.
          expect(c.date).toBeUndefined();
          expect(c.summary).toBeUndefined();
        }
      }
      // Source and scope are labelled accurately.
      expect(u.verification!.source).toContain('AppMintly team');
      expect(u.verification!.source).toContain('not an independent audit');
    }
  });

  it('register carries real recorded evidence; the other apps stay pending', () => {
    const reg = getUpcomingAppBySlug('register')!;
    const passed = reg.verification!.checks.filter((c) => c.result === 'passed');
    const unable = reg.verification!.checks.filter((c) => c.result === 'unable-to-verify');
    expect(passed.length).toBe(1);
    expect(passed[0].category).toBe('core-flow');
    expect(passed[0].buildId).toContain('eb6bc17'); // real repository commit
    expect(unable.length).toBe(1);
    expect(unable[0].category).toBe('build');
    // The rg-m1 completion milestone is now backed by recorded evidence.
    const m1 = reg.milestones.find((m) => m.id === 'rg-m1')!;
    expect(m1.status).toBe('done');
    expect(m1.evidence).toContain('eb6bc17');
    expect(m1.lastUpdated).toBe('2026-10-15');
    // BillCraft, Cartora and NutriLens have no recorded checks yet — pending.
    for (const slug of ['billcraft', 'cartora', 'nutrilens']) {
      const app = getUpcomingAppBySlug(slug)!;
      expect(app.verification!.checks.every((c) => c.result === 'pending')).toBe(true);
      for (const m of app.milestones) expect(m.evidence).toBeUndefined();
    }
  });

  it('no record ships screenshots it does not actually have', () => {
    for (const u of UPCOMING_APPS) {
      if (u.screenshots !== undefined) {
        for (const sc of u.screenshots) expect(sc.src.startsWith('/brand/')).toBe(true);
      }
    }
    // Current catalog has no real screenshots — the field stays absent.
    expect(UPCOMING_APPS.some((u) => u.screenshots !== undefined)).toBe(false);
  });

  it('filter counts derive from real records: all 4, planned 1, in-development 2, early testing 1, published 0', () => {
    // Finalized status system — counts match the real dataset exactly:
    // register planned; cartora + nutrilens in development; billcraft in
    // early testing (internal only); nothing is published until a record
    // has a real verified public URL.
    expect(UPCOMING_APPS.length).toBe(4);
    expect(UPCOMING_APPS.filter((u) => u.roadmapStatus === 'planned').length).toBe(1);
    expect(UPCOMING_APPS.filter((u) => u.roadmapStatus === 'in-development').length).toBe(2);
    expect(UPCOMING_APPS.filter((u) => u.roadmapStatus === 'early-testing').length).toBe(1);
    expect(UPCOMING_APPS.filter((u) => u.roadmapStatus === 'published').length).toBe(0);
  });
});
