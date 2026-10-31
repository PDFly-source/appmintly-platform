/**
 * AppMintly 2.0 — SEO/PWA honesty guards.
 *
 * Two production defects are locked here:
 *  1. public/manifest.json hardcoded the GitHub Pages sub-path
 *     (/appmintly-platform/), so a PWA installed from the canonical host
 *     (https://appmintly.pages.dev/) started on a URL that does not exist.
 *  2. app/sitemap.ts stamped EVERY URL with the build clock (`new Date()`),
 *     telling crawlers the whole site changed on every deploy.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../public/manifest.json';
import sitemap from '../app/sitemap';

const root = process.cwd();

describe('PWA manifest is host-agnostic', () => {
  it('does not hardcode the GitHub Pages sub-path', () => {
    const raw = readFileSync(join(root, 'public/manifest.json'), 'utf8');
    expect(raw).not.toContain('/appmintly-platform/');
  });

  it('starts, scopes and identifies itself relative to wherever it is served', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.id).toBe('./');
  });

  it('every declared icon exists in public/', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false); // relative, not host-locked
      expect(existsSync(join(root, 'public', icon.src))).toBe(true);
    }
  });

  it('keeps the installable essentials', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });
});

describe('sitemap dates are content-derived', () => {
  const source = readFileSync(join(root, 'app/sitemap.ts'), 'utf8');
  const entries = sitemap();

  it('never stamps entries with the build clock', () => {
    expect(source).not.toMatch(/lastModified:\s*now/);
    expect(source).not.toContain('const now = new Date()');
  });

  it('produces unique absolute https URLs', () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u.startsWith('https://')).toBe(true);
  });

  it('lists real content dates, not one shared timestamp', () => {
    const stamps = new Set(entries.map((e) => new Date(e.lastModified as Date).toISOString()));
    expect(stamps.size).toBeGreaterThan(1);
  });

  it('includes public surfaces and excludes private ones', () => {
    // Canonical trailing-slash form is environment dependent (static export
    // serves directories), so compare normalised paths.
    const paths = entries.map((e) => new URL(e.url).pathname.replace(/\/$/, ''));
    expect(paths).toContain('/lab');
    expect(paths).toContain('/explore');
    // Publisher routes are limited to the curated public identities.
    const publisherPaths = paths.filter((p) => p.startsWith('/publisher/'));
    for (const p of publisherPaths) {
      expect(['/publisher/pkd', '/publisher/mint-test-lab']).toContain(p);
    }
    expect(paths.some((p) => p.startsWith('/search'))).toBe(false);
    expect(paths.some((p) => p.startsWith('/console'))).toBe(false);
    expect(paths.some((p) => p.startsWith('/api'))).toBe(false);
  });

  it('only lists published apps', () => {
    const urls = entries.map((e) => e.url);
    // distribution-test is an unpublished catalog record
    expect(urls.some((u) => u.includes('/app/distribution-test'))).toBe(false);
  });
});
