/**
 * Appearance — palette contract for the public surface.
 *
 * These assertions are deliberately about numbers and invariants, not strings:
 * a palette that fails WCAG AA on its own surfaces is a bug, not a taste call.
 * Contrast is computed with the WCAG relative-luminance formula.
 */
import { describe, expect, it } from 'vitest';
import {
  appearanceInitScript,
  DEFAULT_THEME,
  isThemeId,
  publicThemeUrl,
  readPublishedTheme,
  resolveTheme,
  STORAGE_KEYS,
  THEMES,
  THEME_IDS,
  themeById,
} from '@/lib/appearance/themes';

const hex = (value: string) => {
  const v = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};

const luminance = (value: string) => {
  const [r, g, b] = hex(value).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** The semantic pairs the public site actually paints text with. */
const TOKENS: Record<string, { page: string; card: string; ink: string; mut: string; cta: string; onCta: string }> = {
  emerald: { page: '#06130E', card: '#0D2019', ink: '#EFFAF3', mut: '#A8CFBB', cta: '#22C55E', onCta: '#04210F' },
  sapphire: { page: '#0A1226', card: '#111C3D', ink: '#F2F5FF', mut: '#AFC0E0', cta: '#2563EB', onCta: '#FFFFFF' },
  ruby: { page: '#17060B', card: '#24090F', ink: '#FBEDEF', mut: '#DCBBC1', cta: '#DC2626', onCta: '#FFFFFF' },
  champagne: { page: '#F7F1E4', card: '#FFFDF8', ink: '#26201A', mut: '#635744', cta: '#B0812F', onCta: '#26201A' },
  obsidian: { page: '#0B0B0F', card: '#16161D', ink: '#F4F5F8', mut: '#A6A9B8', cta: '#E9EBF2', onCta: '#0B0B0F' },
  amethyst: { page: '#120A1F', card: '#1D1133', ink: '#F3EBFF', mut: '#C0AEDC', cta: '#8B5CF6', onCta: '#120619' },
  copper: { page: '#140D09', card: '#221410', ink: '#FBEEE6', mut: '#D3B4A2', cta: '#C2703D', onCta: '#1A0C05' },
  aurora: { page: '#071318', card: '#0E2130', ink: '#EAF6FA', mut: '#A2C4CE', cta: '#14B8A6', onCta: '#04201C' },
  platinum: { page: '#F4F5F7', card: '#FFFFFF', ink: '#14161A', mut: '#5A6270', cta: '#1F2937', onCta: '#FFFFFF' },
  sakura: { page: '#FDF2F4', card: '#FFF9FA', ink: '#2A1418', mut: '#77555C', cta: '#BE123C', onCta: '#FFFFFF' },
};

describe('palette registry', () => {
  it('ships exactly the ten approved themes, in picker order', () => {
    expect(THEME_IDS).toEqual([
      'emerald', 'sapphire', 'ruby', 'champagne',
      'obsidian', 'amethyst', 'copper', 'aurora', 'platinum', 'sakura',
    ]);
    expect(THEMES).toHaveLength(10);
  });

  it('keeps exactly three light palettes', () => {
    expect(THEMES.filter((t) => t.light).map((t) => t.id)).toEqual(['champagne', 'platinum', 'sakura']);
  });

  it('has a swatch for every palette and no duplicate labels', () => {
    for (const theme of THEMES) {
      expect(theme.swatch.page).toMatch(/^#[0-9A-F]{6}$/i);
      expect(theme.swatch.surface).toMatch(/^#[0-9A-F]{6}$/i);
      expect(theme.swatch.accent).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(new Set(THEMES.map((t) => t.label)).size).toBe(10);
  });

  it('keeps the shipped default theme resolvable', () => {
    expect(themeById(DEFAULT_THEME).id).toBe(DEFAULT_THEME);
  });
});

describe('contrast', () => {
  it.each(THEME_IDS)('%s clears WCAG AA for body, muted and CTA text', (id) => {
    const t = TOKENS[id];
    expect(contrast(t.ink, t.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.mut, t.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onCta, t.cta)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.ink, t.page)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('resolution and validation', () => {
  it('prefers a valid query value, then storage, then the fallback', () => {
    expect(resolveTheme('ruby', 'emerald').source).toBe('query');
    expect(resolveTheme(null, 'emerald').source).toBe('stored');
    expect(resolveTheme(null, null)).toEqual({ theme: 'sapphire', source: 'default' });
  });

  it('refuses anything that is not one of the ten ids', () => {
    for (const bad of ['amber', '', 'EMERALD', 'emerald ', 'red;background:url(x)', null, undefined, 42]) {
      expect(isThemeId(bad)).toBe(false);
    }
    expect(resolveTheme('"><script>', 'javascript:alert(1)').theme).toBe('sapphire');
  });
});

describe('published default (data/appearance.json)', () => {
  it('accepts only a real palette id', () => {
    expect(readPublishedTheme({ theme: 'champagne' })).toBe('champagne');
    expect(readPublishedTheme({ theme: 'amber' })).toBe(null);
    expect(readPublishedTheme({ theme: '' })).toBe(null);
    expect(readPublishedTheme({})).toBe(null);
    expect(readPublishedTheme(null)).toBe(null);
    expect(readPublishedTheme('champagne')).toBe(null);
  });

  it('treats null as "keep the shipped look"', () => {
    expect(readPublishedTheme({ theme: null })).toBe(null);
  });

  it('ships a config file the console can publish into', async () => {
    // The file is committed by the Publisher console, so its value is a moving
    // target: either a real palette id or null (keep the shipped look). What
    // must never ship is an invalid id, which would silently unpublish the site.
    const cfg = (await import('@/data/appearance.json')).default as { theme: unknown };
    expect(cfg.theme === null || isThemeId(cfg.theme)).toBe(true);
  });
});

describe('persistence contract', () => {
  it('uses a distinct key per surface', () => {
    expect(STORAGE_KEYS.public).not.toBe(STORAGE_KEYS.publisher);
    expect(STORAGE_KEYS.public).toBe('appmintly.public.theme');
  });

  it('never lets a browser-local value override the published public palette', () => {
    const script = appearanceInitScript('public');
    // The legacy override is purged, not read.
    expect(script).toContain('appmintly.public.theme');
    expect(script).toContain('removeItem');
    expect(script).not.toContain('getItem');
    expect(script).not.toContain('setItem');
    // An explicit ?theme= preview (console deep link) still applies.
    expect(script).toContain('indexOf');
    expect(script).toContain('setAttribute');
    expect(script).not.toContain('document.body');
  });

  it('keeps the console palette browser-local and independent', () => {
    const script = appearanceInitScript('publisher');
    expect(script).toContain('appmintly.publisher.theme');
    expect(script).toContain('getItem');
    expect(script).not.toContain('appmintly.public.theme');
    expect(script).not.toContain('setItem');
  });

  it('builds a public deep link with the theme in the query', () => {
    expect(publicThemeUrl('https://appmintly.pages.dev/', 'ruby')).toBe('https://appmintly.pages.dev/appearance?theme=ruby');
  });
});
