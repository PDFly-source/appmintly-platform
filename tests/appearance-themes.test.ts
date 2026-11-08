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
};

describe('palette registry', () => {
  it('ships exactly the four approved themes', () => {
    expect(THEME_IDS).toEqual(['emerald', 'sapphire', 'ruby', 'champagne']);
    expect(THEMES).toHaveLength(4);
  });

  it('marks Champagne as the only light palette', () => {
    expect(THEMES.filter((t) => t.light).map((t) => t.id)).toEqual(['champagne']);
  });

  it('has a swatch for every palette and no duplicate labels', () => {
    for (const theme of THEMES) {
      expect(theme.swatch.page).toMatch(/^#[0-9A-F]{6}$/i);
      expect(theme.swatch.surface).toMatch(/^#[0-9A-F]{6}$/i);
      expect(theme.swatch.accent).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(new Set(THEMES.map((t) => t.label)).size).toBe(4);
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

  it('refuses anything that is not one of the four ids', () => {
    for (const bad of ['amber', '', 'EMERALD', 'emerald ', 'red;background:url(x)', null, undefined, 42]) {
      expect(isThemeId(bad)).toBe(false);
    }
    expect(resolveTheme('"><script>', 'javascript:alert(1)').theme).toBe('sapphire');
  });
});

describe('persistence contract', () => {
  it('uses a distinct key per surface', () => {
    expect(STORAGE_KEYS.public).not.toBe(STORAGE_KEYS.publisher);
    expect(STORAGE_KEYS.public).toBe('appmintly.public.theme');
  });

  it('initialises from the validated value only, and never writes', () => {
    const script = appearanceInitScript('public');
    expect(script).toContain('appmintly.public.theme');
    expect(script).toContain('setAttribute');
    expect(script).not.toContain('setItem');
    expect(script).not.toContain('document.body');
    expect(script).toContain('indexOf');
  });

  it('builds a public deep link with the theme in the query', () => {
    expect(publicThemeUrl('https://appmintly.pages.dev/', 'ruby')).toBe('https://appmintly.pages.dev/appearance?theme=ruby');
  });
});
