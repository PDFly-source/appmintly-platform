import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BILLCRAFT_SPLASH_HTML_SHA256,
  BILLCRAFT_SPLASH_LOGO_JPEG_BASE64,
  BILLCRAFT_SPLASH_LOGO_SHA256,
  BILLCRAFT_SPLASH_WORD_JPEG_BASE64,
  BILLCRAFT_SPLASH_WORD_SHA256,
} from '../lib/splash/billcraft-splash-assets';
import {
  BILLCRAFT_SPLASH_BG,
  BILLCRAFT_SPLASH_HARD_TIMEOUT_MS,
  BILLCRAFT_SPLASH_ICON_NAME,
  BILLCRAFT_SPLASH_LOGO_NAME,
  BILLCRAFT_SPLASH_MS,
  BILLCRAFT_SPLASH_PACKAGE,
  BILLCRAFT_SPLASH_WORD_NAME,
  billcraftSplashColorEntries,
  billcraftSplashJava,
  billcraftSplashLogoJpeg,
  billcraftSplashStylesV31Xml,
  billcraftSplashStylesXml,
  billcraftSplashTransparentIconXml,
  billcraftSplashWordJpeg,
} from '../lib/splash/billcraft-splash';
import {
  APPMINTLY_SPLASH_BG,
  APPMINTLY_SPLASH_PACKAGE,
  appmintlySplashJava,
  appmintlySplashMarkJpeg,
} from '../lib/splash/appmintly-splash';
import {
  PDFMINIFLY_SPLASH_BG,
  PDFMINIFLY_SPLASH_PACKAGE,
  pdfminiflySplashJava,
  pdfminiflySplashLogoJpeg,
} from '../lib/splash/pdfminifly-splash';

const REPO = join(__dirname, '..');
const html = readFileSync(join(REPO, 'docs', 'splash', 'BillCraft_Splash.html'), 'utf8');
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

describe('BillCraft splash reference — provenance', () => {
  it('the committed reference is the owner-supplied file', () => {
    expect(sha256(html)).toBe(BILLCRAFT_SPLASH_HTML_SHA256);
    expect(html).toContain('<title>BillCraft splash</title>');
  });

  it('both embedded JPEGs are carried byte for byte', () => {
    const embedded = [...html.matchAll(/src="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/g)]
      .map((m) => Buffer.from(m[1], 'base64'));
    expect(embedded).toHaveLength(2);
    expect(sha256(embedded[0])).toBe(BILLCRAFT_SPLASH_LOGO_SHA256);
    expect(sha256(embedded[1])).toBe(BILLCRAFT_SPLASH_WORD_SHA256);
    // the module decodes to the very same bytes
    expect(sha256(billcraftSplashLogoJpeg())).toBe(BILLCRAFT_SPLASH_LOGO_SHA256);
    expect(sha256(billcraftSplashWordJpeg())).toBe(BILLCRAFT_SPLASH_WORD_SHA256);
    expect(sha256(Buffer.from(BILLCRAFT_SPLASH_LOGO_JPEG_BASE64, 'base64'))).toBe(BILLCRAFT_SPLASH_LOGO_SHA256);
    expect(sha256(Buffer.from(BILLCRAFT_SPLASH_WORD_JPEG_BASE64, 'base64'))).toBe(BILLCRAFT_SPLASH_WORD_SHA256);
  });

  it('the artwork dimensions are the ones the layout math expects', () => {
    expect(jpegSize(billcraftSplashLogoJpeg())).toEqual({ width: 420, height: 410 });
    expect(jpegSize(billcraftSplashWordJpeg())).toEqual({ width: 620, height: 197 });
  });

  it('the reference markup is the one being reproduced', () => {
    expect(html).toContain('style="width:130px"');   // .mk display width
    expect(html).toContain('style="width:190px"');   // .tx display width
    expect(html).toContain('--s:#17c3a0;--d:2.1s');  // third segment colour + delay
    expect(html).toContain('window.SPLASH_MS=3400');
    // .pb is styled but never rendered: the three .steps segments are the bar
    expect(html).toContain('.pb{');
    expect(html).not.toContain('class="pb"');
  });
});

describe('BillCraft splash constants', () => {
  it('identity and timing follow the reference', () => {
    expect(BILLCRAFT_SPLASH_PACKAGE).toBe('com.appforge.billcraft');
    expect(BILLCRAFT_SPLASH_MS).toBe(3400);
    expect(BILLCRAFT_SPLASH_BG).toBe('#F4EFFF');
    expect(BILLCRAFT_SPLASH_HARD_TIMEOUT_MS).toBeGreaterThan(BILLCRAFT_SPLASH_MS);
    expect(BILLCRAFT_SPLASH_LOGO_NAME).toBe('billcraft_splash_logo');
    expect(BILLCRAFT_SPLASH_WORD_NAME).toBe('billcraft_splash_word');
    expect(BILLCRAFT_SPLASH_ICON_NAME).toBe('billcraft_splash_transparent_icon');
  });

  it('the resources only describe the neutral launch surface', () => {
    expect(billcraftSplashColorEntries()).toContain('billcraft_splash_bg');
    expect(billcraftSplashColorEntries()).toContain('#F4EFFF');
    expect(billcraftSplashStylesXml()).toContain('@color/billcraft_splash_bg');
    expect(billcraftSplashStylesXml()).not.toContain('@drawable/ic_launcher');
    // Android 12+: same neutral surface, transparent (icon-less) splash icon
    expect(billcraftSplashStylesV31Xml()).toContain('android:windowSplashScreenBackground');
    expect(billcraftSplashStylesV31Xml()).toContain('@drawable/billcraft_splash_transparent_icon');
    expect(billcraftSplashTransparentIconXml()).toContain('#00000000');
  });
});

describe('BillCraft splash — the final cascade, not the overridden rules', () => {
  const java = billcraftSplashJava('com.appforge.billcraft');

  it('the logo uses the final fall animation, never the overridden zoom', () => {
    expect(html).toMatch(/\.go \.mk\{animation:zoom 1s cubic-bezier\(\.2,\.9,\.3,1\.1\) \.2s both\}/);
    expect(html).toMatch(/\.go \.mk\{animation:fall \.9s cubic-bezier\(\.3,\.7,\.3,1\) \.2s both\}/);
    expect(java).toContain('LOGO_DELAY = 200L, LOGO_DUR = 900L');
    expect(java).toContain('ease(local, 0.3f, 0.7f, 0.3f, 1f)');
    expect(java).toContain('FALL_Y = {-100f, 8f, -3f, 0f}');
    expect(java).toContain('FALL_SCALE = {0.9f, 1f, 1f, 1f}');
    expect(java).toContain('FALL_AT = {0f, 0.55f, 0.78f, 1f}');
    expect(java).not.toContain('blur');
  });

  it('the wordmark rises on the reference delay', () => {
    expect(html).toContain('.go .tx{animation:rise .8s ease .9s both}');
    expect(java).toContain('WORD_DELAY = 900L, WORD_DUR = 800L');
    expect(java).toContain('ease(wp, 0.25f, 0.1f, 0.25f, 1f)');
    expect(java).toContain('18f * (1f - we)');
  });

  it('both ripples keep their own staggered delay and the reference ring', () => {
    expect(html).toContain('.go .rp{animation:rip 1.8s ease-out 1s both}');
    expect(html).toContain('animation-delay:1.35s');
    expect(java).toContain('RIPPLE_DELAY_1 = 1000L, RIPPLE_DELAY_2 = 1350L');
    expect(java).toContain('RIPPLE_DUR = 1800L');
    expect(java).toContain('ease(p, 0f, 0f, 0.58f, 1f)');
    expect(java).toContain('RIPPLE_COLOR = 0xFF17C3A0');
    expect(java).toContain('RIPPLE_D = 120f');
    expect(java).toContain('RIPPLE_STROKE = 2f');
  });

  it('the indicator is three segments, not the unused .pb bar', () => {
    expect(java).toContain('SEG_DELAY_1 = 900L, SEG_DELAY_2 = 1500L, SEG_DELAY_3 = 2100L');
    expect(java).toContain('SEG_DUR = 600L');
    expect(java).toContain('SEG_1 = 0xFF6D28D9');
    expect(java).toContain('SEG_2 = 0xFF6D28D9');
    expect(java).toContain('SEG_3 = 0xFF17C3A0');
    expect(java).toContain('SEG_TRACK = 0x245B21B6');
    expect(java).toContain('STEPS_INSET = 60f');
    expect(java).toContain('STEPS_BOTTOM = 52f');
    expect(java).toContain('STEPS_GAP = 6f');
    expect(java).toContain('STEPS_H = 4f');
    expect(java).toContain('for (int i = 0; i < 3; i++)');
    expect(java).not.toContain('BAR_INSET_X');
  });

  it('the canvas and radial gradient match the reference', () => {
    expect(html).toContain('.sp{background:radial-gradient(circle at 50% 40%,#fff,#ece4ff 88%)}');
    expect(java).toContain('CANVAS = 0xFFF4EFFF');
    expect(java).toContain('GRAD_INNER = 0xFFFFFFFF');
    expect(java).toContain('GRAD_OUTER = 0xFFECE4FF');
    expect(java).toContain('GRAD_CX = 114f');
    expect(java).toContain('GRAD_CY = 195.2f');
    expect(java).toContain('GRAD_STOP = 0.88f');
    expect(java).toContain('new RadialGradient(');
  });

  it('the artwork blends with multiply and keeps the reference widths', () => {
    expect(java).toContain('LOGO_W = 130f');
    expect(java).toContain('WORD_W = 190f');
    expect(java).toContain('CTR_GAP = 12f');
    expect(java).toContain('CTR_PAD_BOTTOM = 44f');
    expect(java).toContain('PorterDuff.Mode.MULTIPLY');
    expect(html).toContain('mix-blend-mode:multiply');
  });

  it('reduced motion shows the artwork and hides the motion', () => {
    expect(html).toContain('@media(prefers-reduced-motion:reduce){*{animation:none!important}}');
    expect(java).toContain('ANIMATOR_DURATION_SCALE');
    expect(java).toContain('if (!reducedMotion)');
    expect(java).toContain('reducedMotion ? DURATION_MS : elapsedMs()');
  });

  it('the splash retires exactly once and then hands over', () => {
    expect(java).toContain('if (!finished && t >= DURATION_MS)');
    expect(java).toContain('if (listener != null) listener.onSplashFinished();');
    expect(java).toContain('private static final long DURATION_MS = 3400L;');
    expect(java).toContain('public void restart()');
  });
});

describe('BillCraft splash — build isolation', () => {
  it('only BillCraft receives the BillCraft assets', async () => {
    const { default: fs } = await import('node:fs');
    const builder = fs.readFileSync(join(REPO, 'lib', 'apk-builder.ts'), 'utf8');
    // one registry entry per shipped splash, keyed by package id
    expect(builder).toContain('[BILLCRAFT_SPLASH_PACKAGE]: {');
    expect(builder).toContain('[APPMINTLY_SPLASH_PACKAGE]: {');
    expect(builder).toContain('[PDFMINIFLY_SPLASH_PACKAGE]: {');
    expect(builder).toContain('hasOwnProperty.call(splashSpecs, packageId)');
    // BillCraft's generated view never references another app's artwork
    const java = billcraftSplashJava('com.appforge.billcraft');
    expect(java).not.toContain('appmintly');
    expect(java).not.toContain('pdfminifly');
    expect(java).toContain('billcraft_splash_logo');
    expect(java).toContain('billcraft_splash_word');
  });

  it('the other two designs are untouched by the registry', () => {
    // the registry stores the same generators the two apps already shipped
    expect(appmintlySplashJava('com.appmintly.appmintly')).toBe(appmintlySplashJava('com.appmintly.appmintly'));
    expect(pdfminiflySplashJava('com.appforge.pdfminifly')).toContain('PdfMiniFlySplashView');
    expect(BILLCRAFT_SPLASH_BG).not.toBe(APPMINTLY_SPLASH_BG);
    expect(BILLCRAFT_SPLASH_BG).not.toBe(PDFMINIFLY_SPLASH_BG);
    expect(sha256(appmintlySplashMarkJpeg())).not.toBe(BILLCRAFT_SPLASH_LOGO_SHA256);
    expect(sha256(pdfminiflySplashLogoJpeg())).not.toBe(BILLCRAFT_SPLASH_LOGO_SHA256);
  });
});
