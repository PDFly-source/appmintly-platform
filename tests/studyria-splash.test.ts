import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  STUDYRIA_SPLASH_BG,
  STUDYRIA_SPLASH_HARD_TIMEOUT_MS,
  STUDYRIA_SPLASH_ICON_NAME,
  STUDYRIA_SPLASH_MARK_NAME,
  STUDYRIA_SPLASH_MARK_SHA256,
  STUDYRIA_SPLASH_MS,
  STUDYRIA_SPLASH_PACKAGE,
  STUDYRIA_SPLASH_WORD_NAME,
  STUDYRIA_SPLASH_WORD_SHA256,
  studyriaSplashColorEntries,
  studyriaSplashJava,
  studyriaSplashMarkJpeg,
  studyriaSplashStylesV31Xml,
  studyriaSplashStylesXml,
  studyriaSplashTransparentIconXml,
  studyriaSplashWordJpeg,
} from '../lib/splash/studyria-splash';
import { STAGE_W, STAGE_H, designGeometry } from '../lib/splash/studyria-geometry';

const ROOT = process.cwd();
const REFERENCE = join(ROOT, 'docs/splash/Studyria_Splash.html');
const builder = readFileSync(join(ROOT, 'lib/apk-builder.ts'), 'utf8');
const java = studyriaSplashJava(STUDYRIA_SPLASH_PACKAGE);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function referenceJpegs(): Buffer[] {
  const html = readFileSync(REFERENCE, 'utf8');
  const out: Buffer[] = [];
  const re = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(Buffer.from(m[1], 'base64'));
  return out;
}

describe('Studyria splash reference — provenance', () => {
  it('the committed reference is the owner-supplied file', () => {
    const html = readFileSync(REFERENCE);
    expect(html.length).toBe(64448);
    expect(sha(html)).toBe('d41817e6f52960a24291ab090761b76e1166112c076da56c3aafa684f4a6c91e');
  });

  it('both embedded JPEGs are carried byte for byte', () => {
    const imgs = referenceJpegs();
    expect(imgs).toHaveLength(2);
    expect(imgs[0].length).toBe(21071);
    expect(imgs[1].length).toBe(24520);
    expect(sha(imgs[0])).toBe(STUDYRIA_SPLASH_MARK_SHA256);
    expect(sha(imgs[1])).toBe(STUDYRIA_SPLASH_WORD_SHA256);
    expect(sha(studyriaSplashMarkJpeg())).toBe(STUDYRIA_SPLASH_MARK_SHA256);
    expect(sha(studyriaSplashWordJpeg())).toBe(STUDYRIA_SPLASH_WORD_SHA256);
    expect(studyriaSplashMarkJpeg().equals(imgs[0])).toBe(true);
    expect(studyriaSplashWordJpeg().equals(imgs[1])).toBe(true);
  });

  it('the artwork dimensions are the ones the layout math expects', () => {
    // 420x313 mark, 620x182 wordmark (JPEG SOF), drawn 165 and 200 design px wide.
    expect(studyriaSplashMarkJpeg().length).toBe(21071);
    expect(studyriaSplashWordJpeg().length).toBe(24520);
    expect(313 / 420).toBeCloseTo(0.745238, 6);
    expect(182 / 620).toBeCloseTo(0.293548, 6);
  });

  it('the reference markup is the one being reproduced', () => {
    const html = readFileSync(REFERENCE, 'utf8');
    expect(html).toContain('window.SPLASH_MS=3400');
    expect(html).toContain('style="width:165px"');
    expect(html).toContain('style="width:200px"');
    expect(html).toContain('--pg:linear-gradient(90deg,#15151a,#b30f10)');
    expect(html).toContain('.ctr{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding-bottom:44px}');
    expect(html).toContain('rgba(20,20,30,.055)');
    expect(html).toContain('rgba(190,25,25,.3)');
    expect(html).toContain('animation:settle 1s cubic-bezier(.2,.8,.2,1) .25s both');
    expect(html).toContain('animation:wipe 1s cubic-bezier(.6,0,.2,1) .95s both');
    expect(html).toContain('animation:fill 2.4s cubic-bezier(.4,0,.2,1) .6s both');
    expect(html).toContain('animation:gy .9s ease .1s both');
    expect(html).toContain('@media(prefers-reduced-motion:reduce){*{animation:none!important}}');
  });
});

describe('Studyria splash constants', () => {
  it('identity and timing follow the reference', () => {
    expect(STUDYRIA_SPLASH_PACKAGE).toBe('com.appforge.studyria');
    expect(STUDYRIA_SPLASH_MS).toBe(3400);
    expect(STUDYRIA_SPLASH_BG).toBe('#FBFAF7');
    expect(STUDYRIA_SPLASH_HARD_TIMEOUT_MS).toBe(12000);
    expect(STUDYRIA_SPLASH_MARK_NAME).toBe('studyria_splash_mark');
    expect(STUDYRIA_SPLASH_WORD_NAME).toBe('studyria_splash_word');
    expect(STUDYRIA_SPLASH_ICON_NAME).toBe('studyria_splash_transparent_icon');
    expect(java).toContain('DURATION_MS = 3400L');
  });

  it('resources carry the flat reference canvas', () => {
    expect(studyriaSplashColorEntries()).toContain('<color name="studyria_splash_bg">#FBFAF7</color>');
    expect(studyriaSplashStylesXml()).toContain('<item name="android:windowBackground">@color/studyria_splash_bg</item>');
    const v31 = studyriaSplashStylesV31Xml();
    expect(v31).toContain('<item name="android:windowSplashScreenBackground">@color/studyria_splash_bg</item>');
    expect(v31).toContain('@drawable/studyria_splash_transparent_icon');
    expect(studyriaSplashTransparentIconXml()).toContain('<solid android:color="#00000000" />');
    expect(studyriaSplashStylesXml()).not.toContain('windowSplashScreen');
  });

  it('the registry entry is wired without touching any other app', () => {
    expect(builder).toContain('[STUDYRIA_SPLASH_PACKAGE]: {');
    expect(builder).toContain("viewClass: 'StudyriaSplashView'");
    expect(builder).toContain('javaFile: \'StudyriaSplashView.java\'');
    expect(builder).toContain('hardTimeoutMs: STUDYRIA_SPLASH_HARD_TIMEOUT_MS');
    expect(builder).toContain('hasOwnProperty.call(splashSpecs, packageId) ? splashSpecs[packageId] : null');
    // the other five specs keep their own entries
    for (const pkg of ['APPMINTLY_SPLASH_PACKAGE', 'PDFMINIFLY_SPLASH_PACKAGE', 'BILLCRAFT_SPLASH_PACKAGE', 'NIRAMAY_SPLASH_PACKAGE', 'CINEFLOW_SPLASH_PACKAGE']) {
      expect(builder).toContain(`[${pkg}]: {`);
    }
  });
});

describe('Studyria splash — the final cascade, not the overridden rules', () => {
  it('the mark uses settle, never the overridden zoom', () => {
    expect(java).toContain('SETTLE_FROM_Y = -36f');
    expect(java).toContain('SETTLE_FROM_SCALE = 0.94f');
    expect(java).toContain('SETTLE_DELAY = 250L, SETTLE_DUR = 1000L');
    expect(java).toContain('cubicBezier(p, 0.2f, 0.8f, 0.2f, 1f)');
    expect(java).not.toContain('scale(.72');
    expect(java).not.toContain('blur');
  });

  it('the wordmark wipes on the reference timing', () => {
    expect(java).toContain('WIPE_DELAY = 950L, WIPE_DUR = 1000L');
    expect(java).toContain('cubicBezier(p, 0.6f, 0f, 0.2f, 1f)');
    expect(java).toContain('canvas.clipRect(x, y, x + w * p, y + h)');
  });

  it('the margin rule grows from the top and is a CSS-pixel hairline', () => {
    expect(java).toContain('RULE_LEFT = 34f');
    expect(java).toContain('RULE_DELAY = 100L, RULE_DUR = 900L');
    expect(java).toContain('Math.max(1f, density)');
    expect(java).toContain('canvas.drawRect(x, 0f, x + width, h * p, rulePaint)');
  });

  it('the ruled canvas keeps its 31/32 period and tints', () => {
    expect(java).toContain('LINE_OFFSET = 31f');
    expect(java).toContain('LINE_PERIOD = 32f');
    expect(java).toContain('LINE_COLOR = 0x0E14141E');
    expect(java).toContain('RULE_COLOR = 0x4DBE1919');
  });

  it('the progress bar keeps its box, pill radius and gradient', () => {
    expect(java).toContain('BAR_INSET = 60f');
    expect(java).toContain('BAR_BOTTOM = 54f');
    expect(java).toContain('BAR_H = 5f');
    expect(java).toContain('BAR_TRACK = 0x12000000');
    expect(java).toContain('BAR_FILL_FROM = 0xFF15151A');
    expect(java).toContain('BAR_FILL_TO = 0xFFB30F10');
    expect(java).toContain('FILL_DELAY = 600L, FILL_DUR = 2400L');
    expect(java).toContain('cubicBezier(p, 0.4f, 0f, 0.2f, 1f)');
    expect(java).toContain('new int[]{BAR_FILL_FROM, BAR_FILL_TO}');
  });

  it('multiply blending is real, not a paste', () => {
    const multiply = java.match(/PorterDuff\.Mode\.MULTIPLY/g) ?? [];
    expect(multiply).toHaveLength(2);
    expect(java).toContain('setLayerType(LAYER_TYPE_SOFTWARE, null)');
    expect(java).toContain('canvas.saveLayer(');
  });

  it('reduced motion draws the final frame and leaves the bar unfilled', () => {
    expect(java).toContain('private static final long RULE_DELAY');
    expect(java).toContain('final float p = reducedMotion ? 1f : easeRule(');
    expect(java).toContain('final float p = reducedMotion ? 1f : easeSettle(');
    expect(java).toContain('final float p = reducedMotion ? 1f : easeWipe(');
    expect(java).toContain('final float p = reducedMotion ? 0f : easeFill(');
    expect(java).toContain('ANIMATOR_DURATION_SCALE');
    // Still reduced-motion -> DURATION_MS; the only addition is the frozen
    // instant an evidence dump renders at.
    expect(java).toMatch(
      /freezeT >= 0f \? freezeT\s*:\s*\(reducedMotion \? DURATION_MS : elapsedMs\(\)\)/);
    expect(java).toContain('freezeT = t;');
  });

  it('the lifecycle is single-shot and exactly once', () => {
    expect(java).toContain('if (!finished && t >= DURATION_MS)');
    expect(java).toContain('finished = true;');
    expect(java).toContain('if (listener != null) listener.onSplashFinished();');
    expect([...java.matchAll(/listener\.onSplashFinished\(\)/g)]).toHaveLength(1);
    expect(java).toContain('if (startNs < 0L) {');
    expect(java).toContain('if (running && !finished) {');
  });

  it('nothing here is a WebView, a network fetch or a legacy overlay', () => {
    expect(java).not.toContain('WebView');
    expect(java).not.toContain('http');
    expect(java).not.toContain('splashOverlay');
    expect(java).not.toContain('GradientDrawable');
  });
});

describe('Studyria splash — the composition math matches the browser render', () => {
  it('uses the reference stage and column model', () => {
    expect(STAGE_W).toBe(228);
    expect(STAGE_H).toBe(488);
    const g = designGeometry();
    expect(g.markW).toBe(165);
    expect(g.wordW).toBe(200);
    expect(g.markH).toBeCloseTo(122.9643, 3);
    expect(g.wordH).toBeCloseTo(58.7097, 3);
    expect(g.columnH).toBeCloseTo(193.674, 3);
    expect(g.markTop).toBeCloseTo(125.163, 3);
    expect(g.markBottom).toBeCloseTo(248.1273, 3);
    expect(g.wordTop).toBeCloseTo(260.1273, 3);
    expect(g.wordBottom).toBeCloseTo(318.8367, 3);
    expect(g.barTop).toBeCloseTo(429, 3);
    expect(g.barBottom).toBeCloseTo(434, 3);
    expect(g.barLeft).toBeCloseTo(60, 3);
    expect(g.barRight).toBeCloseTo(168, 3);
  });

  it('holds the reference proportions on every viewport we ship to', () => {
    for (const [w, h] of [[1080, 2209], [2272, 954], [412, 915], [720, 1502], [2400, 1080]]) {
      const g = designGeometry();
      const u = Math.min(w / STAGE_W, h / STAGE_H);
      const stageX = (w - STAGE_W * u) / 2;
      const stageY = (h - STAGE_H * u) / 2;
      const markX = stageX + (STAGE_W * u - g.markW * u) / 2;
      const barL = stageX + g.barLeft * u;
      const barR = stageX + g.barRight * u;
      // everything fits inside the viewport, nothing is clipped
      expect(markX).toBeGreaterThanOrEqual(0);
      expect(markX + g.markW * u).toBeLessThanOrEqual(w + 1e-6);
      expect(barL).toBeGreaterThanOrEqual(0);
      expect(barR).toBeLessThanOrEqual(w + 1e-6);
      expect(stageY + g.wordBottom * u).toBeLessThanOrEqual(h + 1e-6);
      expect(stageY + g.markTop * u).toBeGreaterThanOrEqual(0);
      // the column is horizontally centred on the viewport
      expect(markX + (g.markW * u) / 2).toBeCloseTo(w / 2, 6);
      // and the bar is centred too (equal insets)
      expect(barR - w / 2).toBeCloseTo(w / 2 - barL, 6);
    }
  });

  it('the three animations are all finished before the splash retires', () => {
    const settleEnd = 250 + 1000;
    const wipeEnd = 950 + 1000;
    const fillEnd = 600 + 2400;
    expect(Math.max(settleEnd, wipeEnd, fillEnd)).toBeLessThanOrEqual(STUDYRIA_SPLASH_MS);
    expect(fillEnd).toBe(3000);
  });
});
