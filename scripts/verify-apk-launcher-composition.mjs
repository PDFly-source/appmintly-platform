/**
 * Launcher-icon composition gate.
 *
 * WHAT WENT WRONG IN 0.2.4 (why this file exists): the release flow proved the
 * launcher icon by counting files — 17 resources, adaptive XMLs present — and the
 * APK did contain the full lockup. But the lockup is a 37:1 tagline under a 5.4:1
 * wordmark; Android's 66/108 adaptive safe circle forced the whole three-element
 * stack down to ~43% of the tile, leaving the tagline about 1.3px at a 144px
 * launcher tile. On a phone that reads as the symbol alone, which is exactly what
 * the owner saw in the installer dialog. File counts cannot catch that.
 *
 * WHAT THIS GATE ASSERTS, on the bytes inside the packaged APK:
 *   1. the 17 launcher resources exist (2 adaptive XMLs + 5 densities x 3 PNGs);
 *   2. the adaptive foreground and the legacy launcher icon each carry the whole
 *      vertical stack — symbol, wordmark, tagline lines — measured as separated
 *      ink bands, not as metadata;
 *   3. a symbol-only icon fails loudly instead of shipping.
 *
 * Usage: node scripts/verify-apk-launcher-composition.mjs --apk dist/apk/X.apk
 *        node scripts/verify-apk-launcher-composition.mjs --image icon.png
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApk } from './lib/apk-zip.mjs';
import { readPng, bands } from './lib/png-bands.mjs';

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const REQUIRED = [
  'res/mipmap-anydpi-v26/ic_launcher.xml',
  'res/mipmap-anydpi-v26/ic_launcher_round.xml',
  ...DENSITIES.flatMap((d) => [
    `res/mipmap-${d}-v4/ic_launcher.png`,
    `res/mipmap-${d}-v4/ic_launcher_round.png`,
    `res/mipmap-${d}-v4/ic_launcher_foreground.png`,
  ]),
];

/** Minimum separated ink bands for a full lockup stack: symbol, wordmark, tagline lines. */
export const MIN_BANDS = 4;

/**
 * Flatten RGBA artwork onto white before measuring.
 *
 * The adaptive foreground is transparent outside the trimmed art, and our art
 * carries a white plate. Reading transparency as "background" made the plate one
 * solid ink band and hid the real stack (the first 0.2.5 attempt failed exactly
 * that way), so measure what the launcher actually composites.
 */
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

export function analyseIcon(rawImg, label = 'icon') {
  const img = flatten(rawImg);
  const b = bands(img, { threshold: 0.002, gapFraction: 0.002 });
  const heights = b.map((x) => x.height);
  const total = img.height;
  const problems = [];
  if (b.length < MIN_BANDS) {
    problems.push(
      `${label}: only ${b.length} ink band(s) (${heights.join('+')}) — that is a symbol-only icon, not the ` +
        `symbol + wordmark + tagline composition`
    );
  }
  // the two smallest bands should be the tagline lines, below the wordmark
  if (b.length >= 3) {
    const smallest = [...heights].sort((a, z) => a - z)[0];
    if (smallest / total > 0.35) problems.push(`${label}: no distinct small text band (smallest is ${smallest}px)`);
  }
  return { label, bands: b.length, heights, problems, ok: problems.length === 0 };
}

export function verifyApk(apkPath) {
  const apk = openApk(apkPath);
  const missing = REQUIRED.filter((n) => !apk.has(n));
  const dir = mkdtempSync(join(tmpdir(), 'icon-gate-'));
  const reports = [];
  for (const name of [
    'res/mipmap-xxxhdpi-v4/ic_launcher.png',
    'res/mipmap-xxxhdpi-v4/ic_launcher_foreground.png',
    'res/mipmap-xxhdpi-v4/ic_launcher.png',
  ]) {
    if (missing.includes(name)) continue;
    const out = join(dir, name.split('/').pop() + reports.length);
    writeFileSync(out, apk.read(name));
    reports.push(analyseIcon(readPng(out), name.split('/').pop()));
  }
  for (const n of ['res/mipmap-anydpi-v26/ic_launcher.xml', 'res/mipmap-anydpi-v26/ic_launcher_round.xml']) {
    if (!missing.includes(n) && apk.read(n).length === 0) missing.push(`${n} (empty)`);
  }
  const problems = [...missing.map((n) => `missing launcher resource: ${n}`), ...reports.flatMap((r) => r.problems)];
  return { apkPath, resources: REQUIRED.length - missing.length, reports, missing, problems, ok: problems.length === 0 };
}

const isMain = process.argv[1] && process.argv[1].endsWith('verify-apk-launcher-composition.mjs');
if (isMain) {
  const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const apk = arg('--apk');
  const image = arg('--image');
  if (image) {
    const r = analyseIcon(readPng(image), image);
    console.log(`  ${r.label}: ${r.bands} bands (${r.heights.join(' + ')})`);
    r.problems.forEach((p) => console.error(`  FAIL ${p}`));
    console.log(r.ok ? '  PASS launcher composition carries symbol + wordmark + tagline' : '  FAIL icon composition');
    process.exit(r.ok ? 0 : 1);
  }
  if (!apk) {
    console.error('usage: --apk <file.apk> | --image <file.png>');
    process.exit(2);
  }
  const r = verifyApk(apk);
  for (const rep of r.reports) console.log(`  ${rep.label}: ${rep.bands} bands (${rep.heights.join(' + ')})`);
  console.log(`  launcher resources present: ${r.resources}/${REQUIRED.length}`);
  if (!r.ok) {
    r.problems.forEach((p) => console.error(`  FAIL ${p}`));
    console.error('  FAIL packaged APK does not carry the approved CineFlow launcher composition');
    process.exit(1);
  }
  console.log('  PASS packaged APK carries symbol + wordmark + tagline in the launcher resources');
}
