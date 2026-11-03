/**
 * Launcher-icon fidelity gate.
 *
 * HISTORY, because it explains the shape of this file:
 *  - 0.2.4 shipped the full lockup and still read as the symbol alone: the
 *    three-element stack was fitted into Android's 66/108 adaptive safe circle,
 *    which put the 37:1 tagline at ~1.3px. A file-count check could not see that.
 *  - 0.2.5 re-laid the tagline one word per line so it could be read. The owner
 *    rejected that: the supplied logo is the single source of truth and must not
 *    be rearranged, redrawn or re-coloured.
 *
 * So the gate no longer counts bands or demands a particular arrangement. It
 * compares the packed icon against a SIGNATURE computed from the supplied
 * original artwork, and fails when the packaged launcher resources stop being
 * that artwork:
 *   - wrong number of ink bands (a symbol-only icon, or a rearranged one);
 *   - content aspect drifting from the source aspect (stretched / squashed);
 *   - band proportions drifting from the source (cropped, re-laid, rescaled
 *     parts, a different logo altogether);
 *   - the standard and the round icon disagreeing with each other.
 *
 * Usage:
 *   node scripts/verify-apk-launcher-composition.mjs --apk dist/apk/X.apk
 *   node scripts/verify-apk-launcher-composition.mjs --image icon.png
 *   node scripts/verify-apk-launcher-composition.mjs --signature icon.png
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApk } from './lib/apk-zip.mjs';
import { readPng, bands } from './lib/png-bands.mjs';

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
export const REQUIRED = [
  'res/mipmap-anydpi-v26/ic_launcher.xml',
  'res/mipmap-anydpi-v26/ic_launcher_round.xml',
  ...DENSITIES.flatMap((d) => [
    `res/mipmap-${d}-v4/ic_launcher.png`,
    `res/mipmap-${d}-v4/ic_launcher_round.png`,
    `res/mipmap-${d}-v4/ic_launcher_foreground.png`,
  ]),
];

/** Tolerances: raster rounding at 144-192px is coarse, a different logo is not. */
export const ASPECT_TOLERANCE = 0.06;
export const BAND_FRACTION_TOLERANCE = 0.35;

/** Composite RGBA over white first: a transparent foreground must be judged as drawn. */
export function flatten(img) {
  if (img.channels < 4) return img;
  const { width, height, channels, data } = img;
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
    const a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[j + c] = Math.round(data[i + c] * a + 255 * (1 - a));
  }
  return { width, height, channels: 3, data: out };
}

/** Area-average down to a fixed working height so the signature does not depend on density. */
export function normalise(img, targetH = 256) {
  const { width, height, channels, data } = img;
  if (height <= targetH) return img;
  const scale = height / targetH;
  const w = Math.max(1, Math.round(width / scale));
  const out = Buffer.alloc(w * targetH * channels);
  for (let y = 0; y < targetH; y++) {
    const y0 = Math.floor(y * scale), y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * scale), x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      let n = 0;
      const acc = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * channels;
          for (let c = 0; c < channels; c++) acc[c] += data[i + c];
          n++;
        }
      }
      const j = (y * w + x) * channels;
      for (let c = 0; c < channels; c++) out[j + c] = Math.round(acc[c] / n);
    }
  }
  return { width: w, height: targetH, channels, data: out };
}

function cornerBg(img) {
  const { width, height, channels, data } = img;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const all = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)].flat().sort((a, b) => a - b);
  const m = all[Math.floor(all.length / 2)];
  return [m, m, m];
}

function inkCounts(img) {
  const { width, height, channels, data } = img;
  const bg = cornerBg(img);
  const rows = new Array(height).fill(0);
  const cols = new Array(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (d > 60) { rows[y]++; cols[x]++; }
    }
  }
  return { rows, cols, width, height };
}

/** Artwork signature: content box aspect plus each ink band as a share of content height. */
export function signature(rawImg, label = 'artwork') {
  const img = normalise(flatten(rawImg), 256);
  const { rows, cols, width, height } = inkCounts(img);
  const rowInk = (r) => rows[r] / width > 0.0015;
  const firstRow = rows.findIndex((_, i) => rowInk(i));
  const lastRow = height - 1 - [...rows].reverse().findIndex((_, i) => rowInk(height - 1 - i));
  const firstCol = cols.findIndex((v) => v / height > 0.0015);
  const lastCol = width - 1 - [...cols].reverse().findIndex((v) => v / height > 0.0015);
  const contentH = lastRow - firstRow + 1;
  const contentW = lastCol - firstCol + 1;
  const all = bands(img, { threshold: 0.0015, gapFraction: 0.002 });
  const inner = all.filter((b) => b.y1 >= firstRow && b.y0 <= lastRow);
  return {
    label,
    bands: inner.length,
    aspect: contentW / contentH,
    fractions: inner.map((b) => b.height / contentH),
    content: { w: contentW, h: contentH, x: firstCol, y: firstRow },
    width,
    height,
  };
}

export function compareToSource(sig, source) {
  const problems = [];
  if (sig.bands !== source.bands) {
    problems.push(
      `${sig.label}: ${sig.bands} ink band(s) vs ${source.bands} in the supplied logo — ` +
        `this is not the approved composition (symbol-only, rearranged, or a different logo)`
    );
  }
  if (Math.abs(sig.aspect - source.aspect) > ASPECT_TOLERANCE) {
    problems.push(
      `${sig.label}: content aspect ${sig.aspect.toFixed(3)} vs ${source.aspect.toFixed(3)} in the source — artwork cropped or distorted`
    );
  }
  const n = Math.min(sig.fractions.length, source.fractions.length);
  for (let i = 0; i < n; i++) {
    const a = sig.fractions[i];
    const b = source.fractions[i];
    if (Math.abs(a - b) > b * BAND_FRACTION_TOLERANCE) {
      problems.push(
        `${sig.label}: element ${i + 1} is ${(a * 100).toFixed(1)}% of the artwork vs ${(b * 100).toFixed(1)}% in the source — element resized or re-laid out`
      );
    }
  }
  return problems;
}

export function sourceSignature(sourcePng) {
  return signature(readPng(sourcePng), 'supplied logo');
}

export function verifyApk(apkPath, sourcePng) {
  const source = sourceSignature(sourcePng);
  const apk = openApk(apkPath);
  const missing = REQUIRED.filter((n) => !apk.has(n));
  const dir = mkdtempSync(join(tmpdir(), 'icon-gate-'));
  const load = (name) => {
    const out = join(dir, name.replace(/[^\w.]/g, '_'));
    writeFileSync(out, apk.read(name));
    return readPng(out);
  };
  const targets = [
    'res/mipmap-xxxhdpi-v4/ic_launcher.png',
    'res/mipmap-xxxhdpi-v4/ic_launcher_round.png',
    'res/mipmap-xxxhdpi-v4/ic_launcher_foreground.png',
    'res/mipmap-xxhdpi-v4/ic_launcher.png',
  ].filter((n) => !missing.includes(n));

  const reports = targets.map((n) => {
    const sig = signature(load(n), n.split('/').pop());
    return { ...sig, path: n, problems: compareToSource(sig, source) };
  });

  // standard vs round must be the same artwork
  const std = reports.find((r) => r.path.endsWith('/ic_launcher.png') && r.path.includes('xxxhdpi'));
  const rnd = reports.find((r) => r.path.endsWith('_round.png'));
  if (std && rnd) {
    if (rnd.bands !== std.bands || Math.abs(rnd.aspect - std.aspect) > ASPECT_TOLERANCE) {
      rnd.problems.push(
        `ic_launcher_round.png does not match ic_launcher.png (${rnd.bands} bands / ${rnd.aspect.toFixed(3)} vs ${std.bands} / ${std.aspect.toFixed(3)})`
      );
    }
  }

  for (const n of ['res/mipmap-anydpi-v26/ic_launcher.xml', 'res/mipmap-anydpi-v26/ic_launcher_round.xml']) {
    if (!missing.includes(n) && apk.read(n).length === 0) missing.push(`${n} (empty)`);
  }

  const problems = [...missing.map((n) => `missing launcher resource: ${n}`), ...reports.flatMap((r) => r.problems)];
  return { apkPath, source, resources: REQUIRED.length - missing.length, reports, missing, problems, ok: problems.length === 0 };
}

const isMain = process.argv[1] && process.argv[1].endsWith('verify-apk-launcher-composition.mjs');
if (isMain) {
  const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const sourcePng = arg('--source') || 'tests/fixtures/cineflow-logo-original.png';
  const image = arg('--image');
  const sigOnly = arg('--signature');
  if (sigOnly) {
    console.log(JSON.stringify(signature(readPng(sigOnly), sigOnly), null, 2));
  } else if (image) {
    const source = sourceSignature(sourcePng);
    const sig = signature(readPng(image), image);
    const problems = compareToSource(sig, source);
    console.log(`  ${image}: ${sig.bands} bands, aspect ${sig.aspect.toFixed(3)} (source ${source.bands} / ${source.aspect.toFixed(3)})`);
    problems.forEach((p) => console.error(`  FAIL ${p}`));
    console.log(problems.length === 0 ? '  PASS artwork matches the supplied logo' : '  FAIL artwork does not match');
    process.exit(problems.length === 0 ? 0 : 1);
  } else {
    const apk = arg('--apk');
    if (!apk) {
      console.error('usage: --apk <file.apk> | --image <file.png> | --signature <file.png>  [--source <png>]');
      process.exit(2);
    }
    const r = verifyApk(apk, sourcePng);
    console.log(`  supplied logo signature: ${r.source.bands} bands, aspect ${r.source.aspect.toFixed(3)}`);
    for (const rep of r.reports) console.log(`  ${rep.label}: ${rep.bands} bands, aspect ${rep.aspect.toFixed(3)}`);
    console.log(`  launcher resources present: ${r.resources}/${REQUIRED.length}`);
    if (!r.ok) {
      r.problems.forEach((p) => console.error(`  FAIL ${p}`));
      console.error('  FAIL packaged APK does not carry the supplied CineFlow logo in its launcher resources');
      process.exit(1);
    }
    console.log('  PASS packaged APK carries the supplied CineFlow logo, unaltered, in every launcher resource');
  }
}
