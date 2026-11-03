import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import yaml from 'js-yaml';

/**
 * Regression guard for the 2026-11-03 data-write race.
 *
 * sync-lab.yml and engineering-data-refresh.yml both write
 * data/engineering-status.json and data/lab-apps.json. They run on independent
 * cron schedules (17 *\/6 * * * and 23 3 * * *) and both push to main with the
 * default GITHUB_TOKEN. Without a shared concurrency group two overlapping runs
 * race: the slower push is rejected as non-fast-forward and its scan is lost,
 * or the two runs interleave writes to the same generated file.
 *
 * The fix is one shared group with cancel-in-progress false. These checks fail
 * if anyone later renames, splits or cancels that group.
 */

const read = (p: string) => fs.readFileSync(p, 'utf8');
const load = (p: string) => yaml.load(read(p)) as any;

const lab = load('.github/workflows/sync-lab.yml');
const refresh = load('.github/workflows/engineering-data-refresh.yml');

describe('lab data writers are serialised', () => {
  it('both workflows declare a concurrency group', () => {
    expect(lab.concurrency?.group).toBeTruthy();
    expect(refresh.concurrency?.group).toBeTruthy();
  });

  it('both workflows share the exact same group name', () => {
    expect(refresh.concurrency.group).toBe(lab.concurrency.group);
  });

  it('neither cancels an in-progress run', () => {
    // cancel-in-progress: true would kill a run mid-write and can abort a
    // deployment in a shared group.
    expect(lab.concurrency['cancel-in-progress']).toBe(false);
    expect(refresh.concurrency['cancel-in-progress']).toBe(false);
  });

  it('keeps both cron schedules intact', () => {
    expect(lab.on.schedule[0].cron).toBe('17 */6 * * *');
    expect(refresh.on.schedule[0].cron).toBe('23 3 * * *');
  });

  it('keeps workflow_dispatch available on both', () => {
    expect(lab.on).toHaveProperty('workflow_dispatch');
    expect(refresh.on).toHaveProperty('workflow_dispatch');
  });

  it('writes no data before a successful generation', () => {
    // The commit step must be its own step after the generator, so a failing
    // generator aborts the job and can never persist a scan_time.
    const refreshNames = refresh.jobs.refresh.steps.map((s: any) => s.name ?? '');
    const genIdx = refreshNames.findIndex((n: string) => /Regenerate engineering data/i.test(n));
    const commitIdx = refreshNames.findIndex((n: string) => /Commit only when/i.test(n));
    expect(genIdx).toBeGreaterThanOrEqual(0);
    expect(commitIdx).toBeGreaterThan(genIdx);
    const genStep = refresh.jobs.refresh.steps[genIdx];
    expect(genStep['continue-on-error']).not.toBe(true);
  });

  it('both commit steps fail closed on shell errors', () => {
    const commitStep = refresh.jobs.refresh.steps.find((s: any) => /Commit only when/i.test(s.name ?? ''));
    expect(commitStep.run).toContain('set -euo pipefail');
    const labCommit = lab.jobs.sync.steps.find((s: any) => /Commit only when/i.test(s.name ?? ''));
    expect(labCommit.run).toContain('set -euo pipefail');
  });

  it('does not run a deployment inside the shared data group', () => {
    // deploy.yml owns the 'pages' group; if it ever joined the data group a
    // queued scan could delay or supersede a production deployment.
    const deploy = load('.github/workflows/deploy.yml');
    expect(deploy.concurrency.group).not.toBe(lab.concurrency.group);
  });
});
