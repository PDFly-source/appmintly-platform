import { describe, expect, it } from 'vitest';
import * as resolver from '../lib/audit/contrast.mjs';

// The resolver is plain ESM so the Node audit script and these tests share the
// exact code under test; its surface is typed here rather than duplicated.
const { parseColor, composite, contrastRatio, gradientLayers, gradientStops, colorAt, resolveSurface } =
  resolver as unknown as Record<string, any>;
const evaluateText = (resolver as unknown as Record<string, any>).evaluateText as (o: any) => any;
const UNRESOLVED = (resolver as unknown as Record<string, any>).UNRESOLVED as string;

/** chain is documented element -> ancestor, the order the page collector emits. */
const chain = (...items: any[]) => items;
const layer = (backgroundColor: string, backgroundImage = 'none', top = 0, height = 800, extra: any = {}) => ({
  backgroundColor,
  backgroundImage,
  top,
  height,
  ...extra,
});

describe('colour parsing', () => {
  it('parses every format the site actually emits', () => {
    expect(parseColor('#0E1526')).toEqual({ r: 14, g: 21, b: 38, a: 1 });
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgb(11, 14, 21)')).toEqual({ r: 11, g: 14, b: 21, a: 1 });
    expect(parseColor('rgba(76, 141, 255, 0.2)')).toEqual({ r: 76, g: 141, b: 255, a: 0.2 });
    expect(parseColor('rgb(11 14 21 / 0.62)')).toEqual({ r: 11, g: 14, b: 21, a: 0.62 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('returns null instead of inventing a colour', () => {
    for (const bad of ['', 'not-a-colour', 'currentcolor', 'rgb(1,2)', 'url(#x)', undefined as any]) {
      expect(parseColor(bad)).toBeNull();
    }
  });
});

describe('gradient parsing', () => {
  it('reads radial gradients with geometry and percentages', () => {
    const [g] = gradientLayers('radial-gradient(520px 340px at 88% 0px, rgba(76, 141, 255, 0.2), rgba(0, 0, 0, 0) 70%)');
    const stops = gradientStops(g);
    expect(stops).toHaveLength(2);
    expect(stops[0].at).toBe(0);
    expect(stops[1].at).toBe(70);
    expect(stops[0].color).toEqual({ r: 76, g: 141, b: 255, a: 0.2 });
  });

  it('reads linear gradients and every layer of a multi-layer background', () => {
    const layers = gradientLayers(
      'radial-gradient(520px 340px at 88% 0px, rgba(76,141,255,0.2), rgba(0,0,0,0) 70%), linear-gradient(to top, #0E1526 0%, rgba(14,21,38,0.6) 50%, transparent 100%)',
    );
    expect(layers.map((l: any) => l.type)).toEqual(['radial-gradient', 'linear-gradient']);
    const stops = gradientStops(layers[1]);
    expect(stops.map((s: any) => s.at)).toEqual([0, 50, 100]);
    expect(stops[2].color.a).toBe(0);
  });

  it('interpolates between declared stops and clamps outside them', () => {
    const [g] = gradientLayers('linear-gradient(90deg, #000000 0%, #FFFFFF 100%)');
    expect(colorAt(g, 0)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(colorAt(g, 1)).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(colorAt(g, 0.5)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(colorAt(g, -5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('spreads unpositioned stops evenly', () => {
    const [g] = gradientLayers('linear-gradient(#000, #888, #fff)');
    expect(gradientStops(g).map((s: any) => s.at)).toEqual([0, 50, 100]);
  });
});

describe('compositing fixtures', () => {
  it('composites a known translucent layer', () => {
    // 62% of rgb(22,27,40) over rgb(11,14,21) = rgb(18,22,33)
    expect(composite(parseColor('rgba(22, 27, 40, 0.62)'), parseColor('rgb(11, 14, 21)'))).toEqual({
      r: 18,
      g: 22,
      b: 33,
      a: 1,
    });
  });

  it('glass over the dark 3D stage resolves to the documented composite', () => {
    const surface = resolveSurface(
      chain(
        layer('rgba(22, 27, 40, 0.62)', 'none', 150, 200),
        layer('rgb(11, 14, 21)', 'radial-gradient(520px 340px at 88% 0px, rgba(76, 141, 255, 0.2), rgba(0, 0, 0, 0) 70%)', 100, 400),
        layer('rgba(0, 0, 0, 0)', 'none'),
      ),
      250,
    );
    expect(surface.status).toBe('resolved');
    // 62% of rgb(22,27,40) over the #0B0E15 stage
    expect(surface.color).toEqual({ r: 18, g: 22, b: 33, a: 1 });
    expect(contrastRatio(parseColor('#EEF2FA'), surface.color)).toBeGreaterThanOrEqual(15);
    // and the regression that shipped: light-theme ink text on that glass
    expect(contrastRatio(parseColor('#0E1526'), surface.color)).toBeLessThan(1.5);
  });

  it('the same glass over a light page resolves light, not dark', () => {
    const surface = resolveSurface(
      chain(layer('rgba(22, 27, 40, 0.62)', 'none', 0, 200), layer('rgb(255, 255, 255)', 'none')),
      100,
    );
    expect(surface.color).toEqual({ r: 111, g: 114, b: 122, a: 1 });
  });

  it('a bottom-anchored scrim is opaque where the label sits', () => {
    const surface = resolveSurface(
      chain(
        layer('rgba(0, 0, 0, 0)', 'linear-gradient(to top, #0E1526 0%, rgba(14,21,38,0.6) 50%, transparent 100%)', 0, 400),
        layer('rgb(246, 248, 251)', 'none'),
      ),
      390,
    );
    expect(surface.status).toBe('resolved');
    expect(contrastRatio(parseColor('#FFFFFF'), surface.color)).toBeGreaterThanOrEqual(15);
  });

  it('nested transparent surfaces fall through to the first opaque ancestor', () => {
    const surface = resolveSurface(
      chain(layer('rgba(0, 0, 0, 0)'), layer('transparent'), layer('rgb(11, 15, 22)', 'none')),
      10,
    );
    expect(surface).toEqual({ status: 'resolved', color: { r: 11, g: 15, b: 22, a: 1 }, reason: null });
  });

  it('reports UNRESOLVED rather than substituting white or body colour', () => {
    expect(resolveSurface(chain(layer('rgba(0,0,0,0.2)'), layer('transparent')), 10).status).toBe('unresolved');
    expect(resolveSurface(chain(layer('transparent', 'url("/hero.jpg")')), 10).status).toBe('unresolved');
    expect(resolveSurface([], 10).status).toBe('unresolved');
    expect(resolveSurface(chain(layer('nonsense-value')), 10).status).toBe('unresolved');
  });
});

describe('verdicts', () => {
  it('never counts an unresolved surface as a pass', () => {
    const verdict = evaluateText({ color: 'rgb(255,255,255)', fontSize: 14, fontWeight: 400, surface: { status: 'unresolved', reason: 'no opaque background found' } });
    expect(verdict.status).toBe(UNRESOLVED);
    expect(verdict.ratio).toBeNull();
  });

  it('applies 4.5:1 to normal text and 3:1 to large text', () => {
    const surface = { status: 'resolved', color: { r: 11, g: 14, b: 21, a: 1 }, reason: null };
    expect(evaluateText({ color: 'rgb(90,96,110)', fontSize: 14, fontWeight: 400, surface }).status).toBe('FAIL');
    expect(evaluateText({ color: 'rgb(255,255,255)', fontSize: 24, fontWeight: 400, surface }).required).toBe(3);
    expect(evaluateText({ color: 'rgb(255,255,255)', fontSize: 14, fontWeight: 400, surface }).status).toBe('PASS');
  });

  it('measures gradient-clipped text stop by stop', () => {
    const surface = { status: 'resolved', color: { r: 11, g: 14, b: 21, a: 1 }, reason: null };
    const ok = evaluateText({
      color: 'rgba(0, 0, 0, 0)',
      fontSize: 32,
      fontWeight: 800,
      surface,
      gradientTextStops: [parseColor('#4C8DFF'), parseColor('#7DD3FC')],
    });
    expect(ok.status).toBe('PASS');
    const bad = evaluateText({
      color: 'rgba(0, 0, 0, 0)',
      fontSize: 32,
      fontWeight: 800,
      surface,
      gradientTextStops: [parseColor('#101418'), parseColor('#1A2230')],
    });
    expect(bad.status).toBe('FAIL');
  });

  it('composites translucent foreground text before measuring', () => {
    const surface = { status: 'resolved', color: { r: 11, g: 15, b: 22, a: 1 }, reason: null };
    const solid = evaluateText({ color: 'rgb(255,255,255)', fontSize: 14, fontWeight: 400, surface });
    const muted = evaluateText({ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 400, surface });
    expect(solid.ratio).toBeGreaterThan(muted.ratio!);
  });
});
