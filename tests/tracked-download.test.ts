import { describe, expect, it } from 'vitest';
import {
  TRACKED_DOWNLOAD_BASE,
  apkDownloadUrl,
  hasAuthoritativeApkRelease,
  trackedDownloadUrl,
} from '@/lib/distribution';

/**
 * Item 5 marketplace integration: the "Get App" action may only be routed
 * through the Worker's tracked endpoint when the published record carries real
 * release evidence, and the tracked URL must never be built from caller input.
 */
const publishedRelease = {
  slug: 'cineflow',
  apk: {
    enabled: true,
    verified: true,
    sha256: 'a'.repeat(64),
    apkUrl:
      'https://github.com/PDFly-source/appmintly-releases/releases/download/cineflow-v0.2.2/CineFlow-0.2.2.apk',
  },
};

describe('tracked download routing', () => {
  it('routes an authoritative release through /dl/<slug>', () => {
    expect(apkDownloadUrl(publishedRelease)).toBe(`${TRACKED_DOWNLOAD_BASE}/dl/cineflow`);
  });

  it('keeps the direct official asset as the worker destination contract', () => {
    // The marketplace never rewrites the recorded asset; it stays untouched so
    // the worker can redirect to exactly the published release.
    expect(publishedRelease.apk.apkUrl).toContain('appmintly-releases');
    expect(apkDownloadUrl(publishedRelease)).not.toContain('github.com');
  });

  it('returns null for listings without authoritative release evidence', () => {
    expect(apkDownloadUrl({ slug: 'web-only', apk: { enabled: false } })).toBeNull();
    expect(
      apkDownloadUrl({ slug: 'unverified', apk: { ...publishedRelease.apk, verified: false } })
    ).toBeNull();
    expect(
      apkDownloadUrl({ slug: 'no-checksum', apk: { ...publishedRelease.apk, sha256: '' } })
    ).toBeNull();
    expect(apkDownloadUrl(null)).toBeNull();
  });

  it('falls back to the direct asset only when the slug is unusable', () => {
    // A slug that fails validation cannot be tracked; the official asset is
    // still served, unchanged.
    expect(apkDownloadUrl({ ...publishedRelease, slug: undefined })).toBe(publishedRelease.apk.apkUrl);
    expect(apkDownloadUrl({ ...publishedRelease, slug: '../auth/login' })).toBe(
      publishedRelease.apk.apkUrl
    );
  });

  it('refuses to build a tracked URL from malformed input', () => {
    expect(trackedDownloadUrl('')).toBeNull();
    expect(trackedDownloadUrl('a b')).toBeNull();
    expect(trackedDownloadUrl('https://evil.example/x.apk')).toBeNull();
    expect(trackedDownloadUrl(undefined)).toBeNull();
  });

  it('does not change the authoritative-release predicate', () => {
    expect(hasAuthoritativeApkRelease(publishedRelease)).toBe(true);
    expect(apkDownloadUrl(publishedRelease)).not.toBe(publishedRelease.apk.apkUrl);
  });
});
