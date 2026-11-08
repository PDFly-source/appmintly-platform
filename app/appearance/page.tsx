'use client';

/**
 * Appearance — public marketplace theme chooser.
 *
 * Matches the approved reference: a compact "Theme:" row of four buttons with a
 * clear selected state, and a Back control underneath. Choosing a theme applies
 * it immediately (no reload), stores it for this browser and origin, and the
 * choice survives refresh and navigation.
 *
 * Persistence is deliberately local: `appmintly.public.theme` in localStorage.
 * The Publisher console is a different origin and cannot read it, so no
 * cross-origin or cross-device sync is claimed anywhere.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  applyThemeToDocument,
  readStoredTheme,
  resolveTheme,
  themeById,
  THEMES,
  writeStoredTheme,
  type ThemeId,
} from '@/lib/appearance/themes';

export default function AppearancePage() {
  const [theme, setTheme] = useState<ThemeId>('emerald');
  const [status, setStatus] = useState<'idle' | 'saved' | 'blocked'>('idle');

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search).get('theme');
      const resolved = resolveTheme(query, readStoredTheme('public'), 'emerald');
      setTheme(resolved.theme);
      applyThemeToDocument(resolved.theme);
      if (resolved.source !== 'default') {
        const ok = writeStoredTheme('public', resolved.theme);
        setStatus(ok ? 'saved' : 'blocked');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const choose = useCallback((next: ThemeId) => {
    setTheme(next);
    applyThemeToDocument(next);
    setStatus(writeStoredTheme('public', next) ? 'saved' : 'blocked');
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">Appearance</h1>
      <p className="mt-2 text-sm text-mut">
        Choose how AppMintly looks on this device. Your choice is saved in this browser only.
      </p>

      <section aria-labelledby="theme-label" className="mt-6 rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span id="theme-label" className="text-sm font-medium text-mut">
            Theme:
          </span>
          <div role="group" aria-labelledby="theme-label" className="flex flex-wrap gap-2">
            {THEMES.map((option) => {
              const selected = option.id === theme;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => choose(option.id)}
                  aria-pressed={selected}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta ${
                    selected
                      ? 'border-transparent text-[color:var(--c-on-cta)]'
                      : 'border-line text-ink hover:border-cta'
                  }`}
                  style={selected ? { background: 'var(--c-cta)' } : undefined}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-3 text-xs text-mut" role="status" aria-live="polite">
          {status === 'saved'
            ? `${themeById(theme).label} applied and saved on this browser.`
            : status === 'blocked'
              ? `${themeById(theme).label} applied for this visit; browser storage is blocked, so it will not persist.`
              : `${themeById(theme).label} is the current theme.`}
        </p>
      </section>

      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-cta"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>
    </main>
  );
}
