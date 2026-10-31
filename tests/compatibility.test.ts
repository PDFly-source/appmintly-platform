import { describe, expect, it } from 'vitest';
import appsData from '@/data/apps.json';
import {
  UNKNOWN,
  androidVersionName,
  architectureLabel,
  buildCompatibility,
  findAppBySlug,
  formatBytes,
  installationSteps,
  isCompatibilityEligible,
  isUsableApiLevel,
} from '@/lib/compatibility/model';
import type { AppItem } from '@/data/apps';

const apps = appsData as unknown as AppItem[];
const realApk = apps.find((a) => a.slug === 'cineflow')!;

const makeApp = (overrides: Record<string, unknown> = {}) =>
  ({
    ...realApk,
    ...overrides,
    apk: 'apk' in overrides ? overrides.apk : realApk.apk,
    privacyTech: 'privacyTech' in overrides ? overrides.privacyTech : realApk.privacyTech,
  }) as unknown as AppItem;

const row = (model: ReturnType<typeof buildCompatibility>, label: string) =>
  [...(model?.android || []), ...(model?.apkInfo || []), ...(model?.storage || []), ...(model?.network || []), ...(model?.offline || []), ...(model?.browser || []), ...(model?.platforms || [])].find((f) => f.label === label)!;

describe('missing metadata stays explicitly unknown', () => {
  it('returns null for apps without a slug or unpublished records', () => {
    expect(buildCompatibility(null)).toBeNull();
    expect(buildCompatibility({ ...realApk, published: false } as unknown as AppItem)).toBeNull();
    expect(isCompatibilityEligible({ ...realApk, published: false })).toBe(false);
    expect(isCompatibilityEligible(realApk)).toBe(true);
  });
  it('marks every Android field as Not specified when no APK is verified', () => {
    const model = buildCompatibility(makeApp({ apk: { ...realApk.apk, verified: false } }));
    expect(model).not.toBeNull();
    expect(model!.hasVerifiedApk).toBe(false);
    expect(model!.android.every((f) => f.value === UNKNOWN && f.source === 'unknown')).toBe(true);
    expect(model!.unknownFields).toContain('Minimum Android version');
    expect(model!.limitations.join(' ')).toMatch(/No verified Android APK release/);
  });
  it('does not treat a disabled release as usable metadata', () => {
    const model = buildCompatibility(makeApp({ apk: { ...realApk.apk, enabled: false } }));
    expect(model!.hasVerifiedApk).toBe(false);
    expect(row(model, 'Download size').value).toBe(UNKNOWN);
  });
});

describe('invalid Android versions are refused, not guessed', () => {
  it('rejects implausible API levels', () => {
    for (const bad of [0, -1, 2.5, 101, '21', null, undefined]) {
      expect(isUsableApiLevel(bad)).toBe(false);
      expect(androidVersionName(bad)).toBeNull();
    }
  });
  it('names only real Android releases', () => {
    expect(androidVersionName(21)).toBe('Android 5.0 Lollipop (API 21)');
    expect(androidVersionName(26)).toBe('Android 8.0 Oreo (API 26)');
    expect(androidVersionName(34)).toBe('Android 14 (API 34)');
    expect(androidVersionName(36)).toBe('Android 16 (API 36)');
    expect(androidVersionName(99)).toBe('API level 99');
  });
  it('reports an invalid minSdk as unknown instead of rendering a version', () => {
    const model = buildCompatibility(makeApp({ apk: { ...realApk.apk, minSdk: 0, targetSdk: 999 } }));
    expect(row(model, 'Minimum Android version').value).toBe(UNKNOWN);
    expect(row(model, 'Minimum Android version').source).toBe('unknown');
    expect(row(model, 'Target Android version').value).toBe(UNKNOWN);
  });
});

describe('architecture is never assumed', () => {
  it('describes a universal build as un-split, not universal compatibility', () => {
    expect(architectureLabel('universal')).toMatch(/Universal APK \(no ABI split reported\)/);
    expect(architectureLabel('arm64-v8a')).toBe('ARM64 (arm64-v8a)');
    expect(architectureLabel('mips-weird')).toBe('mips-weird');
    expect(architectureLabel('')).toBeNull();
    expect(architectureLabel(undefined)).toBeNull();
  });
  it('marks a missing architecture field unknown', () => {
    const model = buildCompatibility(makeApp({ apk: { ...realApk.apk, architecture: undefined } }));
    expect(row(model, 'CPU architecture').value).toBe(UNKNOWN);
    expect(row(model, 'CPU architecture').verified).toBe(false);
  });
});

describe('sizes and dates are formatted from real values only', () => {
  it('formats bytes with a null guard', () => {
    expect(formatBytes(276334)).toBe('269.9 KB');
    expect(formatBytes(3528426)).toBe('3.36 MB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(-5)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
  });
  it('passes the published checksum and package through', () => {
    const model = buildCompatibility(realApk);
    expect(row(model, 'SHA-256 checksum').value).toHaveLength(64);
    expect(row(model, 'Package name').value).toBe('com.appforge.cineflow');
    expect(row(model, 'Version code').value).toBe('202');
  });
});

describe('placeholder strings are not mistaken for published facts', () => {
  it('treats "Not specified" text from the catalog as unknown', () => {
    const model = buildCompatibility(
      makeApp({ privacyTech: { ...realApk.privacyTech, offlineSupport: 'Not specified', notes: 'Unknown' } })
    )!;
    const offline = model.offline.find((f) => f.label === 'Offline capability')!;
    const networkNote = model.network.find((f) => f.label === 'Documented network behaviour')!;
    expect(offline.value).toBe(UNKNOWN);
    expect(offline.source).toBe('unknown');
    expect(networkNote.value).toBe(UNKNOWN);
    expect(networkNote.source).toBe('unknown');
    // every rendered "Not specified" row is counted in the unknown total
    const shown = [...model.android, ...model.apkInfo, ...model.storage, ...model.network, ...model.offline, ...model.browser, ...model.platforms]
      .filter((f) => f.value === UNKNOWN).map((f) => f.label).sort();
    expect(model.unknownFields.slice().sort()).toEqual(shown);
  });
});

describe('verified and publisher fields are visibly distinguished', () => {
  it('tags APK metadata as verified and publisher notes as not verified', () => {
    const model = buildCompatibility(realApk)!;
    expect(row(model, 'Minimum Android version').verified).toBe(true);
    expect(row(model, 'Minimum Android version').source).toBe('apk-metadata');
    expect(row(model, 'Offline capability').verified).toBe(false);
    expect(row(model, 'Offline capability').source).toBe('publisher');
    expect(model.sources[0]).toMatch(/APK release metadata/);
  });
});

describe('offline and online requirement states', () => {
  it('reflects offline-capable listings', () => {
    const model = buildCompatibility(makeApp({ privacyTech: { ...realApk.privacyTech, networkRequirement: 'offline-capable' } }));
    expect(row(model, 'Internet requirement').value).toMatch(/Works without a connection/);
    expect(row(model, 'Offline status recorded in the catalog').value).toBe('Marked offline-capable');
  });
  it('reflects online-only listings and adds a limitation', () => {
    const model = buildCompatibility(makeApp({ privacyTech: { ...realApk.privacyTech, networkRequirement: 'online-only' } }));
    expect(row(model, 'Internet requirement').value).toBe('Requires an internet connection');
    expect(model!.limitations.join(' ')).toMatch(/online-only/);
  });
  it('leaves a missing network field unknown rather than assuming online', () => {
    const model = buildCompatibility(makeApp({ privacyTech: { ...realApk.privacyTech, networkRequirement: undefined } }));
    expect(row(model, 'Internet requirement').value).toBe(UNKNOWN);
    expect(model!.limitations.join(' ')).not.toMatch(/online-only/);
  });
});

describe('unpublished apps and invalid slugs are excluded', () => {
  it('finds only published apps by slug', () => {
    expect(findAppBySlug(apps, 'cineflow')?.slug).toBe('cineflow');
    expect(findAppBySlug(apps, 'distribution-test')).toBeNull();
    expect(findAppBySlug(apps, 'not-a-real-app')).toBeNull();
    expect(findAppBySlug(apps, '')).toBeNull();
    expect(findAppBySlug(apps, 'CINEFLOW')).toBeNull();
    expect(findAppBySlug([], 'cineflow')).toBeNull();
  });
  it('buys nothing for a nonexistent app', () => {
    const none = findAppBySlug(apps, 'not-a-real-app');
    expect(buildCompatibility(none)).toBeNull();
    expect(installationSteps(null)).toEqual([]);
  });
});

describe('installation copy stays inside what is known', () => {
  it('never promises the device will work', () => {
    const model = buildCompatibility(realApk)!;
    const steps = installationSteps(model).join(' ');
    expect(steps).toMatch(/checksum only proves the file is unchanged/);
    expect(steps).not.toMatch(/your device (is|will be) (compatible|supported|tested)/i);
    expect(steps).not.toMatch(/guarantee/i);
  });
  it('lists a web path for apps with a web target', () => {
    const steps = installationSteps(buildCompatibility(realApk)!).join(' ');
    expect(steps).toMatch(/web link/);
  });
});

describe('long checksums cannot widen a mobile layout', () => {
  it('keeps the checksum inside a wrapping element contract', () => {
    const model = buildCompatibility(realApk)!;
    const sha = row(model, 'SHA-256 checksum');
    expect(sha.value).toHaveLength(64);
    // The renderer must wrap anywhere: a 64-char hash is 500px+ unbroken, which is
    // wider than a 390px viewport. This asserts the layout contract documented in
    // CompatibilitySection (min-w-0 + overflow-wrap:anywhere), not CSS itself.
    const css = require('fs').readFileSync('components/compatibility/CompatibilitySection.tsx', 'utf8');
    expect(css).toContain('[overflow-wrap:anywhere]');
    expect(css).toContain('min-w-0');
  });
});
