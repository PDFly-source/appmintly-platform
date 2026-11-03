import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBrandArtwork, CINEFLOW_BRAND } from '../lib/brand-artwork';

/**
 * [brand-rollout] CineFlow must present the FULL brand lockup — film-strip
 * C/play symbol, "Cineflow" wordmark and the "PRIVATE · CINEMA · CONTROL"
 * tagline — on every public marketplace surface, never the symbol-only
 * launcher icon, and never cropped.
 *
 * These assertions guard the failure mode this task exists to fix: one card
 * quietly rendering `app.icon` (a square mark) while the detail page showed
 * the lockup.
 */

const REPO = join(process.cwd());
const apps = JSON.parse(readFileSync(join(REPO, 'data', 'apps.json'), 'utf8')) as any[];
const cineflow = apps.find((a) => a.slug === 'cineflow')!;
const assetPath = `public${cineflow.brandLockup}`;

/** WebP intrinsic size from the VP8X / VP8 / VP8L header. */
function webpSize(buf: Buffer): { width: number; height: number } {
  const riff = buf.toString('ascii', 0, 4);
  const webp = buf.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || webp !== 'WEBP') throw new Error('not a WebP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  // VP8 (lossy)
  const start = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  return { width: buf.readUInt16LE(start + 3) & 0x3fff, height: buf.readUInt16LE(start + 5) & 0x3fff };
}

describe('CineFlow — canonical full-lockup asset', () => {
  it('exists at the single canonical path with real, separately-measured canvas', () => {
    expect(existsSync(join(REPO, assetPath))).toBe(true);
    const size = webpSize(readFileSync(join(REPO, assetPath)));
    expect(size.width).toBe(cineflow.brandLockupWidth);
    expect(size.height).toBe(cineflow.brandLockupHeight);
    expect(size).toEqual({ width: 944, height: 950 });
    expect(statSync(join(REPO, assetPath)).size).toBeGreaterThan(40_000);
  });

  it('replaces the old square-ish composition rather than sitting beside it', () => {
    const stale = ['public/brand/cineflow-lockup.webp'];
    for (const path of stale) expect(existsSync(join(REPO, path)), `${path} should be gone`).toBe(false);
    expect(CINEFLOW_BRAND.lockup.path).toBe(cineflow.brandLockup);
  });

  it('carries the tagline as part of the brand identity', () => {
    expect(cineflow.brandTagline).toBe('PRIVATE · CINEMA · CONTROL');
    expect(CINEFLOW_BRAND.wordmark).toBe('Cineflow');
  });
});

describe('CineFlow — artwork resolution', () => {
  it('resolves CineFlow to the lockup, never the launcher icon', () => {
    const art = resolveBrandArtwork(cineflow);
    expect(art.isLockup).toBe(true);
    expect(art.src).toBe('/brand/cineflow-lockup-v2.webp');
    expect(art.src).not.toBe(cineflow.icon);
    expect(art.aspect).toBeCloseTo(944 / 950, 5);
  });

  it('names the tagline in the accessible name, so it is not invisible to AT', () => {
    const art = resolveBrandArtwork(cineflow);
    expect(art.alt).toContain('CineFlow');
    expect(art.alt).toContain('PRIVATE · CINEMA · CONTROL');
  });

  it('leaves every other app on its own icon', () => {
    const others = apps.filter((a) => a.slug !== 'cineflow');
    expect(others.length).toBeGreaterThanOrEqual(7);
    for (const app of others) {
      const art = resolveBrandArtwork(app);
      expect(art.isLockup, `${app.slug} must not inherit CineFlow branding`).toBe(false);
      expect(art.src).toBe(app.icon);
    }
    expect(cineflow.brandLockup).toBe('/brand/cineflow-lockup-v2.webp');
  });
});

describe('CineFlow — every brand surface renders the lockup', () => {
  const surfaces = [
    ['components/AppCard.tsx', 'grid, list and compact cards (home rails, explore, search, category, collections, recommendations)'],
    ['components/FeaturedHeroCarousel.tsx', 'home featured app'],
    ['app/app/[slug]/AppDetailClient.tsx', 'app detail hero'],
    ['components/LibraryClient.tsx', 'library'],
  ] as const;

  for (const [file, label] of surfaces) {
    it(`${label} resolves brand artwork instead of hardcoding app.icon`, () => {
      const src = readFileSync(join(REPO, file), 'utf8');
      const usesArtwork = src.includes('AppArtwork') || src.includes('resolveBrandArtwork');
      expect(usesArtwork, `${file} must route artwork through the shared resolver`).toBe(true);
      // A surface that renders <AppIcon src={app.icon}> unconditionally would
      // silently regress CineFlow to the square mark.
      const branched = src.includes('isLockup') || src.includes('brandLockup');
      const unconditionalIcon = /<AppIcon\s+src=\{app\.icon\}[^>]*\/>/.test(src) && !branched;
      expect(unconditionalIcon).toBe(false);
    });
  }

  it('the shared artwork component contains the lockup and never crops it', () => {
    const src = readFileSync(join(REPO, 'components/AppArtwork.tsx'), 'utf8');
    expect(src).toContain('object-contain');
    expect(src).not.toContain('object-cover');
    expect(src).toContain('aspectRatio');
    expect(src).not.toContain('overflow-hidden');
    expect(src).toContain('w-full');
  });
});

describe('CineFlow — unrelated artwork untouched', () => {
  it('category taxonomy is unchanged by the brand rollout', () => {
    const categories = readFileSync(join(REPO, 'data/categories.json'), 'utf8');
    expect(categories).toContain('Entertainment');
    // Generic category icons are declared here, not derived from app artwork.
    expect(categories).not.toContain('cineflow-lockup');
  });

  it('other apps keep their own brand assets in the catalogue', () => {
    const pdfly = apps.find((a) => a.slug === 'pdfminifly')!;
    expect(pdfly.icon).toMatch(/pdfminifly/);
    expect(pdfly.brandLockup).toBeUndefined();
  });
});
