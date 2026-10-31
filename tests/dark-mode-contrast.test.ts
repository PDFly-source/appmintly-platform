/**
 * Global theme contract regression guard (dark mode text visibility fix).
 *
 * Root cause of the production defect: components paired the semantic text
 * tokens (text-ink / text-mut, which flip to near-white in dark mode) with a
 * hardcoded `bg-white` surface that never changed. In dark mode that produced
 * white-on-white cards at ~1.17:1. These tests make the token contract
 * enforceable: no hardcoded white surfaces, and the real token values parsed
 * out of globals.css must stay contrast-safe in every theme.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'out') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const FILES = [...sourceFiles('components'), ...sourceFiles('app')].filter(
  (file) => !file.startsWith('app/api')
);

function tokensFor(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} block must exist in globals.css`).toBeGreaterThan(-1);
  const body = CSS.slice(start, CSS.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('no hardcoded white surfaces leak into a theme', () => {
  it('uses bg-card instead of bg-white in every component and page', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      // Solid `bg-white` only; translucent overlays (bg-white/10) sit on dark
      // imagery and are intentional.
      const matches = source.match(/(?<![\w-])bg-white(?![/\w-])/g);
      if (matches) offenders.push(`${file}: ${matches.length}`);
    }
    expect(offenders).toEqual([]);
  });

  it('does not hardcode near-white or black text hexes', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (/text-\[#(?:fff|ffffff|000|000000)\]/i.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every text token paired with a token surface', () => {
    const css = CSS;
    for (const token of ['--c-page', '--c-card', '--c-ink', '--c-mut', '--c-line', '--c-inkbg']) {
      // Defined in the light root and overridden in both dark variants.
      const count = css.split(token + ':').length - 1;
      expect(count, `${token} should be defined for root + dark + amoled`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('semantic token contrast in each theme', () => {
  const themes: Array<[string, string]> = [
    ['light', ':root'],
    ['dark', '.dark'],
    ['amoled', '.amoled'],
  ];

  for (const [name, selector] of themes) {
    it(`${name}: primary and secondary text clear WCAG AA on both surfaces`, () => {
      const tokens = tokensFor(selector);
      // inkbg is an inverted (dark) surface in every theme, so it is paired
      // with inverted light text rather than with text-ink.
      const surfaces = ["card", "page"];
      for (const surface of surfaces) {
        const bg = tokens[surface];
        expect(bg, `${name} ${surface} token`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(contrast(tokens.ink, bg), `${name}: ink on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.mut, bg), `${name}: mut on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      // Inverted surfaces must carry readable light text.
      expect(contrast('#FFFFFF', tokens.inkbg), `${name}: white on inkbg`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: borders are visible but not loud against the page`, () => {
      const tokens = tokensFor(selector);
      const ratio = contrast(tokens.line, tokens.page);
      expect(ratio).toBeGreaterThan(1.03);
      expect(ratio).toBeLessThan(4.5);
    });
  }

  it('accent foreground tokens clear AA against their real fills and surfaces', () => {
    const fills: Record<string, string> = {
      brandRed: '#E8503D',
      tealLight: '#0F766E',
      tealDark: '#14B8A6',
      green: '#14B8A6',
    };
    const expectations: Array<[string, string, string, string]> = [
      // [theme, token, fill key, minimum]
      ['light', 'on-brand', 'brandRed', '4.5'],
      ['dark', 'on-brand', 'brandRed', '4.5'],
      ['amoled', 'on-brand', 'brandRed', '4.5'],
      ['light', 'on-cta', 'tealLight', '4.5'],
      ['dark', 'on-cta', 'tealDark', '4.5'],
      ['amoled', 'on-cta', 'tealDark', '4.5'],
      ['dark', 'on-success', 'green', '4.5'],
    ];
    const selectors: Record<string, string> = { light: ':root', dark: '.dark', amoled: '.amoled' };
    for (const [theme, token, fill, min] of expectations) {
      const value = tokensFor(selectors[theme])[token];
      expect(value, `${theme} --c-${token} must exist`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(contrast(value, fills[fill]), `${theme} --c-${token} on ${fills[fill]}`).toBeGreaterThanOrEqual(
        Number(min)
      );
    }
    // Accent text used ON surfaces (links, success badges, error text).
    for (const [theme, selector] of Object.entries(selectors)) {
      const tokens = tokensFor(selector);
      for (const token of ['link-text', 'success-text', 'accent-text']) {
        for (const surface of ['card', 'page']) {
          const ratio = contrast(tokens[token], tokens[surface]);
          expect(ratio, `${theme} --c-${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('never puts white text on a brand accent fill', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
        const cls = `${match[1] ?? ''} ${match[2] ?? ''}`;
        if (!/\btext-white\b/.test(cls)) continue;
        if (/bg-forge-red|bg-forge-green|bg-forge-gold|bg-forge-orange|btn-cta|bg-cta/.test(cls)) {
          offenders.push(`${file}: ${cls.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not use raw brand accents as text colours', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const matches = source.match(/(?<![\w-])text-forge-(blue|green)(?![\w-])/g);
      if (matches) offenders.push(`${file}: ${matches.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('dark and light are genuinely different surfaces', () => {
    const light = tokensFor(':root');
    const dark = tokensFor('.dark');
    expect(luminance(dark.page)).toBeLessThan(0.05);
    expect(luminance(light.page)).toBeGreaterThan(0.8);
    // Text must flip with the surface, never stay fixed.
    expect(luminance(dark.ink)).toBeGreaterThan(0.7);
    expect(luminance(light.ink)).toBeLessThan(0.1);
  });
});
