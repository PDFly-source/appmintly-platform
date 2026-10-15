/**
 * Regression tests for the adaptive-icon safe-zone content fit
 * (PDFMiniFly launcher-icon fix).
 *
 * Root cause being locked down: the builder fitted trimmed artwork to a
 * blanket 60% of the adaptive canvas. The PDFMiniFly official artwork
 * (icon + wordmark + tagline stacked vertically) has a wide, shallow
 * bounding box; at 60% its corners fall outside the 66/108 safe circle,
 * so circular launcher masks clip the wordmark and the
 * 'PRIVATE • POWERFUL • LOCAL' tagline.
 */
import { describe, it, expect } from 'vitest';
import { adaptiveContentFitSize } from '../lib/apk-builder';

const CANVAS = 432; // mipmap-xxxhdpi adaptive foreground canvas (108dp @ 4x)

describe('adaptiveContentFitSize (launcher safe-zone fit)', () => {
  it('sizes the PDFMiniFly artwork so its full bounding box fits the 66/108 safe circle', () => {
    // Trimmed content of the official PDFMiniFly icon (verified from the
    // deployed asset: bbox 236x248 after ImageMagick -trim -fuzz 12%).
    const [tw, th] = [236, 248];
    const fit = adaptiveContentFitSize(CANVAS, tw, th);
    const scale = fit / Math.max(tw, th);
    const boxW = tw * scale;
    const boxH = th * scale;
    const corner = Math.hypot(boxW / 2, boxH / 2);
    const safeRadius = (CANVAS * 66) / 108 / 2;
    // The complete artwork - wordmark AND tagline - must sit inside the
    // mask's safe circle: the corner of the content box is its farthest
    // point from the canvas center.
    expect(corner).toBeLessThanOrEqual(safeRadius + 0.5);
    // Nothing oversized: the fit fills the safe circle as far as it can.
    expect(corner).toBeGreaterThan(safeRadius - 1.5);
  });

  it('the old blanket 60% fit would clip the PDFMiniFly tagline (guards against regression)', () => {
    const [tw, th] = [236, 248];
    const oldFit = Math.round(CANVAS * 0.6);
    const scale = oldFit / Math.max(tw, th);
    const boxH = th * scale;
    // The tagline band sits near the bottom of the content box. The circle
    // at that depth covers far less horizontal extent than the tagline
    // needs - quantified proof that 60% was insufficient.
    const safeRadius = (CANVAS * 66) / 108 / 2;
    const taglineY = boxH / 2 - boxH * 0.06; // tagline depth from center
    const coveredHalfWidth = Math.sqrt(Math.max(0, safeRadius ** 2 - taglineY ** 2));
    const neededHalfWidth = (tw * scale) / 2;
    expect(neededHalfWidth).toBeGreaterThan(coveredHalfWidth);
  });

  it('square content is also safe (no corner clipping for any artwork)', () => {
    const fit = adaptiveContentFitSize(432, 300, 300);
    const corner = Math.hypot(fit / 2, fit / 2);
    const safeRadius = (432 * 66) / 108 / 2;
    expect(corner).toBeLessThanOrEqual(safeRadius + 0.5);
  });

  it('degrades safely for degenerate inputs', () => {
    expect(adaptiveContentFitSize(432, 0, 0)).toBe(Math.round(432 * 0.6));
    expect(adaptiveContentFitSize(-5, 10, 10)).toBeGreaterThan(0);
  });

  it('scales proportionally across densities (within integer rounding)', () => {
    const r108 = adaptiveContentFitSize(108, 236, 248);
    const r162 = adaptiveContentFitSize(162, 236, 248);
    const r432 = adaptiveContentFitSize(432, 236, 248);
    // Integer rounding at small densities allows ~2% drift from the exact
    // 1x : 1.5x : 4x ratios; the fit must stay within that envelope.
    expect(r432 / r108).toBeGreaterThan(3.9);
    expect(r432 / r108).toBeLessThan(4.1);
    expect(r162 / r108).toBeGreaterThan(1.4);
    expect(r162 / r108).toBeLessThan(1.6);
  });
});
