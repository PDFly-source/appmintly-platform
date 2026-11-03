#!/usr/bin/env node
/**
 * GLOBAL ARTWORK SLOT GATE.
 *
 * Fails if any marketplace surface, app record, or metadata field can size app
 * artwork outside lib/artwork-tokens.ts. This is the mechanism that stops the
 * two regressions we shipped from coming back, and the reason a future app
 * cannot invent its own icon size.
 *
 * Usage: node scripts/audit-artwork-slots.mjs [files...]
 * Exit 1 on any violation; prints `file:line: RULE: message`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TOKENS = 'lib/artwork-tokens.ts';
const DATA_FILES = ['data/apps.json', 'data/upcoming-apps.json', 'data/categories.json'];

/** keys that would let a publisher/catalogue record size its own artwork */
const OVERRIDE_KEYS = /^(brandLockup\w*|iconSize|imageSize|logoSize|artwork\w*|iconWidth|iconHeight|scale|heroWidth)$/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'out' || entry === '.next' || entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx|ts|mjs)$/.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

/** does this source render app artwork at all? */
function rendersArtwork(src) {
  return /<AppArtwork|<AppIcon|app\.icon|\.icon\b/.test(src);
}

const candidateIsBanned = (dyn, src) => !!dyn && !/sizeForSlot\(/.test(src.slice(dyn.index, dyn.index + 120));

export function auditSource(file, src) {
  const v = [];
  const push = (rule, msg) => v.push(`${file}: ${rule}: ${msg}`);
  if (file === TOKENS || file.startsWith('scripts/')) return v;

  const isTokenConsumer = /from '@\/lib\/artwork-tokens'/.test(src);

  // R1 — no arbitrary ratio or bespoke max width on app artwork
  if (rendersArtwork(src)) {
    if (/aspectRatio/.test(src)) push('R1-aspect-override', 'app artwork must not set its own aspect ratio');
    if (/layout=\{?['"]hero['"]/.test(src)) push('R1-hero-layout', 'the bespoke hero/oversized artwork layout is banned');
    if (/(app\.icon|app\.brandLockup|artwork)[^\n]{0,80}object-contain/.test(src)) {
      push('R1-contain-fullwidth', 'app artwork must not be drawn contain-full-width');
    }
    const bespoke = src.match(/max-w-\[(\d{3,})px\][^\n]{0,60}(icon|artwork)/gi) ?? [];
    for (const m of bespoke) push('R1-bespoke-max-width', `bespoke artwork width: ${m}`);

    // R4 — artwork must be drawn by the shared renderer, at a token size
    if (/<img[^>]{0,200}src=\{[^}]*(app\.icon|app\.logo|brandLockup|artwork)/s.test(src)) {
      push('R4-bypass-renderer', 'raw <img> on app artwork bypasses the shared renderer');
    }
    if (/<AppIcon[^>]{0,300}className="[^"]*\bw-\d/s.test(src)) {
      push('R4-bespoke-class-width', 'AppIcon must not receive its own width classes');
    }
    const dyn = src.match(/<AppIcon[^>]{0,300}size=\{(?!sizeForSlot)[^}"']/s);
    if (candidateIsBanned(dyn, src)) push('R4-dynamic-size', 'AppIcon size must be a token literal, not an expression');
    if (/<AppArtwork[^>]{0,300}\ssize=/.test(src)) {
      push('R4-slot-required', 'AppArtwork takes a slot name, not a raw size');
    }
  }

  // R2 — no per-app sizing branch
  if (/(slug|name)\s*===?\s*['"][a-z0-9-]+['"][^\n]{0,120}(className|style|size=)/i.test(src)) {
    push('R2-app-conditional-sizing', 'sizing must never branch on app slug or name');
  }
  if (/isLockup/.test(src)) push('R2-app-conditional-sizing', 'lockup-specific layout branches are banned');

  return v;
}

export function auditData() {
  const v = [];
  for (const rel of DATA_FILES) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) continue;
    const json = JSON.parse(readFileSync(full, 'utf8'));
    const records = Array.isArray(json) ? json : Object.values(json).flat();
    for (const rec of records) {
      if (!rec || typeof rec !== 'object') continue;
      for (const key of Object.keys(rec)) {
        if (OVERRIDE_KEYS.test(key)) v.push(`${rel}: R3-metadata-override: record '${rec.slug ?? rec.name ?? '?'}' carries '${key}'`);
      }
    }
  }
  return v;
}

export function auditAll(files) {
  const targets = files?.length ? files : [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))];
  const violations = [];
  for (const file of targets) {
    if (!/\.(tsx|jsx)$/.test(file)) continue;
    violations.push(...auditSource(file, readFileSync(join(ROOT, file), 'utf8')));
  }
  violations.push(...auditData());
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = auditAll(process.argv.slice(2));
  if (violations.length) {
    console.error(`✖ artwork slot gate: ${violations.length} violation(s)`);
    for (const v of violations) console.error('  ' + v);
    process.exit(1);
  }
  console.log('✓ artwork slot gate: no overrides, all surfaces tokenised');
}
