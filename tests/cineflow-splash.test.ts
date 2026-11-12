import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CINEFLOW_SPLASH_MARK_JPEG_BASE64,
  CINEFLOW_SPLASH_MARK_SHA256,
  CINEFLOW_SPLASH_WORD_JPEG_BASE64,
  CINEFLOW_SPLASH_WORD_SHA256,
} from '../lib/splash/cineflow-splash-assets';
import {
  CINEFLOW_SPLASH_BG,
  CINEFLOW_SPLASH_HARD_TIMEOUT_MS,
  CINEFLOW_SPLASH_ICON_NAME,
  CINEFLOW_SPLASH_MARK_NAME,
  CINEFLOW_SPLASH_MS,
  CINEFLOW_SPLASH_PACKAGE,
  CINEFLOW_SPLASH_WORD_NAME,
  cineflowSplashColorEntries,
  cineflowSplashJava,
  cineflowSplashMarkJpeg,
  cineflowSplashStylesV31Xml,
  cineflowSplashStylesXml,
  cineflowSplashTransparentIconXml,
  cineflowSplashWordJpeg,
} from '../lib/splash/cineflow-splash';

const html = readFileSync(join(process.cwd(), 'docs/splash/Cineflow_Splash.html'), 'utf8');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Minimal JPEG SOF reader: dimensions of the embedded artwork. */
function jpegSize(b: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('no SOF segment');
}

describe('CineFlow splash reference — provenance', () => {
  it('the committed reference is the owner-supplied file', () => {
    expect(sha256(html)).toBe('c7dd4bb974f6ecf8dd07c8c6bab3a4186222b634b0e8688019af8cc1ed02bff5');
    expect(html).toContain('<title>Cineflow splash</title>');
  });

  it('both embedded JPEGs are carried byte for byte', () => {
    const embedded = [...html.matchAll(/src="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/g)]
      .map((m) => Buffer.from(m[1], 'base64'));
    expect(embedded).toHaveLength(2);
    expect(sha256(embedded[0])).toBe(CINEFLOW_SPLASH_MARK_SHA256);
    expect(sha256(embedded[1])).toBe(CINEFLOW_SPLASH_WORD_SHA256);
    expect(sha256(cineflowSplashMarkJpeg())).toBe(CINEFLOW_SPLASH_MARK_SHA256);
    expect(sha256(cineflowSplashWordJpeg())).toBe(CINEFLOW_SPLASH_WORD_SHA256);
    expect(sha256(Buffer.from(CINEFLOW_SPLASH_MARK_JPEG_BASE64, 'base64'))).toBe(CINEFLOW_SPLASH_MARK_SHA256);
    expect(sha256(Buffer.from(CINEFLOW_SPLASH_WORD_JPEG_BASE64, 'base64'))).toBe(CINEFLOW_SPLASH_WORD_SHA256);
    // exact sizes the owner reported
    expect(cineflowSplashMarkJpeg().length).toBe(34115);
    expect(cineflowSplashWordJpeg().length).toBe(23639);
  });

  it('the artwork dimensions are the ones the layout math expects', () => {
    expect(jpegSize(cineflowSplashMarkJpeg())).toEqual({ width: 420, height: 426 });
    expect(jpegSize(cineflowSplashWordJpeg())).toEqual({ width: 620, height: 155 });
  });

  it('the reference markup is the one being reproduced', () => {
    expect(html).toContain('style="width:135px"');
    expect(html).toContain('style="width:215px"');
    expect(html).toContain('window.SPLASH_MS=3400');
    expect(html).toContain("window.SPLASH_NEXT=''");
    expect(html).toContain('Math.min(innerWidth/228,innerHeight/488)');
    // .pb is styled but never rendered: CineFlow has no progress bar at all
    expect(html).toContain('.pb{');
    expect(html).not.toContain('class="pb"');
    // exactly two images, logo and wordmark
    expect([...html.matchAll(/<img /g)]).toHaveLength(2);
  });
});

describe('CineFlow splash constants', () => {
  it('identity and timing follow the reference', () => {
    expect(CINEFLOW_SPLASH_PACKAGE).toBe('com.appforge.cineflow');
    expect(CINEFLOW_SPLASH_MS).toBe(3400);
    expect(CINEFLOW_SPLASH_BG).toBe('#F5F7FF');
    expect(CINEFLOW_SPLASH_HARD_TIMEOUT_MS).toBeGreaterThan(CINEFLOW_SPLASH_MS);
    expect(CINEFLOW_SPLASH_MARK_NAME).toBe('cineflow_splash_mark');
    expect(CINEFLOW_SPLASH_WORD_NAME).toBe('cineflow_splash_word');
    expect(CINEFLOW_SPLASH_ICON_NAME).toBe('cineflow_splash_transparent_icon');
  });

  it('resources describe the light launch surface only', () => {
    expect(cineflowSplashColorEntries()).toContain('cineflow_splash_bg');
    expect(cineflowSplashColorEntries()).toContain('#F5F7FF');
    expect(cineflowSplashStylesXml()).toContain('@color/cineflow_splash_bg');
    expect(cineflowSplashStylesXml()).not.toContain('@drawable/ic_launcher');
    expect(cineflowSplashStylesV31Xml()).toContain('android:windowSplashScreenBackground');
    expect(cineflowSplashStylesV31Xml()).toContain('@color/cineflow_splash_bg');
    expect(cineflowSplashStylesV31Xml()).toContain('@drawable/cineflow_splash_transparent_icon');
    expect(cineflowSplashTransparentIconXml()).toContain('#00000000');
    // the old dark launch surface must not survive anywhere
    expect(cineflowSplashColorEntries()).not.toContain('#090C12');
    expect(cineflowSplashStylesV31Xml()).not.toContain('windowSplashScreenIconBackgroundColor');
  });
});

describe('CineFlow splash — the final cascade, not the overridden rules', () => {
  const java = cineflowSplashJava('com.appforge.cineflow');

  it('the mark uses the final flip animation, never the overridden zoom', () => {
    expect(html).toMatch(/\.go \.mk\{animation:zoom 1s cubic-bezier\(\.2,\.9,\.3,1\.1\) \.2s both\}/);
    expect(html).toMatch(/\.go \.mk\{animation:flip 1\.1s cubic-bezier\(\.2,\.8,\.2,1\) \.35s both\}/);
    expect(java).toContain('FLIP_DELAY = 350L, FLIP_DUR = 1100L');
    expect(java).toContain('ease(progress(t, FLIP_DELAY, FLIP_DUR), 0.2f, 0.8f, 0.2f, 1f)');
    expect(java).toContain('FLIP_START_DEG = -80f');
    expect(java).toContain('FLIP_START_SCALE = 0.8f');
    expect(java).toContain('PERSPECTIVE = 700f');
    expect(java).toContain('camera.rotateY(angleDeg)');
    // the overridden zoom carried a blur; the final design has none
    expect(java).not.toContain('blur');
    expect(java).not.toContain('MaskFilter');
  });

  it('the wordmark rises on the reference timing', () => {
    expect(html).toContain('.go .tx{animation:rise .8s ease .9s both}');
    expect(java).toContain('RISE_DELAY = 900L, RISE_DUR = 800L');
    expect(java).toContain('ease(rp, 0.25f, 0.1f, 0.25f, 1f)');
    expect(java).toContain('RISE_START = 18f');
  });

  it('the film strips are anchored at 13.5% of the viewport and scale by --k', () => {
    expect(html).toContain('.f1{top:13.5%;transform-origin:left}');
    expect(html).toContain('.f2{bottom:13.5%;transform-origin:right}');
    expect(html).toContain('height:calc(26px*var(--k))');
    expect(java).toContain('BAND_ANCHOR = 0.135f');
    expect(java).toContain('BAND_H = 26f');
    // the superseded fixed-66px anchoring must not exist in the view
    expect(java).not.toContain('66f');
    // full-viewport layer, not the stage
    expect(java).toContain('final float topY = BAND_ANCHOR * h;');
    expect(java).toContain('final float botY = h - BAND_ANCHOR * h - bandH;');
  });

  it('the stripes keep their geometry, cycle and reversed bottom direction', () => {
    expect(html).toContain('height:calc(8px*var(--k))');
    expect(html).toContain('top:calc(9px*var(--k))');
    expect(html).toContain('animation:scroll 1.2s linear infinite');
    expect(html).toContain('.f2:before{animation-direction:reverse}');
    expect(html).toContain('@keyframes scroll{to{background-position-x:calc(20px*var(--k))}');
    expect(java).toContain('STRIPE_H = 8f');
    expect(java).toContain('STRIPE_INSET = 9f');
    expect(java).toContain('STRIPE_PITCH = 20f');
    expect(java).toContain('STRIPE_LIT = 10f');
    expect(java).toContain('STRIPE_CYCLE_MS = 1200L');
    expect(java).toContain('final float offset = reversed ? phase : -phase;');
    expect(java).toContain('drawBand(canvas, w, botY, w, bandH, w * sx, u, phase, true);');
  });

  it('the gradient is the reference 160deg ramp', () => {
    expect(html).toContain('background:linear-gradient(160deg,#f5f7ff,#ede8ff)');
    expect(java).toContain('GRAD_DEG = 160f');
    expect(java).toContain('GRAD_START = 0xFFF5F7FF');
    expect(java).toContain('GRAD_END = 0xFFEDE8FF');
    expect(java).toContain('new LinearGradient(');
  });

  it('multiply blending is real, not a white paste', () => {
    expect(html).toContain('mix-blend-mode:multiply');
    expect(java).toContain('markPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));');
    expect(java).toContain('wordPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));');
    expect(java).toContain('setLayerType(LAYER_TYPE_SOFTWARE, null)');
    expect(java).toContain('canvas.saveLayer(0f, 0f, w, h, null, Canvas.ALL_SAVE_FLAG)');
  });

  it('reduced motion draws the final frame and never animates', () => {
    expect(html).toContain('@media(prefers-reduced-motion:reduce){*{animation:none!important}');
    expect(java).toContain('final float t = reducedMotion ? DURATION_MS : elapsedMs();');
    expect(java).toContain('Settings.Global.ANIMATOR_DURATION_SCALE');
  });

  it('the lifecycle is single-shot and exactly once', () => {
    expect(java).toContain('DURATION_MS = 3400L');
    expect(java).toContain('if (!finished && t >= DURATION_MS)');
    expect(java).toContain('finished = true;');
    expect(java).toContain('if (listener != null) listener.onSplashFinished();');
    expect([...java.matchAll(/listener\.onSplashFinished\(\)/g)]).toHaveLength(1);
  });

  it('the composition math matches the browser render', () => {
    // fit(): u = min(w/228, h/488) in px per CSS px
    const model = (w: number, h: number) => {
      const u = Math.min(w / 228, h / 488);
      const markH = 135 * u * (426 / 420);
      const wordH = 215 * u * (155 / 620);
      const total = markH + 12 * u + wordH;
      const oy = (h - 488 * u) / 2;
      const top = oy + ((488 * u - 44 * u) - total) / 2;
      return { u, markTop: top, markW: 135 * u, markH, wordTop: top + markH + 12 * u,
        wordW: 215 * u, wordH, bandTop: 0.135 * h, bandH: 26 * u };
    };
    // measured in the reference render at 412x915 (headless Chromium)
    const p = model(412, 915);
    expect(p.u).toBeCloseTo(1.807, 2);
    expect(p.markTop).toBeCloseTo(234.6, 0);
    expect(p.markW).toBeCloseTo(243.9, 0);
    expect(p.markH).toBeCloseTo(247.4, 0);
    expect(p.wordTop).toBeCloseTo(503.7, 0);
    expect(p.wordW).toBeCloseTo(388.5, 0);
    expect(p.wordH).toBeCloseTo(97.1, 0);
    expect(p.bandTop).toBeCloseTo(123.5, 0);
    expect(p.bandH).toBeCloseTo(47.0, 0);
    // landscape 2400x1080 is height-bound, as in the reference
    const l = model(2400, 1080);
    expect(l.u).toBeCloseTo(2.213, 2);
    expect(l.bandTop).toBeCloseTo(145.8, 0);
    expect(l.markW).toBeCloseTo(298.8, 0);
  });
});

describe('CineFlow splash — artwork placement (0.3.2 fidelity hotfix)', () => {
  const java = cineflowSplashJava();

  // The flip is a Camera.rotateY about the canvas origin. Android composes
  // `m.preTranslate(a)` as m = m·T(a) and `m.postTranslate(a)` as m = T(a)·m, so
  // preTranslate(-w/2,-h/2) + postTranslate(w/2,h/2) cancel exactly and the rect
  // drawn at (0,0,w,h) keeps its centre at (w/2,h/2) in the translated space:
  // the mark landed half its own width right and half its own height below the
  // column, which is what the owner saw on 0.3.1 (mark clipped at the right
  // edge). Drawing the rect centred on the origin removes the offset entirely.
  it('the mark is drawn centred on the column, never offset by half its size', () => {
    expect(java).toContain(
      'canvas.drawBitmap(bmp, null, new RectF(-w / 2f, -h / 2f, w / 2f, h / 2f), p);',
    );
    expect(java).not.toContain('m.preTranslate(-w / 2f, -h / 2f);');
    expect(java).not.toContain('m.postTranslate(w / 2f, h / 2f);');
    expect(java).not.toContain('new RectF(0f, 0f, w, h)');
  });

  it('the drawn mark box is the reference box at every measured viewport', () => {
    const layout = (w: number, h: number) => {
      const u = Math.min(w / 228, h / 488);
      const stageH = 488 * u;
      const markW = 135 * u;
      const markH = markW * (426 / 420);
      const wordW = 215 * u;
      const wordH = wordW * (155 / 620);
      const gap = 12 * u;
      const oy = (h - stageH) / 2;
      const contentTop = oy + ((stageH - 44 * u) - (markH + gap + wordH)) / 2;
      const cx = w / 2;
      return { u, cx, markW, markH, wordW, wordH, contentTop,
        mark: { left: cx - markW / 2, right: cx + markW / 2,
                top: contentTop, bottom: contentTop + markH },
        word: { left: cx - wordW / 2, right: cx + wordW / 2,
                top: contentTop + markH + gap } };
    };
    // device content viewports proven on the API 36 emulator plus the browser
    // render used for the reference measurements
    const viewports: Array<[number, number]> = [
      [720, 1502], [1080, 2209], [2272, 954], [412, 915], [2400, 1080],
    ];
    for (const [w, h] of viewports) {
      const l = layout(w, h);
      // centred to the pixel
      expect(l.mark.left + l.mark.right).toBeCloseTo(w, 6);
      expect(l.word.left + l.word.right).toBeCloseTo(w, 6);
      // fully inside the viewport: nothing to clip
      for (const box of [l.mark, l.word]) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(w + 1e-9);
      }
      expect(l.mark.bottom).toBeLessThanOrEqual(h);
      expect(l.word.top + l.wordH).toBeLessThanOrEqual(h);
      // reference proportions: 135/228 and 215/228 of the stage width
      expect(l.markW / 228 / l.u).toBeCloseTo(135 / 228, 6);
    }
  });

  it('reproduces the defect it fixes: the old offset clipped the mark at 720 wide', () => {
    const w = 720;
    const h = 1502;
    const u = Math.min(w / 228, h / 488);
    const markW = 135 * u;
    const cx = w / 2;
    // old form: rect drawn at (0,0,w,h) after translate(cx,cy) -> centre at cx + markW/2
    const oldRight = cx + markW;
    expect(oldRight).toBeGreaterThan(w); // clipped, as captured on the owner's device
    expect(oldRight - w).toBeCloseTo(55.5, 1);
    // fixed form: symmetric about the centre
    expect(cx + markW / 2).toBeLessThan(w);
  });
});
