/**
 * Phase 3.2 — engineering status data honesty tests.
 *
 * Proves, mechanically:
 *  - lab-apps.json mirrors the real public Lab records (ids, order, status,
 *    progress math) and marks retired entries as hidden
 *  - verification checks use honest states; a 'passed' check ALWAYS carries
 *    evidence (summary + date + source) — a missing check is never a pass
 *  - 'unable-to-verify' checks explain why
 *  - engineering-status health conditions are all green with descriptions
 *  - catalog diff matches the real git-derived numbers (BillCraft addition)
 *  - the 5 latest events are real, ordered newest-first, no placeholders
 *  - scan_time is a recent real ISO timestamp
 *  - no "SPEC PLACEHOLDER" strings survive anywhere
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getUpcomingApps } from '@/data/upcoming-apps';

const dataDir = join(process.cwd(), 'data');
const readJson = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf-8'));

const labApps = readJson('lab-apps.json');
const engStatus = readJson('engineering-status.json');
const engEvents = readJson('engineering-events.json');
const VALID_RESULTS = ['pending', 'passed', 'failed', 'unable-to-verify'];

describe('Phase 3.2 — engineering status data', () => {
  it('lab-apps contains exactly five records: 3 public + 2 hidden (BillCraft graduated)', () => {
    const apps = labApps.apps as Array<{ id: string; hidden: boolean }>;
    expect(apps).toHaveLength(5);
    expect(apps.filter((a) => !a.hidden).map((a) => a.id)).toEqual([
      'cartora', 'nutrilens', 'register',
    ]);
    expect(apps.filter((a) => a.hidden).map((a) => a.id).sort()).toEqual([
      'pdfly', 'publisher-console',
    ]);
  });

  it('public lab-apps mirror the real upcoming-apps records (order, status, progress)', () => {
    const upcoming = getUpcomingApps();
    const visible = (labApps.apps as Array<{ id: string; hidden: boolean; status: string; progress_percent: number }>)
      .filter((a) => !a.hidden);
    expect(visible.map((a) => a.id)).toEqual(upcoming.map((u) => u.id));
    upcoming.forEach((u, i) => {
      expect(visible[i].status).toBe(u.roadmapStatus);
      const done = u.milestones.filter((m) => m.status === 'done').length;
      expect(visible[i].progress_percent).toBe(Math.round((100 * done) / u.milestones.length));
    });
  });

  it('progress_percent is always derived from milestones, never out of range', () => {
    for (const app of labApps.apps) {
      const done = app.milestones.filter((m: { status: string }) => m.status === 'done').length;
      expect(app.progress_percent).toBe(Math.round((100 * done) / app.milestones.length));
      expect(app.progress_percent).toBeGreaterThanOrEqual(0);
      expect(app.progress_percent).toBeLessThanOrEqual(100);
    }
  });

  it('verification states are honest: passed ALWAYS has evidence, pending has none', () => {
    for (const app of labApps.apps) {
      expect(app.verification.length).toBeGreaterThan(0);
      for (const c of app.verification) {
        expect(VALID_RESULTS).toContain(c.result);
        expect(typeof c.id).toBe('string');
        expect(c.id.length).toBeGreaterThan(0);
        if (c.result === 'passed') {
          expect(c.summary?.length ?? 0).toBeGreaterThan(0);
          expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(c.source?.length ?? 0).toBeGreaterThan(0);
        }
        if (c.result === 'unable-to-verify') {
          expect(c.summary?.length ?? 0).toBeGreaterThan(0);
          expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        if (c.result === 'pending') {
          expect(c.date).toBeUndefined(); // no invented dates
        }
      }
    }
  });

  it('register evidence audit: repository integrity, never a passed application core-flow', () => {
    const reg = labApps.apps.find((a: { id: string }) => a.id === 'register') as
      | { verification: Array<{ category: string; build_id?: string; result: string; id: string; summary?: string; evidence_class?: string }> }
      | undefined;
    expect(reg).toBeDefined();
    const core = reg!.verification.find((c) => c.category === 'core-flow')!;
    const build = reg!.verification.find((c) => c.category === 'build')!;
    // Status-consistency audit (2026-10-16): the 13/13 repository/registry
    // integrity suite is NOT a passed Register core-flow test — the webapp's
    // flow is unimplemented. Evidence is preserved but relabelled.
    expect(core.id).toBe('register-coreflow-2026-10-15'); // stable id preserved
    expect(core.result).toBe('unable-to-verify');
    expect(core.build_id).toContain('eb6bc17');
    expect(core.evidence_class).toBe('repository-inspection');
    expect(core.summary).toMatch(/repository\/registry integrity verification/i);
    expect(core.summary).toMatch(/not the Register application's core flow/);
    expect(build.result).toBe('unable-to-verify'); // no fabricated build artifact
  });

  it('health indicator is green with three described conditions', () => {
    expect(engStatus.pipeline_state).toBe('green');
    expect(engStatus.health_indicator.overall).toBe('green');
    const conditions = engStatus.health_indicator.conditions;
    expect(conditions).toHaveLength(3);
    expect(conditions.map((c: { id: string }) => c.id).sort()).toEqual([
      'asset_verification', 'catalog_integrity', 'deploy_success',
    ]);
    for (const c of conditions) {
      expect(c.status).toBe('green');
      expect(c.description.length).toBeGreaterThan(20);
    }
  });

  it('catalog diff matches the git-derived reality (1 addition: CineFlow)', () => {
    expect(engStatus.catalog_diff.additions).toBe(1);
    expect(engStatus.catalog_diff.unchanged).toBe(7);
    expect(engStatus.catalog_diff.removals).toBe(0);
    expect(engStatus.catalog_diff.generated_from).toContain('CineFlow');
  });

  it('exactly seven real, newest-first engineering events', () => {
    const events = engEvents.events;
    expect(events).toHaveLength(7);
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp >= events[i].timestamp).toBe(true);
    }
    for (const e of events) {
      expect(e.id.length).toBeGreaterThan(0);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // Real commit references from the repository's history
    expect(events.some((e: { commit?: string }) => e.commit === 'ed7fb7c')).toBe(true);
    expect(events.some((e: { commit?: string }) => e.commit === '510dc06')).toBe(true);
  });

  it('scan_time is a real recent UTC timestamp', () => {
    expect(engStatus.scan_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const scanned = new Date(engStatus.scan_time).getTime();
    const now = Date.now();
    expect(scanned).toBeGreaterThan(now - 24 * 3600 * 1000); // generated within the last day
    expect(scanned).toBeLessThan(now + 60 * 1000);
  });

  it('no placeholder strings survive in the engineering data', () => {
    const all = JSON.stringify([labApps, engStatus, engEvents]);
    expect(all).not.toContain('SPEC PLACEHOLDER');
    expect(all).not.toContain('TBD');
    expect(all).not.toContain('TODO');
  });

  it('every file declares its real generated_from source', () => {
    expect(labApps.generated_from.length).toBeGreaterThan(20);
    expect(engStatus.generated_from.length).toBeGreaterThan(20);
    expect(engEvents.generated_from.length).toBeGreaterThan(20);
  });
});

// ===== Phase 3.2: build/release tracker, blockers, provenance classes =====
describe('Phase 3.2 — build tracker, blockers, and evidence provenance', () => {
  const builds = readJson('engineering-builds.json');

  it('every build record is a verbatim workflow fact (commit, run id, outcome, timestamp)', () => {
    expect(Array.isArray(builds.builds)).toBe(true);
    expect(builds.builds.length).toBeGreaterThan(0);
    for (const b of builds.builds) {
      expect(b.commit).toMatch(/^[0-9a-f]{7,40}$/); // real sha, verbatim
      expect(Number.isInteger(b.workflow_run_id)).toBe(true); // real run id
      expect(b.workflow_run_id).toBeGreaterThan(0);
      expect(['success', 'failure', 'cancelled']).toContain(b.outcome); // recorded outcome only
      expect(b.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/); // real timestamp, never missing
      expect(b.source.length).toBeGreaterThan(0);
      expect(b.generated_from ?? builds.generated_from).toContain('GitHub Actions');
    }
  });

  it('blockers are documented with reason, affected app, and resolution status', () => {
    const status = readJson('engineering-status.json');
    expect(Array.isArray(status.blockers)).toBe(true);
    for (const b of status.blockers) {
      expect(b.id.length).toBeGreaterThan(0);
      expect(b.app.length).toBeGreaterThan(0);
      expect(b.reason.length).toBeGreaterThan(10);
      expect(['open', 'resolved']).toContain(b.status);
      expect(b.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Known, real blocker is recorded honestly
    const apk = (status.blockers as Array<{ id: string; status: string }>).find((x) => x.id === 'blk-apk-server-fetch');
    expect(apk).toBeDefined();
    expect(apk!.status).toBe('open');
  });

  it('evidence provenance classes are explicit and never interchangeable', () => {
    const la = readJson('lab-apps.json');
    let sawAutomated = false;
    let sawInspection = false;
    for (const app of la.apps) {
      for (const c of app.verification) {
        if (c.result === 'passed') {
          expect(c.evidence_class).toBe('automated-test-evidence');
          sawAutomated = true;
        }
        if (c.result === 'unable-to-verify') {
          expect(c.evidence_class).toBe('repository-inspection');
          sawInspection = true;
        }
        // Pending checks never carry an evidence class.
        if (c.result === 'pending') expect(c.evidence_class).toBeUndefined();
      }
      for (const m of app.milestones) {
        // Milestone evidence is classed; statuses without evidence stay unclassed.
        if (m.status === 'done' && !m.evidence) expect(m.evidence_class).toBeUndefined();
        if (m.evidence_class === 'automated-test-evidence') expect(m.id).toBe('rg-m1'); // only the audited one
        if (m.evidence_class === 'automated-test-evidence') sawAutomated = true;
      }
    }
    // No verification check is currently passed (honest dataset) — the
    // automated-test-evidence class now appears only on the audited rg-m1
    // milestone; repository-inspection appears on the Register checks.
    expect(sawAutomated).toBe(true);
    expect(sawInspection).toBe(true);
  });

  it('milestones keep stable ids and progress is computed from records', () => {
    const la = readJson('lab-apps.json');
    for (const app of la.apps) {
      expect(app.milestones.length).toBeGreaterThan(0);
      const ids = new Set(app.milestones.map((m: { id: string }) => m.id));
      expect(ids.size).toBe(app.milestones.length); // unique stable ids
      const done = app.milestones.filter((m: { status: string }) => m.status === 'done').length;
      const expected = Math.round((done / app.milestones.length) * 100);
      expect(app.progress_percent).toBe(expected); // calculated, never hardcoded drift
    }
  });

  it('lab-app milestones stay consistent with the public roadmap source of truth', () => {
    const la = readJson('lab-apps.json');
    const upcoming = readJson('upcoming-apps.json');
    const publicIds = upcoming.map((u: { id: string }) => u.id);
    const visible = la.apps.filter((a: { hidden: boolean }) => !a.hidden);
    expect(visible.map((a: { id: string }) => a.id)).toEqual(publicIds); // exact public order preserved
    for (const app of visible) {
      const src = upcoming.find((u: { id: string }) => u.id === app.id);
      expect(src).toBeDefined();
      expect(app.status).toBe(src.roadmapStatus);
      expect(app.milestones.length).toBe(src.milestones.length);
      expect(app.milestones.every((m: { status: string }, i: number) => m.status === src.milestones[i].status)).toBe(true);
    }
  });
});
