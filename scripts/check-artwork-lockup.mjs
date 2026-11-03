#!/usr/bin/env node
/**
 * ARTWORK LOCKUP GATE — enforces the declared artwork policy on real pixels.
 *
 * For every app that declares `artworkPolicy: "full-lockup"`, the asset must be
 * square and must contain ink inside each declared element box (symbol,
 * wordmark, tagline), in that vertical order. This is what stops a full-lockup
 * app from silently shipping a symbol, a cropped asset, or a stretched one.
 *
 * Run standalone: node scripts/check-artwork-lockup.mjs
 * Also invoked by scripts/audit-artwork-slots.mjs (npm run audit:artwork).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPng } from './lib/png-bands.mjs';

const ROOT = process.cwd();
const ELEMENTS = ['symbol', 'wordmark', 'tagline'];
const MIN_COVERAGE = { symbol: 0.08, wordmark: 0.04, tagline: 0.02 };

export function inkCoverageInBox(img, [x0, y0, x1, y1]) {
  const { width, height, channels, data } = img;
  let ink = 0, total = 0;
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
      const i = (y * width + x) * channels;
      const d = Math.abs(data[i] - 255) + Math.abs(data[i + 1] - 255) + Math.abs(data[i + 2] - 255);
      if (d > 60) ink++;
      total++;
    }
  }
  return total ? ink / total : 0;
}

export function checkAppLockup(slug, app, manifests) {
  const violations = [];
  const policy = app.artworkPolicy ?? 'symbol-only';
  if (!['full-lockup', 'symbol-only'].includes(policy)) {
    violations.push(`${slug}: POLICY-INVALID: artworkPolicy '${policy}' is not one of full-lockup|symbol-only`);
    return violations;
  }
  if (policy !== 'full-lockup') return violations;

  const manifest = manifests[slug];
  if (!manifest) {
    violations.push(`${slug}: LOCKUP-MANIFEST-MISSING: full-lockup app has no entry in data/artwork-lockups.json`);
    return violations;
  }
  if (manifest.policy !== 'full-lockup') {
    violations.push(`${slug}: POLICY-MISMATCH: manifest policy '${manifest.policy}' contradicts app record`);
  }
  const file = join(ROOT, 'public', String(app.icon || '').replace(/^\//, ''));
  if (!app.icon || !existsSync(file)) {
    violations.push(`${slug}: ASSET-MISSING: ${app.icon}`);
    return violations;
  }
  let img;
  try { img = readPng(file); } catch (e) {
    violations.push(`${slug}: ASSET-UNREADABLE: ${e.message}`);
    return violations;
  }
  if (Math.abs(manifest.width - img.width) > 0 || Math.abs(manifest.height - img.height) > 0) {
    violations.push(`${slug}: ASSET-CHANGED: manifest says ${manifest.width}x${manifest.height}, asset is ${img.width}x${img.height}`);
  }
  if (Math.abs(img.width / img.height - 1) > 0.01) {
    violations.push(`${slug}: NOT-SQUARE: ${img.width}x${img.height} would distort inside the square slot`);
  }
  const boxes = manifest.elements || {};
  const present = [];
  for (const el of ELEMENTS) {
    const box = boxes[el];
    if (!box) { violations.push(`${slug}: ELEMENT-UNDECLARED: ${el}`); continue; }
    const [x0, y0, x1, y1] = box;
    const inside = x0 >= 0 && y0 >= 0 && x1 < img.width && y1 < img.height && x1 > x0 && y1 > y0;
    if (!inside) { violations.push(`${slug}: ELEMENT-OUTSIDE: ${el} box ${box} is outside the ${img.width}x${img.height} asset (cropped?)`); continue; }
    const cov = inkCoverageInBox(img, box);
    if (cov < MIN_COVERAGE[el]) {
      violations.push(`${slug}: ELEMENT-MISSING: ${el} box coverage ${(cov * 100).toFixed(1)}% < ${(MIN_COVERAGE[el] * 100).toFixed(0)}% (element absent or cropped)`);
    } else {
      present.push({ el, y0, y1, cov });
    }
  }
  for (let i = 1; i < present.length; i++) {
    if (present[i].y0 <= present[i - 1].y1) {
      violations.push(`${slug}: ELEMENT-ORDER: ${present[i].el} is not below ${present[i - 1].el}`);
    }
  }
  if (present.length === ELEMENTS.length) {
    const tag = present[ELEMENTS.length - 1];
    if (tag.el !== 'tagline') violations.push(`${slug}: ELEMENT-ORDER: tagline must be the bottom-most element`);
  }
  return violations;
}

export function auditLockups() {
  const apps = JSON.parse(readFileSync(join(ROOT, 'data/apps.json'), 'utf8'));
  const manifestPath = join(ROOT, 'data/artwork-lockups.json');
  const manifests = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const violations = [];
  for (const app of apps) violations.push(...checkAppLockup(app.slug, app, manifests));

  // Upcoming/Lab cards render through the same token system, so they must obey
  // the same artwork policy: no upcoming app may bypass it on its way to publish.
  const upcomingPath = join(ROOT, 'data/upcoming-apps.json');
  if (existsSync(upcomingPath)) {
    const upcoming = JSON.parse(readFileSync(upcomingPath, 'utf8'));
    const records = Array.isArray(upcoming) ? upcoming : Object.values(upcoming).flat();
    for (const rec of records) {
      if (!rec || typeof rec !== 'object') continue;
      const key = rec.slug ?? rec.id;
      const asApp = { ...rec, icon: rec.icon ?? rec.logo };
      violations.push(...checkAppLockup(`upcoming:${key}`, asApp, manifests));
    }
  }
  // a manifest for an app that is not in the catalogue is dead config
  for (const slug of Object.keys(manifests)) {
    if (!apps.some((a) => a.slug === slug)) violations.push(`${slug}: MANIFEST-ORPHAN: not in data/apps.json`);
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const v = auditLockups();
  if (v.length) { console.error(`✖ lockup gate: ${v.length} violation(s)`); for (const x of v) console.error('  ' + x); process.exit(1); }
  console.log('✓ lockup gate: every full-lockup app carries symbol, wordmark and tagline');
}
