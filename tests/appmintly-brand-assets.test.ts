/**
 * AppMintly Phase 4 — official brand asset regression pins.
 *
 * Locks every replaced AppMintly branding asset to the exact bytes derived
 * from the supplied official master artwork (complete composition: A-symbol
 * with green/blue ribbon strokes + floating blue/red/amber pixels,
 * "AppMintly" wordmark — App in green #028B3E, Mintly in blue #0047B7 —
 * and the DISCOVER - INSTALL - EXPERIENCE tagline with gold separators, on
 * the artwork's white background). Any revert to the old emblem-only
 * artwork, or any accidental re-crop/recolor, changes a sha256 and fails
 * this suite.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { REPO_BRAND_ASSETS } from '../lib/brand-assets';

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const size = (p: string) => readFileSync(p).length;

/** Exact sha256 of each Phase 4 replacement (whole-image derivatives). */
const PINS: Record<string, string> = {
  'public/brand/appmintly-logo-official.png':
    '74e7386ec91e11db3daa3bc804efdb72fe668b607a4d6ba952e5156c767105db',
  'public/brand/appmintly-icon.png':
    '14ad90aa88df9c6a69ec9c5cd0005cc9a81bc5a4f688b8f4ca52c23d032e171d',
  'public/brand/appmintly-icon-1024.png':
    '793ab63a21cedf58660d24f6b9fd7ec7ed6dcf98bfbae7ba29352e3292793456',
  'public/brand/appmintly-icon-512.png':
    '6db4e143053bd3aebc04bed0703f36720ce9fe9e6f4e4c474ef881f3047e9287',
  'public/brand/appmintly-icon-192.png':
    '9d9cac752e44dcf41d4d71555751048887210468172c9c773b6223151eac525e',
  'public/brand/appmintly-logo-full.png':
    '2938ebd05d095325d5924a647a69a9964040f83462d9d77d0a324d04cab51a78',
  'public/brand/appmintly-logo-compact.png':
    'a28e6b4714687046a497b967f24cda929ee959f949b7fb6d972480571d561e1c',
  'public/icon-512.png':
    '6db4e143053bd3aebc04bed0703f36720ce9fe9e6f4e4c474ef881f3047e9287',
  'public/icon-512-maskable.png':
    'ee9cd79e5ff6d310417d70d0847eb66366558a0fb656d6b71ae51be2d05c46e0',
  'public/icon-192.png':
    '9d9cac752e44dcf41d4d71555751048887210468172c9c773b6223151eac525e',
  'public/icon-32.png':
    'fc4c65e7e9e8b5a6822ab6c4a2864850e076f38d344f9c75f9592d114d723510',
  'public/icon-16.png':
    '5c5d4d4fd418d635d2b6c010e8aefa4c8155a456333d9b754b53c2a489cfc8aa',
  'public/apple-touch-icon.png':
    'cbabd65d6e928611cc894a4fe0b49f0cdefa4aabc089eed435480102316306a7',
  'public/favicon.ico':
    '5765347fe8078536a417f72739264e40bc4cb53e2f75a1d355af42b5075d6136',
};

/** PNG IHDR dimensions without a decoder (width/height at bytes 16..24). */
const pngSize = (p: string): [number, number] => {
  const b = readFileSync(p);
  expect(b.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('AppMintly official brand assets (Phase 4)', () => {
  it('every Phase 4 replacement matches its pinned official-artwork bytes', () => {
    for (const [f, pin] of Object.entries(PINS)) {
      expect(sha(f), `pin for ${f}`).toBe(pin);
    }
  });

  it('the master artwork is byte-identical to the supplied official upload', () => {
    expect(sha('public/brand/appmintly-logo-official.png')).toBe(PINS['public/brand/appmintly-logo-official.png']);
    expect(size('public/brand/appmintly-logo-official.png')).toBeGreaterThan(1_000_000);
    expect(pngSize('public/brand/appmintly-logo-official.png')).toEqual([1254, 1254]);
  });

  it('square derivatives keep the whole 1:1 artwork (no emblem-only re-crop)', () => {
    for (const [f, s] of [
      ['public/brand/appmintly-icon.png', 700],
      ['public/brand/appmintly-icon-1024.png', 1024],
      ['public/brand/appmintly-icon-512.png', 512],
      ['public/brand/appmintly-icon-192.png', 192],
      ['public/brand/appmintly-logo-full.png', 900],
      ['public/icon-512.png', 512],
      ['public/icon-192.png', 192],
      ['public/icon-32.png', 32],
      ['public/icon-16.png', 16],
      ['public/apple-touch-icon.png', 180],
    ] as const) {
      expect(pngSize(f), `${f} dimensions`).toEqual([s, s]);
    }
    // identical source means identical bytes: icon-512 and the /brand/ 512
    // derivative must be the same file content (whole-image LANCZOS resize).
    expect(sha('public/icon-512.png')).toBe(PINS['public/brand/appmintly-icon-512.png']);
  });

  it('maskable icon is a dedicated safe-zone asset wired into the manifest', () => {
    const manifest = readFileSync('app/manifest.ts', 'utf-8');
    expect(manifest).toContain('icon-512-maskable.png');
    expect(manifest).toMatch(/purpose:\s*'maskable'/);
    expect(pngSize('public/icon-512-maskable.png')).toEqual([512, 512]);
  });

  it('the launcher build input (icon-512.png) is the complete official artwork', () => {
    // com.appmintly.appmintly APK builds bake launcher icons from
    // https://appmintly.pages.dev/icon-512.png — its pin is asserted above;
    // this check makes the wiring explicit so nobody repoints it silently.
    const workflow = readFileSync('.github/workflows/release-android-apk.yml', 'utf-8');
    expect(workflow).toContain('ICON_URL=https://appmintly.pages.dev/icon-512.png');
  });

  it('brand-assets registry pins match the actual deployed file bytes', () => {
    for (const a of REPO_BRAND_ASSETS) {
      const f = `public${a.path}`;
      expect(sha(f), `registry pin for ${a.path}`).toBe(a.sha256);
      expect(size(f), `registry size for ${a.path}`).toBe(a.size);
    }
  });

  it('the wordmark label colors are sampled from the official artwork', () => {
    const c = readFileSync('components/AppMintlyLogo.tsx', 'utf-8');
    expect(c).toContain("#028B3E"); // App — artwork green
    expect(c).toContain("#0047B7"); // Mintly — artwork blue
    expect(c).not.toContain('#087A5B'); // old palette must be gone
  });
});
