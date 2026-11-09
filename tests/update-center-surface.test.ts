import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Work 2 — the Update Center surface contract.
 *
 * The design was supplied as a standalone HTML mock. Porting it must not
 * re-introduce a second implementation of anything AppMintly already owns: the
 * version rules, the watch list, the browser's download records and the
 * palette all have exactly one home. These checks are static on purpose so a
 * future copy/paste of the mock fails here instead of in production.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const surface = read('app/updates/UpdateCenter.tsx');
const route = read('app/updates/page.tsx');
const css = read('app/updates/updates.css');

describe('Update Center uses the existing production model', () => {
  it('reads versions, notes, history and buckets from lib/updates/model', () => {
    for (const symbol of [
      'buildUpdateCenter',
      'releaseNotesFor',
      'versionHistoryFor',
      'webUpdateHint',
      'latestVersionOf',
    ]) {
      expect(surface).toContain(symbol);
    }
    expect(surface).toMatch(/from '@\/lib\/updates\/model'/);
  });

  it('reads this browser’s records and the watch list from their own stores', () => {
    expect(surface).toMatch(/from '@\/lib\/app-installs'/);
    expect(surface).toMatch(/from '@\/lib\/updates\/watch'/);
    expect(surface).toContain('knownLocalVersion');
    expect(surface).toContain('getInstallRecord');
    expect(surface).toContain('useWatchList');
  });

  it('invents no storage key of its own', () => {
    // The two production stores are the only writers.
    expect(surface).not.toMatch(/localStorage\s*\.\s*(get|set)Item/);
    expect(surface).not.toContain('appmintly.updates.watched');
    expect(surface).not.toContain('appmintly.updates.downloaded');
  });

  it('never re-implements version comparison', () => {
    // compareVersions belongs to the notification engine; the model wraps it.
    expect(surface).not.toContain('compareVersions');
    expect(surface).not.toMatch(/split\('\.'\)[\s\S]{0,80}parseInt/);
  });

  it('opens the real APK install sheet instead of linking a demo asset', () => {
    expect(surface).toContain('ApkInstallSheet');
    expect(surface).not.toContain('data-m=');
    expect(surface).not.toMatch(/href=\{app\.apkUrl/);
  });
});

describe('Update Center states are honest', () => {
  it('keeps the three published-catalog states distinct', () => {
    expect(surface).toContain("'UPDATE AVAILABLE'");
    expect(surface).toContain("'UP TO DATE'");
    expect(surface).toContain("'NOT DOWNLOADED HERE'");
  });

  it('does not claim notifications or downloads happened', () => {
    expect(surface).not.toContain('Notification.requestPermission');
    expect(surface).not.toMatch(/Downloading v/);
    expect(surface).toContain('No earlier releases recorded in the catalog.');
    expect(surface).toContain('No release notes were published for this version.');
  });

  it('lists only published catalog records', () => {
    expect(surface).toMatch(/APPS\.filter\(\(a\) => a\.published === true\)/);
  });
});

describe('Update Center integrates the Work 1 palette', () => {
  it('scopes the design tokens on the container, never on :root', () => {
    // The shipped defect: `.uc-root :root` matches nothing, so every var()
    // in the ported stylesheet resolved to nothing.
    expect(css).not.toMatch(/\.uc-root\s*:root\s*\{/);
    expect(css).toMatch(/\.uc-root\{[\s\S]*?--bg:var\(--c-page\)/);
  });

  it('takes its colours from the published theme tokens, not a private palette', () => {
    for (const alias of ['--bg:var(--c-page)', '--tx:var(--c-ink)', '--mu:var(--c-mut)', '--bd:var(--c-line)']) {
      expect(css).toContain(alias);
    }
    expect(css).toContain('--fo1:var(--c-cta-hover)');
    expect(css).toContain('--actx:var(--c-on-cta)');
    // The mock's hardcoded dark palette must be gone.
    expect(css.toLowerCase()).not.toContain('#06130e');
    expect(css.toLowerCase()).not.toContain('#0d2019');
    expect(css.toLowerCase()).not.toContain('--hl:rgba(75,224,143');
  });

  it('keeps keyframes at top level so they are not scoped away', () => {
    expect(css).not.toMatch(/\.uc-root\s*@keyframes/);
    expect(css).toContain('@keyframes uc-pl');
    expect(css).toContain('@keyframes uc-sh');
  });

  it('drives the pills with the engine, adding no theme storage', () => {
    expect(surface).toMatch(/from '@\/lib\/appearance\/themes'/);
    expect(surface).toContain('THEMES');
    expect(surface).toContain('applyThemeToDocument');
    expect(surface).not.toContain('writeStoredTheme');
    expect(surface.toLowerCase()).not.toContain('appmintly.public.theme');
  });
});

describe('Update Center keeps its route contract', () => {
  it('publishes title, canonical and crawlable metadata', () => {
    expect(route).toContain('canonical: `${SITE_URL}updates${CANONICAL_TRAILING_SLASH}`');
    expect(route).toContain('robots: { index: true, follow: true }');
    expect(route).toContain('title:');
  });

  it('inlines the ported stylesheet at build time', () => {
    expect(route).toContain("'updates.css'");
    expect(route).toContain('UpdateCenter css={css}');
  });
});
