import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  applyPrimaryAndroidRelease,
  hasUsableNativeArtifact,
  nativeDownloadUrl,
  primaryAndroidRelease,
} from '@/lib/native-artifact';

/**
 * Native artifact resolution — AppMintly Marketplace.
 *
 * The live listing showed "Version 1.5.0" for NexDrop because every surface
 * read the top-level `version` / `apk` fields (the WebView-wrapper channel)
 * while the native release metadata sat unused in `nativeArtifact`. These
 * tests lock in the deterministic rule: a usable native artifact IS the
 * primary Android release; the wrapper record stays preserved.
 */

const ROOT = path.resolve(__dirname, '..');
const RAW = JSON.parse(readFileSync(path.join(ROOT, 'data/apps.json'), 'utf8')) as any[];

const raw = (slug: string) => RAW.find((a) => a.slug === slug)!;
const promoted = (slug: string) => applyPrimaryAndroidRelease(raw(slug));

const NEXDROP = raw('nexdrop');
const NATIVE = NEXDROP.nativeArtifact;
const WRAPPER = NEXDROP.apk;

const EXPECTED_SHA = 'a66d0d933d04fbf145d446b2bcf389ad52eca78cce097d7f3a2d5a0f16cc61ac';
const NATIVE_APK_URL =
  'https://github.com/PDFly-source/nexdrop/releases/download/nexdrop-android-v5a41934/NexDrop-release.apk';

describe('native artifact: NexDrop primary Android metadata', () => {
  it('TEST 1 — the record every public surface consumes reports 1.4.7, never 1.5.0', () => {
    const app = promoted('nexdrop');
    expect(app.version).toBe('1.4.7');
    expect(app.version).not.toBe('1.5.0');
    expect(app.androidChannel).toBe('native');
  });

  it('TEST 2 — detail metadata (version, build, updated date) is the native release', () => {
    const app = promoted('nexdrop');
    expect(app.apk?.versionName).toBe('1.4.7');
    expect(app.apk?.versionCode).toBe(20);
    expect(app.lastUpdated).toBe('2026-11-11');
    expect(app.updatedAt).toBe('2026-11-11');
  });

  it('TEST 3 — Get App resolves the nativeArtifact release asset', () => {
    expect(nativeDownloadUrl(raw('nexdrop'))).toBe(NATIVE_APK_URL);
    expect(nativeDownloadUrl(promoted('nexdrop'))).toBe(NATIVE_APK_URL);
    expect(nativeDownloadUrl(raw('nexdrop'))).toBe(NATIVE.apkUrl);
  });

  it('TEST 6 — APK package is com.nexdrop.ndt1 on the native channel', () => {
    const app = promoted('nexdrop');
    expect(app.apk?.packageId).toBe('com.nexdrop.ndt1');
    expect(app.nativeArtifact).toEqual(
      expect.objectContaining({ packageId: 'com.nexdrop.ndt1' })
    );
  });

  it('TEST 7 — Open on Web targets the existing PWA, distinct from the APK asset', () => {
    const app = promoted('nexdrop');
    const web = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
    expect(web).toBe('https://pdfly-source.github.io/nexdrop/');
    expect(web).not.toBe(NATIVE_APK_URL);
    // promotion never rewrites the web fields
    expect(app.launchUrl).toBe(NEXDROP.launchUrl);
    expect(app.webUrl).toBe(NEXDROP.webUrl);
    expect(app.pwaUrl).toBe(NEXDROP.pwaUrl);
  });

  it('TEST 8 — wrapper metadata survives verbatim (1.5.0 / 10500 / aa1e698b…)', () => {
    const app = promoted('nexdrop');
    const wrapper = app.wrapperApk as any;
    expect(wrapper.versionName).toBe('1.5.0');
    expect(wrapper.versionCode).toBe(10500);
    expect(wrapper.sha256.startsWith('aa1e698b')).toBe(true);
    expect(wrapper.apkUrl).toBe(WRAPPER.apkUrl);
    expect(app.apk?.wrapperArtifact).toEqual(wrapper);
    // and the catalog file itself was not rewritten
    expect(WRAPPER.versionName).toBe('1.5.0');
    expect(WRAPPER.versionCode).toBe(10500);
  });

  it('TEST 11 — native artifact evidence is intact in the catalog record', () => {
    expect(hasUsableNativeArtifact(raw('nexdrop'))).toBe(true);
    expect(NATIVE).toMatchObject({
      enabled: true,
      kind: 'native-android',
      packageId: 'com.nexdrop.ndt1',
      versionName: '1.4.7',
      versionCode: 20,
      minSdk: 26,
      targetSdk: 36,
      sha256: EXPECTED_SHA,
      fileSizeBytes: 3562408,
      apkUrl: NATIVE_APK_URL,
      releaseTag: 'nexdrop-android-v5a41934',
      releaseDate: '2026-11-11',
      signingCertificateSha256:
        '11cb2ab82ba751fea04d101bd3a1498b852581f999056a3bc371e47e326a861a',
      verified: true,
    });
    // survives a serialize → parse round trip (what the deployed catalog is)
    const roundTripped = JSON.parse(JSON.stringify(promoted('nexdrop')));
    expect(primaryAndroidRelease(roundTripped)?.versionName).toBe('1.4.7');
  });

  it('TEST 14 — no stale 1.5.0 remains the primary Android version anywhere', () => {
    const app = promoted('nexdrop');
    const primary = primaryAndroidRelease(app)!;
    expect(primary.channel).toBe('native');
    expect(primary.versionName).not.toBe('1.5.0');
    expect(app.apk?.versionName).not.toBe('1.5.0');
  });
});

describe('native artifact: other records keep their existing behaviour', () => {
  it('TEST 9 — every other catalog entry is untouched by resolution', () => {
    for (const record of RAW) {
      if (record.slug === 'nexdrop') continue;
      expect(applyPrimaryAndroidRelease(record)).toEqual(record);
      expect(hasUsableNativeArtifact(record)).toBe(false);
    }
  });

  it('TEST 10 — wrapper-only apps still resolve their wrapper release', () => {
    const withApk = RAW.filter((a) => a.slug !== 'nexdrop' && a.apk?.apkUrl);
    expect(withApk.length).toBeGreaterThan(0);
    for (const record of withApk) {
      const release = primaryAndroidRelease(record)!;
      expect(release.channel).toBe('wrapper');
      expect(release.versionName).toBe(record.apk.versionName);
      expect(release.apkUrl).toBe(record.apk.apkUrl);
      expect(nativeDownloadUrl(record)).toBeNull();
    }
  });

  it('an unusable nativeArtifact never overrides a real wrapper release', () => {
    const broken = {
      ...raw('nexdrop'),
      nativeArtifact: { ...NATIVE, verified: false },
    };
    const release = primaryAndroidRelease(broken)!;
    expect(release.channel).toBe('wrapper');
    expect(release.versionName).toBe('1.5.0');
    expect(applyPrimaryAndroidRelease(broken)).toEqual(broken);
  });
});

const LIVE = process.env.RUN_NETWORK_TESTS === '1';

describe.skipIf(!LIVE)('native artifact: live production evidence', () => {
  it('TEST 4/5 — the resolved APK downloads and hashes to the release sha256', async () => {
    const url = nativeDownloadUrl(raw('nexdrop'))!;
    const res = await fetch(url, { redirect: 'follow' });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBe(NATIVE.fileSizeBytes);
    const { createHash } = await import('crypto');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(EXPECTED_SHA);
  }, 60_000);

  it('TEST 12 — the production catalog response exposes the native metadata', async () => {
    const res = await fetch(
      'https://pdfly-source.github.io/appmintly-platform/data/apps.json',
      { redirect: 'follow' }
    );
    expect(res.status).toBe(200);
    const live = (await res.json()) as any[];
    const record = live.find((a) => a.slug === 'nexdrop')!;
    expect(hasUsableNativeArtifact(record)).toBe(true);
    expect(primaryAndroidRelease(record)?.versionName).toBe('1.4.7');
    expect(record.nativeArtifact.sha256).toBe(EXPECTED_SHA);
    expect(record.apk.versionName).toBe('1.5.0');
  }, 60_000);
});
