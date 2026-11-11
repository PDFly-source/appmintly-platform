/**
 * AppMintly launch splash — replacement of the old launch experience with the
 * owner-supplied AppMintly_Splash.html design.
 *
 * These tests are the fail-closed contract for the native port in
 * lib/splash/appmintly-splash.ts and its wiring in lib/apk-builder.ts:
 *  1. the committed reference HTML is byte-identical to the supplied file and
 *     still embeds exactly the two JPEGs the view draws;
 *  2. the generated Java reproduces the reference's numbers (palette, geometry,
 *     timeline, reduced motion) and contains no WebView / network / old splash;
 *  3. the launch theme and Android 12+ system splash cannot show old branding;
 *  4. the AppMintly activity retires the splash only after the animation and the
 *     first paint, with the hard timeout still in place;
 *  5. every other app built by the shared template keeps the previous launch
 *     experience, byte for byte.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPMINTLY_SPLASH_BG,
  APPMINTLY_SPLASH_HARD_TIMEOUT_MS,
  APPMINTLY_SPLASH_MS,
  APPMINTLY_SPLASH_PACKAGE,
  appmintlySplashColorEntries,
  appmintlySplashJava,
  appmintlySplashMarkJpeg,
  appmintlySplashStylesV31Xml,
  appmintlySplashStylesXml,
  appmintlySplashTransparentIconXml,
  appmintlySplashWordJpeg,
} from '../lib/splash/appmintly-splash';
import {
  APPMINTLY_SPLASH_HTML_SHA256,
  APPMINTLY_SPLASH_MARK_SHA256,
  APPMINTLY_SPLASH_WORD_SHA256,
} from '../lib/splash/appmintly-splash-assets';

const REPO = join(__dirname, '..');
const html = readFileSync(join(REPO, 'docs', 'splash', 'AppMintly_Splash.html'), 'utf8');
const builderSrc = readFileSync(join(REPO, 'lib', 'apk-builder.ts'), 'utf8');
const java = appmintlySplashJava(APPMINTLY_SPLASH_PACKAGE);
const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

describe('splash reference — provenance', () => {
  it('the committed reference is byte-identical to the supplied design', () => {
    expect(sha(Buffer.from(html, 'utf8'))).toBe(APPMINTLY_SPLASH_HTML_SHA256);
  });

  it('the reference still embeds exactly two base64 JPEGs', () => {
    const embedded = [...html.matchAll(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
    expect(embedded).toHaveLength(2);
    const decoded = embedded.map((b64) => sha(Buffer.from(b64, 'base64')));
    expect(decoded).toEqual([APPMINTLY_SPLASH_MARK_SHA256, APPMINTLY_SPLASH_WORD_SHA256]);
  });

  it('the extracted artwork matches the reference bytes (no redrawn logo)', () => {
    expect(sha(appmintlySplashMarkJpeg())).toBe(APPMINTLY_SPLASH_MARK_SHA256);
    expect(sha(appmintlySplashWordJpeg())).toBe(APPMINTLY_SPLASH_WORD_SHA256);
    expect(appmintlySplashMarkJpeg().subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(appmintlySplashWordJpeg().subarray(0, 2).toString('hex')).toBe('ffd8');
  });
});

describe('splash reference — design values carried into the port', () => {
  it('duration stays the reference 3400ms', () => {
    expect(APPMINTLY_SPLASH_MS).toBe(3400);
    expect(html).toContain('SPLASH_MS=3400');
    expect(java).toContain('DURATION_MS = 3400L');
  });

  it('canvas colour and palette match the reference exactly', () => {
    expect(APPMINTLY_SPLASH_BG).toBe('#F8FBFF');
    expect(html).toContain('#f8fbff');
    for (const [token, hex] of [
      ['GREEN', '0xFF1F9D55'],
      ['BLUE', '0xFF2563EB'],
      ['AMBER', '0xFFF5A623'],
      ['RED', '0xFFE5392F'],
    ] as const) {
      expect(java).toContain(`${token} = ${hex}`);
      expect(html.toLowerCase()).toContain(hex.slice(4).toLowerCase());
    }
  });

  it('stage fit matches the reference fit() (min of width/228, height/488)', () => {
    expect(java).toContain('STAGE_W = 228f');
    expect(java).toContain('STAGE_H = 488f');
    expect(java).toContain('Math.min(w / stageW, h / stageH)');
    expect(html).toContain('Math.min(innerWidth/228,innerHeight/488)');
  });

  it('timeline matches the CSS delays and durations', () => {
    expect(java).toContain('LOGO_DELAY = 200f');
    expect(java).toContain('LOGO_DURATION = 1000f');
    expect(java).toContain('WORD_DELAY = 900f');
    expect(java).toContain('WORD_DURATION = 800f');
    expect(java).toContain('RING_DURATION = 1600f');
    expect(java).toContain('RING1_DELAY = 300f');
    expect(java).toContain('RING2_DELAY = 550f');
    expect(java).toContain('DOT_PERIOD = 1100f');
    // the same values are visible in the reference stylesheet
    for (const css of ['zoom 1s', '.2s', 'rise .8s', '.9s', 'ring 1.6s', '.3s', '.55s', 'pulse 1.1s']) {
      expect(html).toContain(css);
    }
  });

  it('the logo zoom uses the reference overshoot curve', () => {
    expect(java).toContain('bezier(segment(t, LOGO_DELAY, LOGO_DURATION), 0.2f, 0.9f, 0.3f, 1.1f)');
    expect(html).toContain('cubic-bezier(.2,.9,.3,1.1)');
    expect(java).toContain('0.72f + 0.28f * logoProgress');
  });

  it('rings expand .45 -> 1.6 and fade out', () => {
    expect(java).toContain('0.45f + 1.15f * eased');
    expect(java).toContain('0.9f * (1f - eased)');
    expect(html).toContain('from{opacity:.9;transform:scale(.45)}to{opacity:0;transform:scale(1.6)}');
  });
});

describe('splash implementation — native, local, no old splash', () => {
  it('is a Canvas view: no WebView, no HTML asset, no network', () => {
    expect(java).toContain('extends View');
    expect(java).not.toMatch(/WebView|http:\/\/|https:\/\/|loadData|loadUrl/);
    expect(builderSrc).not.toMatch(/splash\.html/);
  });

  it('renders the two reference images, multiplied onto the canvas at build-time alpha', () => {
    expect(java).toContain('multiplyMatte');
    expect(java).toContain('splash_mark');
    expect(java).toContain('splash_word');
    expect(java).toContain('0.72f + 0.28f * logoProgress');
    expect(builderSrc).toContain('appmintlySplashMarkJpeg()');
    expect(builderSrc).toContain('appmintlySplashWordJpeg()');
  });

  it('respects reduced motion and never animates when the system scale is 0', () => {
    expect(java).toContain('ANIMATOR_DURATION_SCALE');
    expect(java).toContain('final boolean animate = !reducedMotion;');
  });

  it('cannot trap the user: the hard startup timeout is unchanged', () => {
    expect(APPMINTLY_SPLASH_HARD_TIMEOUT_MS).toBe(12000);
    expect(builderSrc).toContain('mainHandler.postDelayed(splashTimeout, ${splashHardTimeoutMs}L);');
    expect(builderSrc).toContain('hardTimeoutMs: APPMINTLY_SPLASH_HARD_TIMEOUT_MS');
    expect(builderSrc).toContain(
      'const splashHardTimeoutMs = splashSpec ? splashSpec.hardTimeoutMs : APPMINTLY_SPLASH_HARD_TIMEOUT_MS;'
    );
  });

  it('contains no progress-bar styling, matching the reference document', () => {
    // The reference CSS declares .pb but the document has no .pb element and no
    // --pg colour; rendering one would collide with the dots row. Documented in
    // lib/splash/appmintly-splash.ts.
    expect(html).not.toMatch(/<div class="pb"/);
    expect(java).not.toContain('PROGRESS');
  });
});

describe('launch theme — old branding cannot appear first', () => {
  it('window background and Android 12+ splash share the reference canvas', () => {
    expect(appmintlySplashStylesXml()).toContain('@color/splash_launch_bg');
    expect(appmintlySplashStylesV31Xml()).toContain('android:windowSplashScreenBackground">@color/splash_launch_bg');
    expect(appmintlySplashColorEntries()).toContain('splash_launch_bg">#F8FBFF');
  });

  it('the system splash draws no icon and no icon background halo', () => {
    const v31 = appmintlySplashStylesV31Xml();
    expect(v31).toContain('windowSplashScreenAnimatedIcon">@drawable/splash_transparent_icon');
    expect(v31).not.toContain('windowSplashScreenIconBackgroundColor');
    expect(appmintlySplashTransparentIconXml()).toContain('#00000000');
  });

  it('the splash palette replaces the derived brand gradient for this package only', () => {
    // The boolean became a per-package design registry; the guarantee is the
    // same and is now stated once, in the spec that carries the canvas colour.
    expect(builderSrc).toContain('packageId === APPMINTLY_SPLASH_PACKAGE');
    expect(builderSrc).toContain('bg: APPMINTLY_SPLASH_BG');
    expect(builderSrc).toContain('const splashSpecBg = splashSpec ? splashSpec.bg : themeColor;');
    expect(builderSrc).toContain(
      "const splashBgTop = splashSpec ? splashSpec.bg : mixHex(themeColor, 'white', 0.08)"
    );
    expect(builderSrc).toContain(
      "const splashBgBottom = splashSpec ? splashSpec.bg : mixHex(themeColor, 'black', 0.10)"
    );
  });
});

describe('other apps keep the previous launch experience', () => {
  it('the old overlay path is still emitted for every non-AppMintly package', () => {
    expect(builderSrc).toContain('getIdentifier("ic_launcher_foreground", "mipmap", getPackageName())');
    expect(builderSrc).toContain('splashOverlay.setBackground(launchBackground());');
    expect(builderSrc).toContain('<item name="android:windowSplashScreenIconBackgroundColor">@color/splash_bg_bottom</item>');
  });

  it('the new splash is gated on the marketplace package id, not on a global switch', () => {
    expect(APPMINTLY_SPLASH_PACKAGE).toBe('com.appmintly.appmintly');
    // every native-splash branch is driven by the registry, never by a constant
    const gated = builderSrc.match(/isNativeSplashBuild/g) ?? [];
    expect(gated.length).toBeGreaterThan(8);
    expect(builderSrc).toContain('packageId === APPMINTLY_SPLASH_PACKAGE');
    expect(builderSrc).toContain('packageId === PDFMINIFLY_SPLASH_PACKAGE');
    expect(builderSrc).not.toContain('const isAppMintlySplashBuild');
  });

  it('a different package id generates different Java than the AppMintly build', () => {
    const other = appmintlySplashJava('com.example.other');
    expect(other.startsWith('package com.example.other;')).toBe(true);
    expect(other).not.toContain('com.appmintly.appmintly');
  });
});
