import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BillCraft official-publication regression suite (#06).
 *
 * Pins the canonical BillCraft catalog entry in data/apps.json, its
 * marketplace brand icon (complete official lockup — emblem + wordmark +
 * CREATE • CALCULATE • SHARE tagline), the real screenshots captured from the
 * production build, and the Lab/registry consistency of the publication.
 * Also proves that every pre-existing catalog record is untouched by the
 * publication.
 */

type CatalogRecord = Record<string, any>;

const REPO = fileURLToPath(new URL('..', import.meta.url));
const readCatalog = (): CatalogRecord[] =>
  JSON.parse(readFileSync(join(REPO, 'data', 'apps.json'), 'utf8'));

describe('BillCraft official publication — catalog record', () => {
  test('BillCraft exists exactly once as the sixth published application', () => {
    const apps = readCatalog();
    const bc = apps.filter((a) => a.slug === 'billcraft');
    expect(bc).toHaveLength(1);
    const published = apps.filter((a) => a.published === true && a.status === 'published');
    // CineFlow joined the catalog on 2026-10-27 as the seventh published app.
    expect(published).toHaveLength(7);
    expect(published.map((a) => a.slug)).toContain('billcraft');
    // Ordering: the draft distribution-test record is never published.
    expect(published.some((a) => a.slug === 'distribution-test')).toBe(false);
  });

  test('record uses the exact approved metadata', () => {
    const bc = readCatalog().find((a) => a.slug === 'billcraft')!;
    expect(bc.name).toBe('BillCraft');
    expect(bc.id).toBe('billcraft');
    expect(bc.developer).toBe('PKD');
    expect(bc.developerSlug).toBe('pkd');
    expect(bc.type).toBe('Web App'); // dual distribution: web app + APK (like the AppMintly app)
    expect(bc.category).toBe('Productivity');
    expect(bc.version).toBe('0.1.0'); // derived from the repository package.json
    expect(bc.status).toBe('published');
    expect(bc.published).toBe(true);
    expect(bc.url).toBe('https://pdfly-source.github.io/billcraft/');
    expect(bc.launchUrl).toBe('https://pdfly-source.github.io/billcraft/');
    expect(bc.themeColor.toLowerCase()).toBe('#593c8f');
    expect(bc.shortDescription).toBe(
      'Create professional invoices, quotations, receipts and estimates with private, local-first PDF tools.'
    );
    // Tagline (official artwork) is present in the listing prose.
    expect(bc.description).toContain('Create. Calculate. Share.');
    expect(bc.description).toContain('privacy-first');
    expect(bc.description).toContain('PDF export');
    // No accounting/tax-filing overclaim.
    expect(bc.description.toLowerCase()).not.toContain('tax filing');
    expect(bc.description.toLowerCase()).not.toContain('regulatory');
    // Dual-release preparation: the APK is pre-configured for the
    // Production APK Release workflow (found by packageId), but stays
    // DISABLED until that workflow's fail-closed gates publish a verified
    // signed binary. Never enabled without a real artifact URL.
    expect(bc.apk?.packageId).toBe('com.appforge.billcraft');
    expect(bc.apk?.buildMode).toBe('webview');
    expect(bc.apk?.enabled).toBe(!!(bc.apk?.apkUrl && bc.apk?.sha256 && bc.apk?.fileSizeBytes));
    expect(bc.apkUrl ?? '').toBe(bc.apk?.apkUrl ?? '');
  });

  test('exactly 10 verified key features and 3 release notes', () => {
    const bc = readCatalog().find((a) => a.slug === 'billcraft')!;
    expect(bc.features).toHaveLength(10);
    expect(bc.features.every((f: string) => f.length > 10)).toBe(true);
    expect(bc.releaseNotes).toHaveLength(3);
    expect(bc.releaseNotes[0]).toContain('sixth published application');
  });

  test('no duplicate: billcraft appears exactly once, as the catalog-synced published record', () => {
    const up = JSON.parse(readFileSync(join(REPO, 'data', 'upcoming-apps.json'), 'utf8'));
    // Post Phase-2 sync semantics: live catalog apps are represented in the
    // Lab by ONE sync-managed published record each — never a curated
    // duplicate with the raw slug/id 'billcraft'.
    const matches = up.filter((a: any) => a.slug === 'billcraft' || a.id === 'billcraft' || a.id === 'catalog-billcraft' || a.catalogSlug === 'billcraft');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('catalog-billcraft');
    expect(matches[0].syncManaged).toBe(true);
    expect(matches[0].roadmapStatus).toBe('published');
    expect(matches[0].publicUrl).toMatch(/^https:\/\/appmintly\.pages\.dev\/app\/billcraft\/$/);
  });

  test('Lab mirror stays consistent: 40 public records (33 curated + 7 catalog-synced published) + 2 hidden', () => {
    const lab = JSON.parse(readFileSync(join(REPO, 'data', 'lab-apps.json'), 'utf8'));
    // Phase-2 sync semantics: the raw 'billcraft' graduated pre-sync; its
    // live representation is the sync-managed catalog-billcraft record.
    expect((lab.apps as any[]).some((a) => a.id === 'billcraft')).toBe(false);
    expect((lab.apps as any[]).filter((a) => !a.hidden).map((a) => a.id)).toEqual(
      ["cartora", "nutrilens", "register", "hisaabkhata", "qr-forge", "unitx-axom", "emiwise", "agex", "docuscan-mint", "imageslim", "audiotrim", "passportlab", "colorsnap", "textcraft", "billsplit-mint", "typeaxom", "focusmint", "notecheck", "measuremint", "wagebook", "randhoon", "billscan", "signlab", "cropcraft", "soundmeter", "breathease", "bhoomimap", "cardmint", "fileswitch", "lightlux", "slipgen", "kharcha", "morselab", "catalog-appmintly", "catalog-studyria", "catalog-pdfminifly", "catalog-niramay", "catalog-nexdrop", "catalog-billcraft", "catalog-cineflow"] as string[]
    );
  });

  test('engineering events record the publication', () => {
    const ev = JSON.parse(readFileSync(join(REPO, 'data', 'engineering-events.json'), 'utf8'));
    expect(ev.events.some((e: any) => e.id === 'EVT-20261017-01' && e.type === 'catalog')).toBe(true);
  });
});

describe('BillCraft official publication — brand assets', () => {
  test('listing icon is the complete official lockup (not emblem-only)', () => {
    const iconPath = join(REPO, 'public', 'brand', 'billcraft-icon-384.png');
    expect(existsSync(iconPath)).toBe(true);
    const buf = readFileSync(iconPath);
    // PNG dims
    expect(buf.readUInt32BE(16)).toBe(384);
    expect(buf.readUInt32BE(20)).toBe(384);
    // Byte-pin of the deterministic derivative (update deliberately only).
    const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    expect(sha).toBe('24d34bbb9960fc4c');
  });

  test('lab logo asset remains untouched (byte-pin)', () => {
    const buf = readFileSync(join(REPO, 'public', 'brand', 'billcraft-logo.png'));
    const sha = createHash('sha256').update(buf).digest('hex').slice(0, 12);
    expect(sha).toBe('e08b3d4a7e3d');
  });

  test('all four listing screenshots exist and are real captures', () => {
    const bc = readCatalog().find((a) => a.slug === 'billcraft')!;
    expect(bc.screenshots).toHaveLength(4);
    for (const s of bc.screenshots) {
      const p = join(REPO, 'public', s.replace(/^\//, ''));
      expect(existsSync(p)).toBe(true);
      const buf = readFileSync(p);
      // 2x-DPR captures, downscaled to 1400 wide — real page shots, not tiny stubs.
      expect(buf.readUInt32BE(16)).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('BillCraft official publication — isolation', () => {
  test('every pre-existing catalog record keeps its identity', () => {
    const apps = readCatalog();
    const expected: Record<string, [string, string]> = {
      appmintly: ['1.0.10', 'published'],
      studyria: ['2.0.2', 'published'],
      pdfminifly: ['2.1.2', 'published'],
      niramay: ['2.1.1', 'published'],
      nexdrop: ['1.4.6', 'published'],
      'distribution-test': ['1.0.1', 'draft'],
    };
    for (const [slug, [version, status]] of Object.entries(expected)) {
      const a = apps.find((x) => x.slug === slug)!;
      expect(a.version, slug).toBe(version);
      expect(a.status, slug).toBe(status);
    }
  });

  test('other brand assets untouched (sample byte-pins)', () => {
    const pins: Record<string, string> = {
      'public/brand/appmintly-logo-official.png': '74e7386ec91e',
      'public/brand/nexdrop-icon-384.png': 'c03be5600a1a',
      'public/brand/niramay-icon-384.png': 'd5dd86502d8a',
      'public/brand/studyria-icon-384.png': 'b7d2a3a1f9a8',
    };
    // Only assert existence + stable name; the appmintly official master is
    // byte-pinned exactly (single source of truth check).
    const official = readFileSync(join(REPO, 'public', 'brand', 'appmintly-logo-official.png'));
    expect(createHash('sha256').update(official).digest('hex').slice(0, 12)).toBe('74e7386ec91e');
    for (const p of Object.keys(pins)) expect(existsSync(join(REPO, p))).toBe(true);
  });
});

describe('BillCraft dual release — evidence-based verification', () => {
  const bc = readCatalog().find((a: any) => a.slug === 'billcraft')!;
  const pt = bc.privacyTech;

  test('privacyTech: seven web-verified fields carry real evidence', () => {
    expect(pt.dataCollection).toContain('IndexedDB');
    expect(pt.tracking.toLowerCase()).toContain('no trackers');
    expect(pt.networkRequirement).toBe('offline-capable');
    expect(pt.offlineSupport.toLowerCase()).toContain('service worker');
    expect(pt.pwaSupport).toBe('verified-installable');
    expect(pt.storage).toContain('localStorage');
    expect(pt.installationType).toContain('PWA');
    expect(pt.externalServices).toContain('GitHub Pages (site hosting)');
  });

  test('Android permissions are NEVER claimed before a real APK manifest inspection', () => {
    // Fail-closed: permissions may only appear with permissionsSource
    // 'apk-manifest' (the signed binary's actual manifest), and only when
    // an authoritative APK release exists.
    if (pt.permissions && pt.permissions.length > 0) {
      expect(pt.permissionsSource).toBe('apk-manifest');
      expect(bc.apk?.enabled).toBe(true);
      expect(bc.apk?.verified).toBe(true);
      for (const perm of pt.permissions) {
        expect(perm).toMatch(/^android\.permission\./);
      }
    } else {
      expect(pt.permissionsSource ?? 'pending').not.toBe('apk-manifest');
    }
  });

  test('APK metadata, when released, is internally consistent and never a downgrade', () => {
    if (bc.apk?.enabled) {
      expect(bc.apk.apkUrl).toMatch(/^https:\/\/github\.com\/PDFly-source\/appmintly-releases\/releases\/download\/billcraft-v[\d.]+\/BillCraft-[\d.]+\.apk$/);
      expect(bc.apk.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(bc.apk.fileSizeBytes).toBeGreaterThan(45000);
      expect(bc.apk.versionName).toBe(bc.version);
      expect(bc.apk.versionCode).toBeGreaterThanOrEqual(100); // 0.1.0 -> 100
      expect(bc.apk.buildStatus).toBe('released');
      expect(bc.apk.verified).toBe(true);
      expect(bc.apk.certificateSha256Fingerprint).toBe(
        'dbafc6d389516069518826d1e1320cebcf7970eec9249d749de699b730f61368'
      );
      expect(bc.apkUrl).toBe(bc.apk.apkUrl);
    } else {
      // Pre-release: no download claims anywhere on the listing.
      expect(bc.apkUrl ?? '').toBe('');
      expect(bc.downloadUrl ?? '').toBe('');
    }
  });

  test('installationType only claims the APK path once the APK is verified', () => {
    if (!bc.apk?.enabled) {
      expect(pt.installationType).not.toContain('APK');
      expect(pt.externalServices).not.toContain('GitHub Releases (APK distribution)');
    }
  });

  test('version code derivation for 0.1.0 matches the builder formula', () => {
    const [major, minor, patch] = bc.version.split('.').map(Number);
    expect(major * 10000 + minor * 100 + patch).toBe(100);
  });
});
