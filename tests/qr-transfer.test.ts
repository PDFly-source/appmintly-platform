/**
 * Phase 1A — A3 regression tests: QR code instant transfer.
 *
 * Contract under test:
 *  - The default QR target is ALWAYS the app's canonical AppMintly page URL
 *    (origin + BASE_PATH + /app/<slug>) — never an expired temporary
 *    artifact URL, never a raw asset URL by accident.
 *  - The Web target appears only when the record carries a real web URL.
 *  - The APK target appears ONLY from authoritative release evidence
 *    (enabled + verified + sha256 + release URL) — never fabricated.
 *  - The canonical URL is QR-encodable (the qrcode lib accepts it).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildQrTargets as buildTargets, canonicalAppUrl } from '../lib/qr-targets';
import type { AppItem } from '../data/apps';

const ORIGIN = 'https://appmintly.pages.dev';

function stubWindow(origin: string) {
  (globalThis as any).window = { location: { origin } };
}

function makeApp(partial: Record<string, unknown>): AppItem {
  return {
    id: 'appmintly',
    slug: 'appmintly',
    name: 'AppMintly',
    ...partial,
  } as AppItem;
}

describe('buildTargets — canonical URL discipline', () => {
  beforeEach(() => stubWindow(ORIGIN));
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('default target is the canonical app page URL (origin + /app/<slug>)', () => {
    const targets = buildTargets(makeApp({}));
    expect(targets[0]).toMatchObject({ id: 'detail', url: `${ORIGIN}/app/appmintly` });
  });

  it('canonical URL contains the slug path, never a temporary artifact URL', () => {
    const targets = buildTargets(makeApp({}));
    const url = targets[0].url;
    expect(url).toContain('/app/appmintly');
    expect(url.startsWith(ORIGIN)).toBe(true);
    // never signed/expired asset links
    expect(url).not.toContain('X-Amz');
    expect(url).not.toContain('blob:');
    expect(url).not.toContain('token=');
  });

  it('web target present only when the record has a web URL', () => {
    const withWeb = buildTargets(makeApp({ launchUrl: 'https://app.appmintly.com' }));
    expect(withWeb.some((t) => t.id === 'web' && t.url === 'https://app.appmintly.com')).toBe(true);

    const withoutWeb = buildTargets(makeApp({}));
    expect(withoutWeb.some((t) => t.id === 'web')).toBe(false);
  });

  it('APK target only from authoritative release evidence — never fabricated', () => {
    const authoritative = makeApp({
      apk: {
        enabled: true,
        verified: true,
        sha256: 'a'.repeat(64),
        apkUrl: 'https://github.com/PDFly-source/appmintly-releases/releases/download/v1.0.9/app.apk',
      },
    });
    const withApk = buildTargets(authoritative);
    const apkTarget = withApk.find((t) => t.id === 'apk');
    expect(apkTarget?.url).toBe(authoritative.apk!.apkUrl);

    // missing any single evidence bit => no APK target
    const notVerified = makeApp({
      apk: { enabled: true, verified: false, sha256: 'a'.repeat(64), apkUrl: 'https://example.com/x.apk' },
    });
    expect(buildTargets(notVerified).some((t) => t.id === 'apk')).toBe(false);

    const noSha = makeApp({
      apk: { enabled: true, verified: true, apkUrl: 'https://example.com/x.apk' },
    });
    expect(buildTargets(noSha).some((t) => t.id === 'apk')).toBe(false);

    const noUrl = makeApp({
      apk: { enabled: true, verified: true, sha256: 'a'.repeat(64) },
    });
    expect(buildTargets(noUrl).some((t) => t.id === 'apk')).toBe(false);
  });

  it('detail target is always first (desktop-to-phone default workflow)', () => {
    const targets = buildTargets(
      makeApp({
        launchUrl: 'https://web.example.com',
        apk: { enabled: true, verified: true, sha256: 'a'.repeat(64), apkUrl: 'https://example.com/x.apk' },
      })
    );
    expect(targets[0].id).toBe('detail');
    expect(targets.map((t) => t.id)).toEqual(['detail', 'web', 'apk']);
  });

  it('the canonical URL is QR-encodable', async () => {
    stubWindow(ORIGIN);
    const targets = buildTargets(makeApp({}));
    const QRCode = await import('qrcode');
    await expect(QRCode.toDataURL(targets[0].url, { errorCorrectionLevel: 'M' })).resolves.toMatch(/^data:image\/png;base64,/);
  });
});
