'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * AppMintly theme system.
 *
 * Modes: 'light' | 'dark' | 'amoled' | 'system'.
 * - The preference persists in localStorage (a non-sensitive UI preference).
 * - An inline script in the document head applies the resolved theme before
 *   first paint to avoid a flash of the incorrect theme.
 * - 'system' follows the OS preference live via matchMedia.
 * - 'amoled' is a true-black dark theme for OLED/AMOLED screens: it reuses
 *   the standard dark component rules (the 'dark' class stays applied) and
 *   overrides the semantic color tokens with pure/near-black values defined
 *   in globals.css under `.amoled`. Zero extra component work required.
 */

export type ThemeMode = 'light' | 'dark' | 'amoled' | 'system';

const STORAGE_KEY = 'appmintly-theme';

interface ThemeContextValue {
  /** The persisted mode preference (may be 'system'). */
  mode: ThemeMode;
  /** The currently resolved theme ('light' | 'dark' | 'amoled'). */
  resolved: 'light' | 'dark' | 'amoled';
  setMode: (mode: ThemeMode) => void;
  /** Cycles light -> dark -> amoled -> system -> light. */
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'amoled' || v === 'system';
}

function resolveInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    /* localStorage unavailable — fall back to system */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyMode(mode: ThemeMode): 'light' | 'dark' | 'amoled' {
  const resolved =
    mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  const root = document.documentElement;
  // AMOLED keeps the standard `dark` class (so every existing `.dark` rule
  // still applies) and adds `amoled` on top to override the color tokens.
  root.classList.toggle('dark', resolved !== 'light');
  root.classList.toggle('amoled', resolved === 'amoled');
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [resolved, setResolved] = useState<'light' | 'dark' | 'amoled'>('light');

  // Hydrate from the DOM state applied by the pre-paint script, then sync.
  // The update must happen after mount: reading localStorage during render
  // would desync server-rendered markup. One deliberate post-mount write is
  // correct here, so the cascading-render heuristic is disabled explicitly.
  useEffect(() => {
    const initial = resolveInitialMode();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(initial);
    setResolved(applyMode(initial));
  }, []);

  // Follow the OS live while in 'system' mode.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (resolveInitialMode() === 'system') setResolved(applyMode('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setResolved(applyMode(next));
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* preference persistence unavailable — session-only theme */
    }
  }, []);

  const cycleMode = useCallback(() => {
    setMode(
      mode === 'light' ? 'dark' : mode === 'dark' ? 'amoled' : mode === 'amoled' ? 'system' : 'light'
    );
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycleMode }),
    [mode, resolved, setMode, cycleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/**
 * Inline pre-paint script. Runs in <head> before first paint so the resolved
 * theme class is already on <html> when the page renders (no FOUC).
 * Must be a string, executed before hydration, and must never touch
 * anything except the theme class and color-scheme style.
 * AMOLED keeps `dark` applied (component rules) and adds `amoled` (tokens).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');var a=m==='amoled';var d=a||m==='dark'||((m==null||m==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('amoled',a);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
