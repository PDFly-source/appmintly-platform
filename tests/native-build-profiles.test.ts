import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

/** Drives the real CLI: the workflow calls exactly these commands, so the
 *  tests must exercise the same contract the release depends on. */
const run = (args: string[]) => {
  try {
    const out = execFileSync('node', ['scripts/build-profile.mjs', ...args], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

describe('build profiles are the single source of truth', () => {
  it('validates against the published catalog with nothing pending', () => {
    const r = run(['validate']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).ok).toBe(true);
    expect(JSON.parse(r.out).warnings).toEqual([]);
  });

  it('keeps NexDrop app-only: :app, com.nexdrop.ndt1, :app:assembleRelease', () => {
    const r = run(['resolve', 'nexdrop', '--artifact', 'app']);
    const d = JSON.parse(r.out);
    expect(d.kernel).toBe('native');
    expect(d.artifact_id).toBe('app');
    expect(d.package_id).toBe('com.nexdrop.ndt1');
    expect(d.gradle_task).toBe(':app:assembleRelease');
    expect(d.project_path).toBe('android');
  });

  it('has no NexDrop TV artifact anywhere in scope', () => {
    const r = run(['resolve', 'nexdrop', '--artifact', 'app']);
    expect(JSON.stringify(JSON.parse(r.out))).not.toContain('com.nexdrop.tv');
    expect(run(['resolve', 'nexdrop', '--artifact', 'tv']).code).not.toBe(0);
  });

  it('rejects a versionCode at or below the published one', () => {
    expect(run(['assert-version', 'nexdrop', '--artifact', 'app', '--version-code', '10500']).code).not.toBe(0);
    expect(run(['assert-version', 'nexdrop', '--artifact', 'app', '--version-code', '10501']).code).toBe(0);
  });

  it('rejects a downgrade below the floor even when it beats the catalog', () => {
    expect(run(['assert-version', 'nexdrop', '--artifact', 'app', '--version-code', '10500']).code).not.toBe(0);
  });

  it('allows only the approved repository', () => {
    const base = ['assert-repository', 'nexdrop', '--artifact', 'app', '--task', ':app:assembleRelease',
      '--project-path', 'android', '--ref', 'f2891a03b8fae5857fc5f95df7f65f29ad36d3a4'];
    expect(run([...base, '--repo', 'PDFly-source/nexdrop', '--dry-run', 'false']).code).toBe(0);
    expect(run([...base, '--repo', 'attacker/evil', '--dry-run', 'false']).code).not.toBe(0);
  });

  it('requires an immutable ref for a release and allows a branch only in dry-run', () => {
    const base = ['assert-repository', 'nexdrop', '--artifact', 'app', '--repo', 'PDFly-source/nexdrop',
      '--task', ':app:assembleRelease', '--project-path', 'android'];
    expect(run([...base, '--ref', 'main', '--dry-run', 'false']).code).not.toBe(0);
    expect(run([...base, '--ref', 'main', '--dry-run', 'true']).code).toBe(0);
  });

  it('refuses a Gradle task outside the approved list', () => {
    const base = ['assert-repository', 'nexdrop', '--artifact', 'app', '--repo', 'PDFly-source/nexdrop',
      '--project-path', 'android', '--dry-run', 'false', '--ref', 'f2891a03b8fae5857fc5f95df7f65f29ad36d3a4'];
    expect(run([...base, '--task', ':tv:assembleRelease']).code).not.toBe(0);
    expect(run([...base, '--task', 'clean']).code).not.toBe(0);
  });

  it('emits native gate arguments derived from the profile', () => {
    const r = run(['gate-args', 'nexdrop', '--artifact', 'app']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--min-sdk 26');
    expect(r.out).toContain('--target-sdk 34');
    expect(r.out).toContain('--allow-exported com.nexdrop.ndt1.MainActivity');
    expect(r.out).toContain('--cleartext-allowed false');
  });
});
