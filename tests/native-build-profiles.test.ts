import { describe, it, expect } from 'vitest';
import {
  loadProfiles, loadCatalog, resolveProfile, validateIdentity,
  validateVersionSafety, validateRepository, gatesFor, maxPublishedVersionCode,
} from '../scripts/build-profile.mjs';

const profiles = loadProfiles();
const catalog = loadCatalog();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('A. single source of truth', () => {
  it('profiles and the published catalog agree', () => {
    const { problems } = validateIdentity(profiles, catalog);
    expect(problems).toEqual([]);
  });
  it('declares an unpublished artifact as a warning, not a silent pass', () => {
    const { warnings } = validateIdentity(profiles, catalog);
    expect(warnings.some((w: string) => w.includes('nexdrop-tv'))).toBe(true);
  });
  it('catches a package identity that disagrees with the catalog', () => {
    const bad = clone(catalog);
    const entry = bad.find((a: any) => a.slug === 'nexdrop');
    entry.apk.packageId = 'com.nexdrop.wrong';
    const { problems } = validateIdentity(profiles, bad);
    expect(problems.join(' ')).toContain('com.nexdrop.wrong');
  });
  it('refuses two artifacts claiming the same catalog slug', () => {
    const bad = clone(profiles);
    bad.profiles.nexdrop.artifacts[1].catalogSlug = 'nexdrop';
    const { problems } = validateIdentity(bad, catalog);
    expect(problems.join(' ')).toContain('claimed by more than one artifact');
  });
});

describe('B. version safety', () => {
  const published = maxPublishedVersionCode(catalog, 'com.nexdrop.ndt1');
  it('knows the highest published versionCode', () => {
    expect(published).toBe(10500);
  });
  it('refuses a downgrade or a re-publish', () => {
    expect(validateVersionSafety({ catalog, packageId: 'com.nexdrop.ndt1', versionCode: 19, floor: 10501 }).problems.length).toBe(2);
    expect(validateVersionSafety({ catalog, packageId: 'com.nexdrop.ndt1', versionCode: 10500, floor: 10501 }).problems.length).toBeGreaterThan(0);
  });
  it('accepts a genuine increment above the floor', () => {
    expect(validateVersionSafety({ catalog, packageId: 'com.nexdrop.ndt1', versionCode: 10501, floor: 10501 }).problems).toEqual([]);
  });
});

describe('D. repository security', () => {
  const { profile, artifact } = resolveProfile(profiles, 'nexdrop', 'app');
  const ok = {
    profiles, profile, artifact, repo: 'PDFly-source/nexdrop',
    ref: 'a'.repeat(40), task: ':app:assembleRelease', projectPath: 'android', dryRun: false,
  };
  it('accepts the approved allowlisted request', () => {
    expect(validateRepository(ok as any)).toEqual([]);
  });
  it('rejects an unlisted repository', () => {
    expect(validateRepository({ ...ok, repo: 'evil/repo' } as any).join(' ')).toContain('allowlist');
  });
  it('requires an immutable SHA for a release build', () => {
    expect(validateRepository({ ...ok, ref: 'main' } as any).join(' ')).toContain('immutable commit SHA');
  });
  it('rejects an unapproved gradle task', () => {
    expect(validateRepository({ ...ok, task: ':app:bundleRelease' } as any).join(' ')).toContain('not approved');
  });
  it('rejects a project path outside the profile', () => {
    expect(validateRepository({ ...ok, projectPath: '../..' } as any).join(' ')).toContain('project path');
  });
});

describe('E. NexDrop TV is an independent artifact', () => {
  it('resolves with its own identity', () => {
    const { kernel, artifact } = resolveProfile(profiles, 'nexdrop', 'tv');
    expect(kernel).toBe('native');
    expect(artifact.packageId).toBe('com.nexdrop.tv');
    expect(artifact.catalogSlug).toBe('nexdrop-tv');
    expect(artifact.independentArtifact).toBe(true);
  });
  it('is not conflated with the phone app', () => {
    const phone = resolveProfile(profiles, 'nexdrop', 'app').artifact;
    const tv = resolveProfile(profiles, 'nexdrop', 'tv').artifact;
    expect(phone.packageId).not.toBe(tv.packageId);
    expect(phone.gradleTask).not.toBe(tv.gradleTask);
  });
});

describe('kernels stay separated', () => {
  it('webview apps resolve to the wrapper kernel', () => {
    expect(resolveProfile(profiles, 'cineflow').kernel).toBe('webview');
    expect(gatesFor(profiles, resolveProfile(profiles, 'cineflow'))).toContain('webview-ownership');
  });
  it('native apps never inherit wrapper gates', () => {
    const gates = gatesFor(profiles, resolveProfile(profiles, 'nexdrop', 'app'));
    expect(gates).toContain('native-signature');
    expect(gates).not.toContain('webview-ownership');
  });
});
