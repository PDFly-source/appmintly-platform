import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { readPng } from '../scripts/lib/png-bands.mjs';
import {
  signature,
  sourceSignature,
  compareToSource,
  REQUIRED,
  ASPECT_TOLERANCE,
} from '../scripts/verify-apk-launcher-composition.mjs';

/**
 * [launcher-icon-fidelity] The owner's rule (2026-11-03) is that the supplied
 * CineFlow logo is the single source of truth: the Android launcher must carry the
 * complete artwork — symbol, wordmark, gradients, single-line tagline — with its
 * original layout. 0.2.5 re-laid the tagline into three lines for legibility and
 * was rejected for it, so these tests pin FIDELITY, not readability.
 */

const ROOT = process.cwd();
const SOURCE = `${ROOT}/tests/fixtures/cineflow-logo-original.png`;
const LAUNCHER = `${ROOT}/tests/fixtures/cineflow-launcher-1024.png`;

/** Minimal PNG writer for negative controls. */
function png(width: number, height: number, paint: (x: number, y: number) => number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const v = paint(x, y);
      row[1 + x * 3] = v; row[2 + x * 3] = v; row[3 + x * 3] = v;
    }
    rows.push(row);
  }
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body) >>> 0);
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const write = (name: string, buf: Buffer) => {
  const p = `/tmp/${name}-${process.pid}.png`;
  writeFileSync(p, buf);
  return readPng(p);
};

describe('CineFlow launcher icon: fidelity to the supplied logo', () => {
  const source = sourceSignature(SOURCE);

  it('the supplied logo is the signature of record: one artwork block plus the tagline line', () => {
    expect(source.bands).toBe(2);
    expect(source.fractions[1]).toBeLessThan(0.06); // the tagline is a thin line, as drawn
    expect(source.aspect).toBeGreaterThan(0.9);
    expect(source.aspect).toBeLessThan(1.1);
  });

  it('the committed launcher asset is the supplied artwork, unchanged', () => {
    const sig = signature(readPng(LAUNCHER), 'launcher');
    expect(compareToSource(sig, source)).toEqual([]);
    expect(Math.abs(sig.aspect - source.aspect)).toBeLessThan(ASPECT_TOLERANCE);
    expect(sig.fractions[0]).toBeCloseTo(source.fractions[0], 1);
  });

  it('fails a symbol-only icon (the 0.2.3 shape)', () => {
    const sig = signature(write('symbol-only', png(192, 192, (x, y) =>
      Math.hypot(x - 96, y - 96) < 60 ? 20 : 255)), 'symbol-only');
    const problems = compareToSource(sig, source);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toMatch(/band/);
  });

  it('fails a rearranged icon (the 0.2.5 shape: tagline stacked on three lines)', () => {
    const sig = signature(write('rearranged', png(192, 192, (x, y) => {
      const inArt = x > 24 && x < 168 && y > 20 && y < 172;
      const bands = [[30, 74], [86, 104], [116, 128], [136, 148], [156, 168]];
      return inArt && bands.some(([a, b]) => y >= a && y <= b) ? 20 : 255;
    })), 'rearranged');
    const problems = compareToSource(sig, source);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toMatch(/band|re-laid|resized/);
  });

  it('fails artwork that has been stretched', () => {
    // same structure as the source, but twice as wide: aspect must catch it
    const sig = signature(write('stretched', png(320, 160, (x, y) => {
      const inArt = x > 10 && x < 310 && y > 10 && y < 150;
      const bands = [[10, 120], [140, 148]];
      return inArt && bands.some(([a, b]) => y >= a && y <= b) ? 20 : 255;
    })), 'stretched');
    expect(compareToSource(sig, source).join(' ')).toMatch(/aspect/);
  });

  it('keeps every launcher resource in the requirement list', () => {
    expect(REQUIRED).toHaveLength(17);
    expect(REQUIRED).toContain('res/mipmap-anydpi-v26/ic_launcher.xml');
    expect(REQUIRED).toContain('res/mipmap-anydpi-v26/ic_launcher_round.xml');
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      expect(REQUIRED).toContain(`res/mipmap-${d}-v4/ic_launcher.png`);
      expect(REQUIRED).toContain(`res/mipmap-${d}-v4/ic_launcher_round.png`);
      expect(REQUIRED).toContain(`res/mipmap-${d}-v4/ic_launcher_foreground.png`);
    }
  });

  it('keeps the builder pointed at the adaptive and round mipmaps', () => {
    const src = readFileSync('lib/apk-builder.ts', 'utf8');
    expect(src).toContain('android:icon="@mipmap/ic_launcher"');
    expect(src).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    expect(src).toContain('mipmap-anydpi-v26');
    expect(src).toContain('ic_launcher_foreground');
  });

  it('runs the gate on the packaged APK before anything is published', () => {
    const wf = readFileSync('.github/workflows/release-android-apk.yml', 'utf8');
    expect(wf).toContain('verify-apk-launcher-composition.mjs');
    expect(wf.indexOf('Launcher icon composition gate')).toBeLessThan(
      wf.indexOf('APK security gate (fail-closed pre-publish scan)')
    );
    expect(wf.indexOf('Launcher icon composition gate')).toBeLessThan(
      wf.indexOf('Publish APK to the public distribution repository')
    );
  });
});
