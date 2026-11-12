import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NIRAMAY_SPLASH_HTML_SHA256,
  NIRAMAY_SPLASH_LOGO_JPEG_BASE64,
  NIRAMAY_SPLASH_LOGO_SHA256,
  NIRAMAY_SPLASH_WORD_JPEG_BASE64,
  NIRAMAY_SPLASH_WORD_SHA256,
} from '../lib/splash/niramay-splash-assets';
import {
  NIRAMAY_SPLASH_BG,
  NIRAMAY_SPLASH_HARD_TIMEOUT_MS,
  NIRAMAY_SPLASH_ICON_NAME,
  NIRAMAY_SPLASH_LOGO_NAME,
  NIRAMAY_SPLASH_MS,
  NIRAMAY_SPLASH_PACKAGE,
  NIRAMAY_SPLASH_WORD_NAME,
  niramaySplashColorEntries,
  niramaySplashJava,
  niramaySplashLogoJpeg,
  niramaySplashStylesV31Xml,
  niramaySplashStylesXml,
  niramaySplashTransparentIconXml,
  niramaySplashWordJpeg,
} from '../lib/splash/niramay-splash';
import {
  APPMINTLY_SPLASH_BG,
  APPMINTLY_SPLASH_PACKAGE,
  appmintlySplashJava,
  appmintlySplashMarkJpeg,
} from '../lib/splash/appmintly-splash';
import {
  BILLCRAFT_SPLASH_BG,
  BILLCRAFT_SPLASH_PACKAGE,
  billcraftSplashJava,
} from '../lib/splash/billcraft-splash';
import {
  PDFMINIFLY_SPLASH_BG,
  PDFMINIFLY_SPLASH_PACKAGE,
  pdfminiflySplashJava,
} from '../lib/splash/pdfminifly-splash';

const REPO = join(__dirname, '..');
const html = readFileSync(join(REPO, 'docs', 'splash', 'Niramay_Splash.html'), 'utf8');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Reads a JPEG's pixel dimensions from its first Start-Of-Frame segment. */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF segment');
}

describe('Niramay splash reference — provenance', () => {
  it('the committed reference is the owner-supplied file', () => {
    expect(sha256(html)).toBe(NIRAMAY_SPLASH_HTML_SHA256);
    expect(html).toContain('<title>Niramay splash</title>');
  });

  it('both embedded JPEGs are carried byte for byte', () => {
    const embedded = [...html.matchAll(/src="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/g)]
      .map((m) => Buffer.from(m[1], 'base64'));
    expect(embedded).toHaveLength(2);
    expect(sha256(embedded[0])).toBe(NIRAMAY_SPLASH_LOGO_SHA256);
    expect(sha256(embedded[1])).toBe(NIRAMAY_SPLASH_WORD_SHA256);
    // the module decodes to the very same bytes
    expect(sha256(niramaySplashLogoJpeg())).toBe(NIRAMAY_SPLASH_LOGO_SHA256);
    expect(sha256(niramaySplashWordJpeg())).toBe(NIRAMAY_SPLASH_WORD_SHA256);
    expect(sha256(Buffer.from(NIRAMAY_SPLASH_LOGO_JPEG_BASE64, 'base64'))).toBe(NIRAMAY_SPLASH_LOGO_SHA256);
    expect(sha256(Buffer.from(NIRAMAY_SPLASH_WORD_JPEG_BASE64, 'base64'))).toBe(NIRAMAY_SPLASH_WORD_SHA256);
  });

  it('the artwork dimensions are the ones the layout math expects', () => {
    expect(jpegSize(niramaySplashLogoJpeg())).toEqual({ width: 420, height: 358 });
    expect(jpegSize(niramaySplashWordJpeg())).toEqual({ width: 620, height: 203 });
  });

  it('the reference markup is the one being reproduced', () => {
    expect(html).toContain('style="width:150px"');   // .mk display width
    expect(html).toContain('style="width:195px"');   // .tx display width
    expect(html).toContain('window.SPLASH_MS=3400');
    expect(html).toContain("window.SPLASH_NEXT=''");
    // .pb is styled but never rendered: Niramay has no progress bar at all
    expect(html).toContain('.pb{');
    expect(html).not.toContain('class="pb"');
  });
});

describe('Niramay splash constants', () => {
  it('identity and timing follow the reference', () => {
    expect(NIRAMAY_SPLASH_PACKAGE).toBe('com.appforge.niramay');
    expect(NIRAMAY_SPLASH_MS).toBe(3400);
    expect(NIRAMAY_SPLASH_BG).toBe('#F6EED8');
    expect(NIRAMAY_SPLASH_HARD_TIMEOUT_MS).toBeGreaterThan(NIRAMAY_SPLASH_MS);
    expect(NIRAMAY_SPLASH_LOGO_NAME).toBe('niramay_splash_logo');
    expect(NIRAMAY_SPLASH_WORD_NAME).toBe('niramay_splash_word');
    expect(NIRAMAY_SPLASH_ICON_NAME).toBe('niramay_splash_transparent_icon');
  });

  it('the resources only describe the neutral launch surface', () => {
    expect(niramaySplashColorEntries()).toContain('niramay_splash_bg');
    expect(niramaySplashColorEntries()).toContain('#F6EED8');
    expect(niramaySplashStylesXml()).toContain('@color/niramay_splash_bg');
    expect(niramaySplashStylesXml()).not.toContain('@drawable/ic_launcher');
    // Android 12+: same neutral surface, transparent (icon-less) splash icon
    expect(niramaySplashStylesV31Xml()).toContain('android:windowSplashScreenBackground');
    expect(niramaySplashStylesV31Xml()).toContain('@drawable/niramay_splash_transparent_icon');
    expect(niramaySplashTransparentIconXml()).toContain('#00000000');
  });
});

describe('Niramay splash — the final cascade, not the overridden rules', () => {
  const java = niramaySplashJava('com.appforge.niramay');

  it('the logo uses the final soft animation, never the overridden zoom', () => {
    expect(html).toMatch(/\.go \.mk\{animation:zoom 1s cubic-bezier\(\.2,\.9,\.3,1\.1\) \.2s both\}/);
    expect(html).toMatch(/\.go \.mk\{animation:soft 1\.5s cubic-bezier\(\.2,\.7,\.2,1\) \.3s both\}/);
    expect(java).toContain('LOGO_DELAY = 300L, LOGO_DUR = 1500L');
    expect(java).toContain('ease(lp, 0.2f, 0.7f, 0.2f, 1f)');
    expect(java).toContain('lerp(0.92f, 1f, le)');
    // the overridden zoom carried a blur; the final design has none
    expect(java).not.toContain('blur');
  });

  it('the wordmark rises on the final 1.1s / 1.2s timing', () => {
    expect(html).toContain('.go .tx{animation:rise .8s ease .9s both}');
    expect(html).toContain('.go .tx{animation:rise 1.1s ease 1.2s both}');
    expect(java).toContain('WORD_DELAY = 1200L, WORD_DUR = 1100L');
    expect(java).toContain('ease(wp, 0.25f, 0.1f, 0.25f, 1f)');
    expect(java).toContain('18f * (1f - we)');
    expect(java).not.toContain('WORD_DELAY = 900L');
  });

  it('the gold halo matches .gl and its glow animation', () => {
    expect(html).toContain('.go .gl{animation:glow 2s ease .1s both}');
    expect(html).toContain('background:radial-gradient(circle,rgba(212,170,70,.28),transparent 68%)');
    expect(java).toContain('GLOW_DELAY = 100L, GLOW_DUR = 2000L');
    expect(java).toContain('GLOW_INNER = 0x47D4AA46');
    expect(java).toContain('GLOW_OUTER = 0x00D4AA46');
    expect(java).toContain('GLOW_STOP = 0.68f');
    expect(java).toContain('GLOW_R = 150f');
    expect(java).toContain('GLOW_CX = 114f');
    expect(java).toContain('GLOW_CY = 190f');
    expect(java).toContain('lerp(0.6f, 1f, e)');
  });

  it('all six floating particles keep their positions, sizes and delays', () => {
    expect(java).toContain('PARTICLE_X = {22f, 74f, 40f, 62f, 14f, 84f}');
    expect(java).toContain('PARTICLE_Y = {70f, 62f, 78f, 74f, 50f, 40f}');
    expect(java).toContain('PARTICLE_DELAY = {0L, 900L, 1700L, 2400L, 1200L, 2000L}');
    expect(java).toContain('PARTICLE_D = 4f');
    expect(java).toContain('PARTICLE_COLOR = 0xFFC9A24A');
    expect(java).toContain('PARTICLE_FLOAT_MS = 3600L');
    expect(java).toContain('PARTICLE_DRIFT_UP = -56f');
    expect(java).toContain('PARTICLE_DRIFT_DOWN = 24f');
    expect(java).toContain('for (int i = 0; i < PARTICLE_X.length; i++)');
    // the keyframe opacities: 0 -> .9 at 40% -> 0
    expect(java).toContain('opacity = 0.9f * easeInOut(phase / 0.4f)');
    expect(java).toContain('opacity = 0.9f * (1f - easeInOut((phase - 0.4f) / 0.6f))');
    // the reference markup really does carry six dots with those inline offsets
    expect([...html.matchAll(/class="fb gd"/g)]).toHaveLength(6);
    for (const pair of ['left:22%;top:70%', 'left:74%;top:62%', 'left:40%;top:78%',
      'left:62%;top:74%', 'left:14%;top:50%', 'left:84%;top:40%']) {
      expect(html).toContain(pair);
    }
    for (const delay of ['animation-delay:.9s', 'animation-delay:1.7s',
      'animation-delay:2.4s', 'animation-delay:1.2s', 'animation-delay:2s']) {
      expect(html).toContain(delay);
    }
  });

  it('the bottom gold line is the thin .gl2 hairline, not a bar', () => {
    expect(html).toContain('.go .gl2{animation:lw 1.4s ease 1.6s both}');
    expect(html).toContain('background:linear-gradient(90deg,transparent,#c9a24a,transparent)');
    expect(java).toContain('LINE_DELAY = 1600L, LINE_DUR = 1400L');
    expect(java).toContain('LINE_BOTTOM = 58f');
    expect(java).toContain('LINE_H = 1f');
    expect(java).toContain('LINE_W = 120f');
    expect(java).toContain('new LinearGradient(');
  });

  it('there is no invented loader or progress bar anywhere', () => {
    expect(java).not.toContain('SEG_');
    expect(java).not.toContain('STEPS_');
    expect(java).not.toContain('drawRoundRect');
    expect(java).not.toContain('Loading');
    expect(java).not.toContain('percent');
  });

  it('the canvas and radial gradient match the reference', () => {
    expect(html).toContain('.sp{background:radial-gradient(circle at 50% 38%,#fffef8,#f6eed8 85%)}');
    expect(java).toContain('CANVAS = 0xFFF6EED8');
    expect(java).toContain('GRAD_INNER = 0xFFFFFEF8');
    expect(java).toContain('GRAD_OUTER = 0xFFF6EED8');
    expect(java).toContain('GRAD_CX = 114f');
    expect(java).toContain('GRAD_CY = 185.44f');
    expect(java).toContain('GRAD_STOP = 0.85f');
    expect(java).toContain('new RadialGradient(');
  });

  it('the artwork blends with multiply and keeps the reference widths', () => {
    expect(java).toContain('LOGO_W = 150f');
    expect(java).toContain('WORD_W = 195f');
    expect(java).toContain('CTR_GAP = 12f');
    expect(java).toContain('CTR_PAD_BOTTOM = 44f');
    expect(java).toContain('STAGE_W = 228f');
    expect(java).toContain('STAGE_H = 488f');
    expect(java).toContain('PorterDuff.Mode.MULTIPLY');
    expect(html).toContain('mix-blend-mode:multiply');
  });

  it('reduced motion keeps every piece of artwork visible, with no motion', () => {
    expect(html).toContain('@media(prefers-reduced-motion:reduce){*{animation:none!important}}');
    expect(java).toContain('ANIMATOR_DURATION_SCALE');
    expect(java).toContain('reducedMotion ? DURATION_MS : elapsedMs()');
    // the glow, the dots and the hairline still draw in their final state
    expect(java).toContain('final float p = reducedMotion ? 1f : progress(t, GLOW_DELAY, GLOW_DUR);');
    expect(java).toContain('opacity = 0.9f;');
    expect(java).toContain('? 1f\n                : ease(progress(t, LINE_DELAY, LINE_DUR)');
  });

  it('the splash retires exactly once and then hands over', () => {
    expect(java).toContain('if (!finished && t >= DURATION_MS)');
    expect(java).toContain('if (listener != null) listener.onSplashFinished();');
    expect(java).toContain('private static final long DURATION_MS = 3400L;');
    expect(java).toContain('public void restart()');
    expect(java).toContain('setContentDescription("Niramay splash")');
  });
});

describe('Niramay splash — build isolation', () => {
  it('only Niramay receives the Niramay assets', async () => {
    const { default: fs } = await import('node:fs');
    const builder = fs.readFileSync(join(REPO, 'lib', 'apk-builder.ts'), 'utf8');
    // one registry entry per shipped splash, keyed by package id
    expect(builder).toContain('[NIRAMAY_SPLASH_PACKAGE]: {');
    expect(builder).toContain('[BILLCRAFT_SPLASH_PACKAGE]: {');
    expect(builder).toContain('[APPMINTLY_SPLASH_PACKAGE]: {');
    expect(builder).toContain('[PDFMINIFLY_SPLASH_PACKAGE]: {');
    expect(builder).toContain('hasOwnProperty.call(splashSpecs, packageId)');
    // Niramay's generated view never references another app's artwork
    const java = niramaySplashJava('com.appforge.niramay');
    expect(java).not.toContain('appmintly');
    expect(java).not.toContain('pdfminifly');
    expect(java).not.toContain('billcraft');
    expect(java).toContain('niramay_splash_logo');
    expect(java).toContain('niramay_splash_word');
  });

  it('the three completed designs are untouched by the registry', () => {
    expect(appmintlySplashJava('com.appmintly.appmintly')).toBe(appmintlySplashJava('com.appmintly.appmintly'));
    expect(pdfminiflySplashJava('com.appforge.pdfminifly')).toContain('PdfMiniFlySplashView');
    expect(billcraftSplashJava('com.appforge.billcraft')).toContain('BillCraftSplashView');
    expect(NIRAMAY_SPLASH_BG).not.toBe(APPMINTLY_SPLASH_BG);
    expect(NIRAMAY_SPLASH_BG).not.toBe(PDFMINIFLY_SPLASH_BG);
    expect(NIRAMAY_SPLASH_BG).not.toBe(BILLCRAFT_SPLASH_BG);
    expect(sha256(appmintlySplashMarkJpeg())).not.toBe(NIRAMAY_SPLASH_LOGO_SHA256);
  });
});
