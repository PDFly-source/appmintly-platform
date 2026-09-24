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
 * Modes: 'light' | 'dark' | 'system'.
 * - The preference persists in localStorage (a non-sensitive UI preference).
 * - An inline script in the document head applies the resolved theme before
 *   first paint to avoid a flash of the incorrect theme.
 * - 'system' follows the OS preference live via matchMedia.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'appmintly-theme';

interface ThemeContextValue {
  /** The persisted mode preference (may be 'system'). */
  mode: ThemeMode;
  /** The currently resolved theme ('light' | 'dark'). */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  /** Cycles light -> dark -> system -> light. */
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
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

function applyMode(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Hydrate from the DOM state applied by the pre-paint script, then sync.
  useEffect(() => {
    const initial = resolveInitialMode();
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
    setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light');
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
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');var d=m==='dark'||((m==null||m==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
