/**
 * CineFlow full brand lockup — marketplace listing regression pins.
 *
 * Owner correction (2026-11-03): the marketplace detail page showed the
 * symbol-only mark, so the listing represented CineFlow by a lone icon. The
 * requirement is the complete brand identity — film-strip C with play mark,
 * the "Cineflow" wordmark, and the "PRIVATE · CINEMA · CONTROL" tagline —
 * visible together on the store detail hero.
 *
 * The shipped artwork is composed from the supplied master file's own raster
 * (no re-typesetting, no recolouring): the symbol + wordmark keep their native
 * relationship, and the tagline is scaled up and wrapped to two lines. It has
 * to be wrapped: as a single line the tagline is 33.8:1, so at the ~264-334px
 * a phone hero allows it would render around 6-7px and be unreadable. Wrapped,
 * it renders at 11.8-15px inside that same space.
 *
 * These pins fail if the asset is re-cropped, resized, replaced by the
 * mark-only tile, or if the detail page stops containing it.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalog from '../data/apps.json';

const ASSET = 'public/brand/cineflow-lockup.webp';
const SHA256 = '528a01d101a6e03b43ec4450025637f6261ebad954648fdc7a3f35aa20277301';

/** Canvas size baked into the asset, mirrored by the <img> width/height. */
const LOCKUP_W = 1115;
const LOCKUP_H = 1105;

/** Read width/height straight out of the WebP bitstream (lossy VP8 chunk). */
function webpSize(buf: Buffer): { width: number; height: number } {
  const chunk = buf.indexOf(Buffer.from('VP8 '));
  if (chunk < 0) throw new Error('not a lossy VP8 webp');
  const p = chunk + 8;
  const startCode = buf.subarray(p + 3, p + 6);
  if (startCode[0] !== 0x9d || startCode[1] !== 0x01 || startCode[2] !== 0x2a) {
    throw new Error('bad VP8 start code');
  }
  const width = (buf[p + 6] | (buf[p + 7] << 8)) & 0x3fff;
  const height = (buf[p + 8] | (buf[p + 9] << 8)) & 0x3fff;
  return { width, height };
}

describe('CineFlow marketplace full brand lockup', () => {
  it('ships the composed lockup asset', () => {
    expect(existsSync(ASSET)).toBe(true);
    const bytes = readFileSync(ASSET);
    // A mark-only tile is ~10-20KB; the composed lockup carries the wordmark
    // and both tagline lines, so it is several times heavier.
    expect(bytes.length).toBeGreaterThan(40_000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHA256);
  });

  it('keeps the lockup aspect ratio the detail page declares', () => {
    const { width, height } = webpSize(readFileSync(ASSET));
    expect(width).toBe(LOCKUP_W);
    expect(height).toBe(LOCKUP_H);
    // Near-square composition: symbol above the wordmark, tagline beneath.
    expect(width / height).toBeCloseTo(1.009, 2);
  });

  it('is declared only by CineFlow and resolves to a real file', () => {
    const declared = (catalog as Array<{ slug: string; brandLockup?: string }>).filter(
      (a) => typeof a.brandLockup === 'string' && a.brandLockup.length > 0,
    );
    expect(declared.map((a) => a.slug)).toEqual(['cineflow']);
    for (const app of declared) {
      const path = String(app.brandLockup).replace(/^\//, 'public/');
      expect(existsSync(path), `${app.slug} lockup missing at ${path}`).toBe(true);
    }
  });

  it('renders the lockup contained, never cropped, at its own ratio', () => {
    const src = readFileSync('app/app/[slug]/AppDetailClient.tsx', 'utf8');
    const start = src.indexOf('app.brandLockup ?');
    // Only the lockup branch; the fallback branch below it still uses AppIcon.
    const block = src.slice(start, src.indexOf(') : (', start));
    expect(block).toContain('object-contain');
    expect(block).not.toContain('object-cover');
    expect(block).toContain(`width={${LOCKUP_W}}`);
    expect(block).toContain(`height={${LOCKUP_H}}`);
    // The tagline must reach assistive tech too, not just the pixels.
    expect(block).toContain('PRIVATE · CINEMA · CONTROL');
    // A lockup must not be funnelled through the small square icon renderer.
    expect(block).not.toContain('<AppIcon');
  });

  it('keeps the square symbol icon for small slots', () => {
    // Cards, lists and the launcher still need the square mark; the lockup is
    // additive, not a replacement of that asset.
    const app = (catalog as Array<{ slug: string; icon: string }>).find((a) => a.slug === 'cineflow');
    expect(app?.icon).toBe('/brand/cineflow-icon-384.png');
    expect(existsSync('public/brand/cineflow-icon-384.png')).toBe(true);
  });
});
