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
 *  - catalog diff matches the real git-derived numbers (NexDrop addition)
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
  it('lab-apps contains exactly six records: 4 public + 2 hidden', () => {
    const apps = labApps.apps as Array<{ id: string; hidden: boolean }>;
    expect(apps).toHaveLength(6);
    expect(apps.filter((a) => !a.hidden).map((a) => a.id)).toEqual([
      'billcraft', 'cartora', 'nutrilens', 'register',
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

  it('register carries the real evidence audit (passed core-flow + unable-to-verify build)', () => {
    const reg = labApps.apps.find((a: { id: string }) => a.id === 'register') as
      | { verification: Array<{ category: string; build_id?: string; result: string; id: string }> }
      | undefined;
    expect(reg).toBeDefined();
    const core = reg!.verification.find((c) => c.category === 'core-flow')!;
    const build = reg!.verification.find((c) => c.category === 'build')!;
    expect(core.id).toBe('register-coreflow-2026-10-15'); // stable id preserved
    expect(core.result).toBe('passed');
    expect(core.build_id).toContain('eb6bc17');
    expect(build.result).toBe('unable-to-verify');
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

  it('catalog diff matches the git-derived reality (1 addition: NexDrop)', () => {
    expect(engStatus.catalog_diff.additions).toBe(1);
    expect(engStatus.catalog_diff.unchanged).toBe(5);
    expect(engStatus.catalog_diff.removals).toBe(0);
    expect(engStatus.catalog_diff.generated_from).toContain('NexDrop');
    expect(engStatus.catalog_diff.generated_from).toContain('72be95f');
  });

  it('exactly five real, newest-first engineering events', () => {
    const events = engEvents.events;
    expect(events).toHaveLength(5);
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
