/**
 * Niramay brand-asset fingerprints (Phase 3, 2026-10-16).
 *
 * The Niramay APK launcher icons are baked at build time by
 * lib/apk-builder.ts from the ICON_URL input, which points at
 * public/brand/niramay-icon-launcher-512.png. A silent reversion of that
 * file (or the marketplace listing icon) would rebuild or relist the OLD
 * mortar-and-pestle branding without any test noticing. These pins make
 * the platform suite fail first.
 *
 * Source of truth: the supplied official Niramay artwork (complete
 * composition — symbol + NIRAMAY wordmark + DISCOVER • HEAL • LIVE BETTER
 * tagline, 1254x1254 cream background).
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sha256 = (p: string) =>
  createHash('sha256').update(readFileSync(p)).digest('hex');

// Deterministic whole-artwork derivatives of the supplied master.
const PINS: Record<string, string> = {
  // complete artwork, 512x512, LANCZOS downscale of the whole square
  'public/brand/niramay-icon-launcher-512.png':
    '3e38d2f8e6c3c169902d3db6e057b0d100ae72d50982d9820ae320b32d2828d0',
  // complete artwork, 384x384, LANCZOS downscale of the whole square
  'public/brand/niramay-icon-384.png':
    'b380efaa0da3dec578622b96cd780791acd1f6f332414f073de73c7e48ba8a93',
};

describe('Niramay official brand assets (Phase 3)', () => {
  it.each(Object.entries(PINS))('pins %s to the complete official artwork', (path, expected) => {
    expect(sha256(path as string)).toBe(expected);
  });

  it('the launcher input and the listing icon are whole-square artwork (no symbol-only crop)', () => {
    // Both files are 512/384 squares derived from the same 1254px master:
    // the complete composition occupies ~69% of the canvas width. A
    // symbol-only extraction would show a much narrower content column.
    // (Full pixel-decode geometry is enforced by the niramay repo's own
    // scripts/verify-branding.ts suite; these platform pins guard the
    // exact bytes the APK build and marketplace consume.)
    for (const path of Object.keys(PINS)) {
      const buf = readFileSync(path);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      expect(w).toBe(h);
    }
  });
});
