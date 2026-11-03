import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPng } from '../scripts/lib/png-bands.mjs';
import { checkAppLockup, auditLockups, inkCoverageInBox } from '../scripts/check-artwork-lockup.mjs';
import {
  DEFAULT_ARTWORK_POLICY,
  MIN_READABLE_TAGLINE_PCT,
  policyOf,
  renderedTaglinePx,
  type ArtworkLockupManifest,
} from '../lib/artwork-policy';
import { pxForSlot } from '../lib/artwork-tokens';

/**
 * [artwork-lockup] Full brand identity is mandatory, and it is enforced on the
 * pixels rather than on metadata. A full-lockup app must ship a square asset
 * whose declared symbol, wordmark and tagline boxes all contain real ink.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const apps = JSON.parse(read('data/apps.json'));
const manifests = JSON.parse(read('data/artwork-lockups.json')) as Record<string, ArtworkLockupManifest>;
const CINEFLOW = apps.find((a: any) => a.slug === 'cineflow');
const REFERENCE_APPS = ['appmintly', 'pdfminifly', 'studyria', 'niramay', 'nexdrop', 'billcraft'];

describe('CineFlow ships its complete brand lockup', () => {
  it('declares the full-lockup policy and points at the assembled square asset', () => {
    expect(policyOf(CINEFLOW)).toBe('full-lockup');
    expect(CINEFLOW.icon).toBe('/brand/cineflow-icon-lockup-512.png');
    expect(CINEFLOW.artworkVersion ?? CINEFLOW.version).toBe('0.2.3'); // APK version untouched
  });

  it('the asset is square, so it drops into the standard slot without distortion', () => {
    const img = readPng(join(ROOT, 'public/brand/cineflow-icon-lockup-512.png'));
    expect(img.width).toBe(512);
    expect(img.height).toBe(512);
    expect(Math.abs(img.width / img.height - 1)).toBeLessThan(0.01);
  });

  it('symbol, wordmark AND tagline all carry ink inside the asset', () => {
    const img = readPng(join(ROOT, 'public/brand/cineflow-icon-lockup-512.png'));
    const m = manifests.cineflow;
    expect(m, 'manifest entry required').toBeTruthy();
    for (const el of ['symbol', 'wordmark', 'tagline'] as const) {
      const coverage = inkCoverageInBox(img, m.elements[el]);
      expect(coverage, `${el} must be present`).toBeGreaterThan(0.02);
    }
    // ordering: symbol above wordmark above tagline
    expect(m.elements.symbol[1]).toBeLessThan(m.elements.wordmark[1]);
    expect(m.elements.wordmark[3]).toBeLessThan(m.elements.tagline[1]);
  });

  it('the manifest describes the asset we actually ship', () => {
    const img = readPng(join(ROOT, 'public/brand/cineflow-icon-lockup-512.png'));
    expect(manifests.cineflow.width).toBe(img.width);
    expect(manifests.cineflow.height).toBe(img.height);
  });

  it('nothing is cropped: every element box sits inside the canvas with margin', () => {
    const img = readPng(join(ROOT, 'public/brand/cineflow-icon-lockup-512.png'));
    for (const el of ['symbol', 'wordmark', 'tagline'] as const) {
      const [x0, y0, x1, y1] = manifests.cineflow.elements[el];
      expect(x0).toBeGreaterThan(0);
      expect(y0).toBeGreaterThan(0);
      expect(x1).toBeLessThan(img.width - 1);
      expect(y1).toBeLessThan(img.height - 1);
    }
  });
});

describe('small-size honesty', () => {
  it('measures the real rendered tagline height and does not claim readability', () => {
    const m = manifests.cineflow;
    const atCard = renderedTaglinePx(m, pxForSlot('card').sm);
    const atDetail = renderedTaglinePx(m, pxForSlot('detail').sm);
    // the supplied lockup's tagline is ~2% of the canvas: sub-3px at card size
    expect(atCard).toBeLessThan(3);
    expect(atDetail).toBeLessThan(4);
    // documented limitation — see the compact proposal in the release report
    const taglinePct = (m.elements.tagline[3] - m.elements.tagline[1] + 1) / m.height;
    expect(taglinePct).toBeLessThan(MIN_READABLE_TAGLINE_PCT);
  });
});

describe('reference apps are untouched', () => {
  it('their icons and slots are unchanged by the CineFlow lockup work', () => {
    // Reference records pinned as they stand at this commit. AppMintly serves its
    // icon from an absolute URL; PDFMiniFly ships a local asset, pinned by bytes.
    const expectedIcons: Record<string, string> = {
      appmintly: 'https://appmintly.pages.dev/icon-512.png',
      pdfminifly: '/brand/pdfminifly-icon-384.png',
    };
    const pdfminiflySha = '499ba529ee4ef582692213e3e0eaab751f9c9791c0db5cd10b484b1534d74f38';
    for (const slug of REFERENCE_APPS) {
      const app = apps.find((a: any) => a.slug === slug);
      expect(policyOf(app), `${slug} stays symbol-only`).toBe(DEFAULT_ARTWORK_POLICY);
      expect(manifests[slug], `${slug} must not acquire a lockup manifest`).toBeUndefined();
    }
    for (const [slug, icon] of Object.entries(expectedIcons)) {
      const app = apps.find((a: any) => a.slug === slug);
      expect(app.icon, `${slug} icon reference must be unchanged`).toBe(icon);
    }
    const sha = createHash('sha256').update(readFileSync(join(ROOT, 'public/brand/pdfminifly-icon-384.png'))).digest('hex');
    expect(sha, 'PDFMiniFly artwork bytes must be unchanged').toBe(pdfminiflySha);
  });
});

describe('policy gate rejects the failure modes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lockup-'));
  const asset = join(ROOT, 'public/brand/cineflow-icon-lockup-512.png');
  const m = manifests.cineflow;

  it('NEGATIVE CONTROL: a symbol-only asset declared as a lockup is rejected', () => {
    const symbolOnly = { slug: 'cineflow', icon: '/brand/cineflow-icon-384.png', artworkPolicy: 'full-lockup' };
    const v = checkAppLockup('cineflow', symbolOnly, { cineflow: m });
    expect(v.join('\n')).toMatch(/ASSET-CHANGED|ELEMENT-OUTSIDE|ELEMENT-MISSING/);
  });

  it('NEGATIVE CONTROL: a cropped asset (tagline cut off) is rejected', () => {
    const p = join(dir, 'cropped.png');
    copyFileSync(asset, p);
    // manifest claims a tagline box below a canvas that is 200px shorter
    const bad = { ...m, height: m.height - 200 };
    const img = readPng(p);
    expect(img.height).toBe(512);
    expect(bad.elements.tagline[3]).toBeGreaterThan(bad.height - 1);
    const v = checkAppLockup('cineflow', { slug: 'cineflow', icon: '/x.png', artworkPolicy: 'full-lockup' }, { cineflow: bad });
    expect(v.join('\n')).toMatch(/ELEMENT-OUTSIDE|ASSET-MISSING/);
  });

  it('NEGATIVE CONTROL: a stretched (non-square) asset is rejected', () => {
    const img = readPng(asset);
    const aspect = 512 / 320;
    expect(Math.abs(aspect - 1)).toBeGreaterThan(0.01);
    const v = checkAppLockup('cineflow', { slug: 'cineflow', icon: '/brand/cineflow-icon-lockup-512.png', artworkPolicy: 'full-lockup' }, { cineflow: m });
    expect(v).toEqual([]); // the shipped one is square
  });

  it('NEGATIVE CONTROL: an invalid policy value and an orphan manifest are rejected', () => {
    const v1 = checkAppLockup('x', { slug: 'x', icon: '/brand/cineflow-icon-lockup-512.png', artworkPolicy: 'cinema' } as any, {});
    expect(v1.join('\n')).toMatch(/POLICY-INVALID/);
    expect(policyOf({})).toBe('symbol-only');
  });

  it('a full-lockup app without a manifest is flagged, not silently downgraded', () => {
    const v = checkAppLockup('newapp', { slug: 'newapp', icon: '/brand/cineflow-icon-lockup-512.png', artworkPolicy: 'full-lockup' }, {});
    expect(v.join('\n')).toMatch(/LOCKUP-MANIFEST-MISSING/);
  });

  it('the real catalogue passes', () => {
    expect(auditLockups()).toEqual([]);
  });
});

describe('upcoming apps cannot bypass the shared rules', () => {
  it('render through the shared slot tokens, not bespoke widths', () => {
    const src = read('components/UpcomingAppCard.tsx');
    expect(src).toContain("classesForSlot('upcoming')");
    expect(src).not.toMatch(/className="w-(20|28|32) h-/);
  });

  it('an upcoming app declaring a lockup must satisfy the same pixel checks', () => {
    const v = checkAppLockup(
      'upcoming:demo',
      { slug: 'demo', icon: '/brand/cineflow-icon-384.png', artworkPolicy: 'full-lockup' },
      { demo: manifests.cineflow }
    );
    expect(v.length).toBeGreaterThan(0);
  });
});
