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

describe('CineFlow — standard card sizing (the shared design rule)', () => {
  const card = readFileSync(join(REPO, 'components/AppCard.tsx'), 'utf8');
  const artworkSrc = readFileSync(join(REPO, 'components/AppArtwork.tsx'), 'utf8');
  const iconSrc = readFileSync(join(REPO, 'components/AppIcon.tsx'), 'utf8');

  /** pull `name: 'classes'` pairs out of a sizeClasses map */
  const sizeMap = (src: string) => {
    const block = src.slice(src.indexOf('sizeClasses'), src.indexOf('};', src.indexOf('sizeClasses')));
    return Object.fromEntries(
      [...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
    );
  };

  it('the card artwork slot is dimensioned identically to the standard app icon', () => {
    // AppIcon's classes also carry lettermark type sizes; the box geometry is
    // what must match, so compare the width/height tokens only.
    const geometry = (cls: string) => cls.split(/\s+/).filter((t) => /^[wh]-|^sm:/.test(t)).join(' ');
    const appIcon = sizeMap(iconSrc);
    const cardArtwork = sizeMap(artworkSrc);
    for (const size of Object.keys(cardArtwork)) {
      if (!appIcon[size]) continue;
      expect(geometry(cardArtwork[size]), `${size} must match AppIcon exactly`).toBe(geometry(appIcon[size]));
    }
    // the slot sizes the marketplace actually uses must all be present
    for (const size of ['sm', 'lg', 'xl']) expect(cardArtwork[size]).toBeTruthy();
    // the tokens that make up the standard slot, not a bespoke container
    expect(artworkSrc).toContain('shrink-0 overflow-hidden shadow-2xs border border-ink/10 bg-card');
    expect(artworkSrc).toContain('rounded-2xl');
  });

  it('a lockup is contained inside that square, never promoted to a banner', () => {
    expect(artworkSrc).toContain('object-contain');
    expect(artworkSrc).not.toContain('object-cover');
    // the banner layout that made CineFlow oversized is gone
    expect(artworkSrc).not.toContain("'banner'");
    // the standard-card path is a fixed square slot: no aspect box, no
    // full-width promotion. Only the detail hero may set its own ratio.
    const standardPath = artworkSrc.slice(artworkSrc.indexOf('// Standard square slot'));
    expect(standardPath).not.toContain('aspectRatio');
    expect(standardPath).not.toContain('w-full');
    const heroPath = artworkSrc.slice(artworkSrc.indexOf("layout === 'hero'"), artworkSrc.indexOf('// Standard square slot'));
    expect(heroPath).toContain('aspectRatio');
  });

  it('every standard card slot routes through the shared component at its original size', () => {
    for (const size of ['sm', 'lg', 'xl']) {
      expect(card).toContain(`<AppArtwork app={app} size="${size}"`);
    }
    // the previous per-app oversized layout used an isLockup branch in the card
    expect(card).not.toContain('isLockup');
  });

  it('the featured hero uses the standard xl slot, not a promotional banner', () => {
    const hero = readFileSync(join(REPO, 'components/FeaturedHeroCarousel.tsx'), 'utf8');
    expect(hero).toContain('<AppArtwork');
    expect(hero).toContain('size="xl"');
    expect(hero).not.toContain('max-w-[300px]');
  });

  it('the dedicated detail hero keeps its larger presentation', () => {
    const detail = readFileSync(join(REPO, 'app/app/[slug]/AppDetailClient.tsx'), 'utf8');
    expect(detail).toContain('layout="hero"');
  });

  it('the shared rule covers every app, not just CineFlow', () => {
    // any app can supply artwork; none can supply a different slot size
    expect(artworkSrc).toContain('resolveBrandArtwork(app)');
    expect(card).not.toMatch(/cineflow/i);
  });
});

describe('CineFlow — unrelated artwork untouched', () => {
  it('category taxonomy is unchanged by the brand rollout', () => {
    const categories = readFileSync(join(REPO, 'data/categories.json'), 'utf8');
    expect(categories).toContain('Entertainment');
    expect(categories).not.toContain('cineflow-lockup');
  });

  it('other apps keep their own brand assets in the catalogue', () => {
    const pdfly = apps.find((a) => a.slug === 'pdfminifly')!;
    expect(pdfly.icon).toMatch(/pdfminifly/);
    expect(pdfly.brandLockup).toBeUndefined();
  });
});
