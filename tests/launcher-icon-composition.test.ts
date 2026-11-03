import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readPng, bands } from '../scripts/lib/png-bands.mjs';
import { analyseIcon, MIN_BANDS } from '../scripts/verify-apk-launcher-composition.mjs';

const LAUNCHER = 'tests/fixtures/cineflow-launcher-1024.png';

/** Build a symbol-only icon: one dark blob on white, i.e. the 0.2.3/0.2.4 failure shape. */
function symbolOnlyPng(size = 192): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 3 + 1);
    for (let x = 0; x < size; x++) {
      const inBlob = Math.hypot(x - size / 2, y - size / 2) < size * 0.3;
      const v = inBlob ? 13 : 255;
      row[1 + x * 3] = v; row[2 + x * 3] = v; row[3 + x * 3] = v;
    }
    rows.push(row);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlibCrc(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function zlibCrc(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c;
}

describe('Android launcher icon composition', () => {
  it('the committed launcher asset carries symbol, wordmark and tagline lines', () => {
    const report = analyseIcon(readPng(LAUNCHER), 'launcher');
    expect(report.ok).toBe(true);
    expect(report.bands).toBeGreaterThanOrEqual(MIN_BANDS);
    // symbol, wordmark, then three tagline lines — strictly ordered top to bottom
    expect(report.heights).toHaveLength(5);
    expect(report.heights[0]).toBeGreaterThan(report.heights[1]); // symbol taller than wordmark
    for (const taglineLine of report.heights.slice(2)) expect(taglineLine).toBeGreaterThan(0);
  });

  it('fails a symbol-only icon, the exact 0.2.4 regression', () => {
    const tmp = `/tmp/launcher-symbol-only-${process.pid}-${Date.now()}.png`;
    require('node:fs').writeFileSync(tmp, symbolOnlyPng());
    const report = analyseIcon(readPng(tmp), 'symbol-only');
    expect(report.ok).toBe(false);
    expect(report.problems.join(' ')).toMatch(/symbol-only/);
  });

  it('keeps the builder pointed at adaptive + round mipmaps', () => {
    const src = readFileSync('lib/apk-builder.ts', 'utf8');
    expect(src).toContain('android:icon="@mipmap/ic_launcher"');
    expect(src).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    expect(src).toContain('mipmap-anydpi-v26');
    expect(src).toContain('ic_launcher_foreground');
  });

  it('pins the approved artwork the launcher asset is derived from', () => {
    const sha = createHash('sha256').update(readFileSync('public/brand/cineflow-icon-lockup-512.png')).digest('hex');
    expect(sha).toBe('a4c2f5ead489c5533535f65b0075fd7bda32474de9eac50a8ffe32308f6a3982');
    // and the launcher asset is not a copy of it (it is a re-laid-out composition)
    const launcherBand = readPng(LAUNCHER);
    expect(launcherBand.height).toBe(1024);
    expect(readPng('public/brand/cineflow-icon-lockup-512.png').height).toBe(512);
  });

  it('the gate script exists and is wired into the release workflow', () => {
    const wf = readFileSync('.github/workflows/release-android-apk.yml', 'utf8');
    expect(wf).toContain('verify-apk-launcher-composition.mjs');
    expect(wf.indexOf('Launcher icon composition gate')).toBeLessThan(wf.indexOf('APK security gate (fail-closed pre-publish scan)'));
  });
});
