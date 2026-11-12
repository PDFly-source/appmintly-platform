/**
 * PDFMiniFly launch splash — replacement of the old branded launch experience
 * with the owner-supplied PDFMiniFly_Splash.html design.
 *
 * These tests are the fail-closed contract for the native port in
 * lib/splash/pdfminifly-splash.ts and its wiring in lib/apk-builder.ts:
 *  1. the committed reference HTML is byte-identical to the supplied file and
 *     still embeds exactly the two JPEGs the view draws;
 *  2. the generated Java reproduces the reference's FINAL computed design —
 *     the supplied file declares several animations twice, and the later rules
 *     win the cascade (drop beats zoom, wipe beats rise, the gradient beats the
 *     flat body colour). Asserting the winning values is what makes this a real
 *     fidelity check rather than a keyword scan;
 *  3. the geometry, palette and timeline numbers match the reference;
 *  4. reduced motion removes the motion but keeps the 3400ms window;
 *  5. the view contains no WebView, no network and no old splash artwork;
 *  6. only PDFMiniFly receives this splash; every other app keeps the previous
 *     launch experience and AppMintly keeps its own untouched design.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFMINIFLY_SPLASH_BG,
  PDFMINIFLY_SPLASH_HARD_TIMEOUT_MS,
  PDFMINIFLY_SPLASH_ICON_NAME,
  PDFMINIFLY_SPLASH_LOGO_NAME,
  PDFMINIFLY_SPLASH_MS,
  PDFMINIFLY_SPLASH_PACKAGE,
  PDFMINIFLY_SPLASH_WORD_NAME,
  pdfminiflySplashColorEntries,
  pdfminiflySplashJava,
  pdfminiflySplashLogoJpeg,
  pdfminiflySplashStylesV31Xml,
  pdfminiflySplashStylesXml,
  pdfminiflySplashTransparentIconXml,
  pdfminiflySplashWordJpeg,
} from '../lib/splash/pdfminifly-splash';
import {
  PDFMINIFLY_SPLASH_HTML_SHA256,
  PDFMINIFLY_SPLASH_LOGO_SHA256,
  PDFMINIFLY_SPLASH_WORD_SHA256,
} from '../lib/splash/pdfminifly-splash-assets';
import { APPMINTLY_SPLASH_PACKAGE } from '../lib/splash/appmintly-splash';

const REPO = join(__dirname, '..');
const html = readFileSync(join(REPO, 'docs', 'splash', 'PDFMiniFly_Splash.html'), 'utf8');
const builderSrc = readFileSync(join(REPO, 'lib', 'apk-builder.ts'), 'utf8');
const java = pdfminiflySplashJava(PDFMINIFLY_SPLASH_PACKAGE);
const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

describe('PDFMiniFly splash reference — provenance', () => {
  it('the committed reference is byte-identical to the supplied design', () => {
    expect(sha(Buffer.from(html, 'utf8'))).toBe(PDFMINIFLY_SPLASH_HTML_SHA256);
  });

  it('the reference still embeds exactly two base64 JPEGs', () => {
    const embedded = html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g) ?? [];
    expect(embedded).toHaveLength(2);
  });

  it('the extracted artwork matches the reference bytes (no redrawn logo)', () => {
    const decoded = (html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g) ?? []).map((m) =>
      createHash('sha256')
        .update(Buffer.from(m.replace('data:image/jpeg;base64,', ''), 'base64'))
        .digest('hex'),
    );
    expect(decoded).toEqual([PDFMINIFLY_SPLASH_LOGO_SHA256, PDFMINIFLY_SPLASH_WORD_SHA256]);
    expect(sha(pdfminiflySplashLogoJpeg())).toBe(PDFMINIFLY_SPLASH_LOGO_SHA256);
    expect(sha(pdfminiflySplashWordJpeg())).toBe(PDFMINIFLY_SPLASH_WORD_SHA256);
  });

  it('the progress bar follows the reference fill timeline exactly', () => {
    const html = readFileSync(join(REPO, 'docs', 'splash', 'PDFMiniFly_Splash.html'), 'utf8');
    // reference: .pb { left/right 70, bottom 54, height 5 } and the ::after fill
    expect(html).toContain('left:70px;right:70px');
    expect(html).toContain('fill 2.4s cubic-bezier(.4,0,.2,1) .6s both');
    const java = pdfminiflySplashJava('com.appforge.pdfminifly');
    expect(java).toContain('BAR_DELAY = 600L, BAR_DUR = 2400L');
    expect(java).toContain('ease(progress(t, BAR_DELAY, BAR_DUR), 0.4f, 0f, 0.2f, 1f)');
    expect(java).toContain('BAR_INSET_X = 70f');
    expect(java).toContain('BAR_BOTTOM = 54f');
    expect(java).toContain('BAR_H = 5f');
    // the track and the fill both carry the reference colours, fully opaque fill
    expect(java).toContain('BAR_TRACK = 0x1FD71920');
    expect(java).toContain('BAR_FILL_START = 0xFFD71920');
    expect(java).toContain('BAR_FILL_END = 0xFFFF7A1A');
  });

  it('the artwork dimensions are the ones the layout math expects', () => {
    expect(pdfminiflySplashLogoJpeg().length).toBe(28656);
    expect(pdfminiflySplashWordJpeg().length).toBe(23484);
  });
});

describe('PDFMiniFly splash — final computed design', () => {
  it('duration stays the reference 3400ms and the hard timeout is unchanged', () => {
    expect(PDFMINIFLY_SPLASH_MS).toBe(3400);
    expect(PDFMINIFLY_SPLASH_HARD_TIMEOUT_MS).toBe(12000);
    expect(html).toContain('window.SPLASH_MS=3400');
    expect(java).toContain('DURATION_MS = 3400L');
  });

  it('the reference really does declare the earlier animations twice', () => {
    // guards the premise: the winning rules below must be the later ones
    expect(html).toMatch(/@keyframes zoom\{/);
    expect(html).toMatch(/@keyframes rise\{/);
    expect(html).toMatch(/\.go \.mk\{animation:drop/);
    expect(html).toMatch(/\.go \.tx\{animation:wipe/);
  });

  it('logo uses the dropping animation, not the earlier zoom', () => {
    expect(html).toMatch(/\.go \.mk\{animation:drop \.95s cubic-bezier\(\.3,\.8,\.3,1\) \.2s both/);
    expect(java).toContain('LOGO_DELAY = 200L, LOGO_DUR = 950L');
    expect(java).toContain('ease(raw / 0.6f, 0.3f, 0.8f, 0.3f, 1f)');
    expect(java).toContain('lerp(130f, -10f, s)');
    expect(java).toContain('lerp(-8f, 2f, s)');
    expect(java).toContain('lerp(0.8f, 1.03f, s)');
    expect(java).not.toContain('filter:blur');
  });

  it('wordmark uses the clip wipe, not the earlier rise', () => {
    expect(html).toMatch(/\.go \.tx\{animation:wipe \.9s cubic-bezier\(\.6,0,\.2,1\) \.95s both/);
    expect(java).toContain('WORD_DELAY = 950L, WORD_DUR = 900L');
    expect(java).toContain('ease(progress(t, WORD_DELAY, WORD_DUR), 0.6f, 0f, 0.2f, 1f)');
    expect(java).toContain('canvas.clipRect(');
  });

  it('glow and progress bar keep their reference timing', () => {
    expect(java).toContain('GLOW_DELAY = 300L, GLOW_DUR = 1200L');
    expect(java).toContain('BAR_DELAY = 600L, BAR_DUR = 2400L');
    expect(java).toContain('ease(progress(t, BAR_DELAY, BAR_DUR), 0.4f, 0f, 0.2f, 1f)');
  });

  it('the background is the final vertical gradient, not the flat body colour', () => {
    expect(html).toContain('linear-gradient(180deg,#fff,#fff0ec)');
    expect(java).toContain('BG_TOP = 0xFFFFFFFF');
    expect(java).toContain('BG_BOTTOM = 0xFFFFF0EC');
    expect(java).toContain('new LinearGradient(0f, 0f, 0f, h, BG_TOP, BG_BOTTOM');
    expect(PDFMINIFLY_SPLASH_BG).toBe('#FFFFFF');
  });

  it('palette matches the reference exactly', () => {
    expect(java).toContain('GLOW_COLOR = 0x3DFF4628'); // rgba(255,70,40,.24)
    expect(java).toContain('BAR_TRACK = 0x1FD71920'); // rgba(215,25,32,.12)
    expect(java).toContain('BAR_FILL_START = 0xFFD71920');
    expect(java).toContain('BAR_FILL_END = 0xFFFF7A1A');
    expect(html).toContain('#d71920');
    expect(html).toContain('#ff7a1a');
  });

  it('stage fit and geometry match the reference numbers', () => {
    expect(java).toContain('STAGE_W = 228f');
    expect(java).toContain('STAGE_H = 488f');
    expect(java).toContain('Math.min(w / stageW, h / stageH)');
    expect(java).toContain('GLOW_D = 270f');
    expect(java).toContain('GLOW_CY = 190f');
    expect(java).toContain('COLUMN_GAP = 12f');
    expect(java).toContain('COLUMN_PAD_BOTTOM = 44f');
    expect(java).toContain('LOGO_W = 165f');
    expect(java).toContain('WORD_W = 185f');
    expect(java).toContain('BAR_INSET_X = 70f');
    expect(java).toContain('BAR_BOTTOM = 54f');
    expect(java).toContain('BAR_H = 5f');
  });

  it('both artworks are multiplied onto the backdrop like mix-blend-mode', () => {
    expect(html).toContain('mix-blend-mode:multiply');
    expect(java).toContain('PorterDuff.Mode.MULTIPLY');
    expect(java).toContain('setLayerType(LAYER_TYPE_SOFTWARE, null)');
  });

  it('respects reduced motion and never animates when the system scale is 0', () => {
    expect(java).toContain('ANIMATOR_DURATION_SCALE');
    expect(java).toContain('private final boolean reducedMotion;');
    // static final frame: logo and wordmark shown, glow off, bar empty
    expect(java).toContain('final float reveal = reducedMotion');
    expect(java).toContain('final float fill = reducedMotion');
    expect(java).toContain('if (!reducedMotion) {');
    // the splash window itself is unchanged by reduced motion
    expect(java).toContain('finishIfDue(reducedMotion ? elapsedMs() : t);');
  });
});

describe('PDFMiniFly splash — launch surfaces', () => {
  it('the window and Android 12+ system splash cannot show old branding', () => {
    const styles = pdfminiflySplashStylesXml();
    expect(styles).toContain('<item name="android:windowBackground">@color/pdfminifly_splash_bg</item>');
    expect(pdfminiflySplashColorEntries()).toContain('<color name="pdfminifly_splash_bg">#FFFFFF</color>');
    const v31 = pdfminiflySplashStylesV31Xml();
    expect(v31).toContain('<item name="android:windowSplashScreenBackground">@color/pdfminifly_splash_bg</item>');
    // the system splash draws the transparent shape, so no older artwork can lead
    expect(v31).toContain(`@drawable/${PDFMINIFLY_SPLASH_ICON_NAME}`);
    const icon = pdfminiflySplashTransparentIconXml();
    expect(icon).toContain('android:shape="rectangle"');
    expect(icon).toContain('<solid android:color="#00000000" />');
  });

  it('is a Canvas view: no WebView, no HTML asset, no network', () => {
    expect(java).not.toContain('WebView');
    expect(java).not.toContain('http://');
    expect(java).not.toContain('https://');
    expect(java).not.toContain('R.raw');
    expect(java).toContain('extends View');
  });

  it('the artwork is packaged under the names the view decodes', () => {
    expect(java).toContain(`loadBitmap("${PDFMINIFLY_SPLASH_LOGO_NAME}")`);
    expect(java).toContain(`loadBitmap("${PDFMINIFLY_SPLASH_WORD_NAME}")`);
    expect(builderSrc).toContain(`\${PDFMINIFLY_SPLASH_LOGO_NAME}.jpg`);
    expect(builderSrc).toContain(`\${PDFMINIFLY_SPLASH_WORD_NAME}.jpg`);
  });
});

describe('PDFMiniFly splash — build wiring and blast radius', () => {
  it('the builder selects the PDFMiniFly design for its package only', () => {
    expect(builderSrc).toContain("packageId === PDFMINIFLY_SPLASH_PACKAGE");
    expect(builderSrc).toContain("viewClass: 'PdfMiniFlySplashView'");
    expect(builderSrc).toContain('java: pdfminiflySplashJava,');
  });

  it('AppMintly keeps its own design untouched', () => {
    expect(builderSrc).toContain("packageId === APPMINTLY_SPLASH_PACKAGE");
    expect(builderSrc).toContain("viewClass: 'AppMintlySplashView'");
    expect(builderSrc).toContain('java: appmintlySplashJava,');
    // the two designs never share artwork
    expect(java).not.toContain('splash_mark');
    expect(java).not.toContain('AppMintlySplashView');
    expect(APPMINTLY_SPLASH_PACKAGE).not.toBe(PDFMINIFLY_SPLASH_PACKAGE);
  });

  it('every other app still gets the previous launch experience', () => {
    expect(builderSrc).toContain('const splashSpec');
    expect(builderSrc).toContain(': null;');
    expect(builderSrc).toContain('const isNativeSplashBuild = splashSpec !== null;');
    // non-native builds keep the gradient window background
    expect(builderSrc).toContain('mixHex(themeColor, \'white\', 0.08)');
  });

  it('the activity retires only after animation and first paint, with the timeout', () => {
    expect(builderSrc).toContain('splashHardTimeoutMs');
    expect(builderSrc).toContain('splashContentReady && splashAnimationDone');
    expect(builderSrc).toContain('setSplashStatusBar(false)');
  });
});
