/**
 * AppMintly Appearance — the ten approved surface themes.
 *
 * One palette model drives both surfaces. Each surface maps these tokens onto
 * its own CSS variable namespace: the Publisher console consumes `--sr-*`, the
 * public marketplace consumes `--c-*`. Nothing here references storage or the
 * DOM, so the same file can be unit-tested in Node.
 *
 * Emerald, Sapphire, Ruby and Champagne mirror the supplied reference artwork:
 * deep forest green, deep navy, deep burgundy and warm ivory with champagne gold.
 *
 * SURFACE CONTRACT (public theme is published, not per-browser):
 *   The public marketplace renders the palette published in data/appearance.json.
 *   That file is committed by the Publisher console and baked into the static
 *   build, so every visitor receives it. No browser-local value can override it:
 *   `appmintly.public.theme` was a personal override in an earlier iteration and
 *   is now cleared on first paint, never read. The Publisher console keeps its
 *   own browser-local palette under `appmintly.publisher.theme`; the two
 *   surfaces are independent and never share storage.
 */

export type ThemeId =
  | 'emerald'
  | 'sapphire'
  | 'ruby'
  | 'champagne'
  | 'obsidian'
  | 'amethyst'
  | 'copper'
  | 'aurora'
  | 'platinum'
  | 'sakura';

export type ThemePalette = {
  id: ThemeId;
  /** Human label used on the theme buttons. */
  label: string;
  /** True when the theme paints light surfaces (dark ink on cream). */
  light: boolean;
  /** Short description shown under a preview card. */
  note: string;
  /** Swatch trio used by the preview cards: page, card, accent. */
  swatch: { page: string; surface: string; accent: string };
};

export const THEMES: ThemePalette[] = [
  {
    id: 'emerald',
    label: 'Emerald',
    light: false,
    note: 'Deep forest green with emerald accents.',
    swatch: { page: '#06130E', surface: '#0D2019', accent: '#4BE08F' },
  },
  {
    id: 'sapphire',
    label: 'Sapphire',
    light: false,
    note: 'Deep navy with sapphire blue accents.',
    swatch: { page: '#0A1226', surface: '#18254D', accent: '#2563EB' },
  },
  {
    id: 'ruby',
    label: 'Ruby',
    light: false,
    note: 'Deep burgundy with ruby red accents.',
    swatch: { page: '#17060B', surface: '#2A0D15', accent: '#EF4444' },
  },
  {
    id: 'champagne',
    label: 'Champagne',
    light: true,
    note: 'Warm ivory with champagne gold accents.',
    swatch: { page: '#F7F1E4', surface: '#FFFCF5', accent: '#B0812F' },
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    light: false,
    note: 'Liquid graphite with a silver-white accent.',
    swatch: { page: '#0B0B0F', surface: '#16161D', accent: '#E9EBF2' },
  },
  {
    id: 'amethyst',
    label: 'Amethyst',
    light: false,
    note: 'Deep aubergine with amethyst violet accents.',
    swatch: { page: '#120A1F', surface: '#1D1133', accent: '#8B5CF6' },
  },
  {
    id: 'copper',
    label: 'Copper',
    light: false,
    note: 'Burnt umber with burnished copper accents.',
    swatch: { page: '#140D09', surface: '#221410', accent: '#C2703D' },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    light: false,
    note: 'Deep teal with mint aurora and violet light.',
    swatch: { page: '#071318', surface: '#0E2130', accent: '#14B8A6' },
  },
  {
    id: 'platinum',
    label: 'Platinum',
    light: true,
    note: 'Cool platinum grey with graphite accents.',
    swatch: { page: '#F4F5F7', surface: '#FFFFFF', accent: '#1F2937' },
  },
  {
    id: 'sakura',
    label: 'Sakura',
    light: true,
    note: 'Soft blush ivory with deep rose accents.',
    swatch: { page: '#FDF2F4', surface: '#FFF9FA', accent: '#BE123C' },
  },
];

export const DEFAULT_THEME: ThemeId = 'sapphire';

export const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id);

/** Narrowing guard: any untrusted string (storage, query string) is validated. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value);
}

export function themeById(id: ThemeId): ThemePalette {
  return THEMES.find((t) => t.id === id) || THEMES[1];
}

/**
 * Storage keys are per surface and per origin. Never cross-origin.
 * `public` is legacy only: it is cleared on paint and never read, because the
 * published palette must reach every visitor identically.
 */
export const STORAGE_KEYS = {
  publisher: 'appmintly.publisher.theme',
  public: 'appmintly.public.theme',
} as const;

export type Surface = keyof typeof STORAGE_KEYS;

/**
 * Resolve a theme from an explicit query value, then storage, then default.
 * Every input is validated, so a hand-edited value can never inject CSS.
 */
export function resolveTheme(
  queryValue: string | null | undefined,
  storedValue: string | null | undefined,
  fallback: ThemeId = DEFAULT_THEME,
): { theme: ThemeId; source: 'query' | 'stored' | 'default' } {
  if (isThemeId(queryValue)) return { theme: queryValue, source: 'query' };
  if (isThemeId(storedValue)) return { theme: storedValue, source: 'stored' };
  return { theme: fallback, source: 'default' };
}

/** Read a stored preference without throwing in private-mode or SSR contexts. */
export function readStoredTheme(surface: Surface): ThemeId | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEYS[surface]);
    return isThemeId(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist a preference; returns false when storage is unavailable. */
export function writeStoredTheme(surface: Surface, theme: ThemeId): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(STORAGE_KEYS[surface], theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply the theme to the document root. Returns false when there is no DOM
 * (static rendering, tests) so callers never assume a paint happened.
 */
export function applyThemeToDocument(theme: ThemeId, root?: { setAttribute: (n: string, v: string) => void }): boolean {
  try {
    const target = root || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!target) return false;
    target.setAttribute('data-theme', theme);
    return true;
  } catch {
    return false;
  }
}

/** The deep link a console operator can hand to the public site. */
export function publicThemeUrl(base: string, theme: ThemeId): string {
  const clean = base.replace(/\/+$/, '');
  return `${clean}/appearance?theme=${theme}`;
}

/**
 * The published default comes from data/appearance.json in this repository, so
 * the palette is changed by committing one file — the Publisher console does
 * that server-side. An unexpected value is ignored rather than trusted, and
 * `null` means "keep the shipped look".
 */
export function readPublishedTheme(value: unknown): ThemeId | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as { theme?: unknown }).theme;
  return isThemeId(raw) ? raw : null;
}

/**
 * Pre-paint initialiser. Runs inline in <head> before React so the palette is
 * on <html> for the first frame (no flash of the wrong theme).
 *
 * Public surface: the published theme is already server-rendered into the
 *   `data-theme` attribute of <html>. The only thing this script may apply is
 *   an explicit `?theme=` preview from a console deep link, and it removes the
 *   legacy browser-local override so no visitor is stuck on an old palette.
 *
 * Publisher surface: query, then this browser's stored console palette.
 *
 * It only reads validated values and sets one attribute: no user data leaves
 * the browser and a hand-edited value cannot inject anything.
 */
export function appearanceInitScript(surface: Surface): string {
  const ids = JSON.stringify(THEME_IDS);
  if (surface === 'publisher') {
    const key = STORAGE_KEYS.publisher;
    return `(function(){try{var ids=${ids};var q=new URLSearchParams(location.search).get('theme');var s=localStorage.getItem('${key}');var t=ids.indexOf(q)>-1?q:(ids.indexOf(s)>-1?s:null);if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  }
  const legacy = STORAGE_KEYS.public;
  return `(function(){try{var ids=${ids};localStorage.removeItem('${legacy}');var q=new URLSearchParams(location.search).get('theme');if(ids.indexOf(q)>-1){document.documentElement.setAttribute('data-theme',q);}}catch(e){}})();`;
}
