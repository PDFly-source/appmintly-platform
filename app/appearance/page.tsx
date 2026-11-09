'use client';

/**
 * Appearance — public marketplace palette preview.
 *
 * The marketplace palette is PUBLISHED, not per-browser: data/appearance.json is
 * committed by the Publisher console and baked into this static build, so every
 * visitor receives the same palette. This page therefore previews the ten
 * themes for the current visit only and never writes a browser-local override.
 *
 * An earlier iteration stored a personal choice under `appmintly.public.theme`;
 * that key is cleared on first paint (see appearanceInitScript) and is never
 * read, so a visitor who once deep-linked a theme is not stuck on it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import appearanceConfig from '@/data/appearance.json';
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  readPublishedTheme,
  themeById,
  THEMES,
  type ThemeId,
} from '@/lib/appearance/themes';

export default function AppearancePage() {
  const published = readPublishedTheme(appearanceConfig);
  const [theme, setTheme] = useState<ThemeId>(published ?? DEFAULT_THEME);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search).get('theme');
      const match = THEMES.find((option) => option.id === query);
      if (match) {
        setTheme(match.id);
        applyThemeToDocument(match.id);
        setPreviewing(match.id !== published);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [published]);

  const choose = useCallback((next: ThemeId) => {
    setTheme(next);
    applyThemeToDocument(next);
    setPreviewing(next !== published);
  }, [published]);

  const restorePublished = useCallback(() => {
    if (!published) return;
    setTheme(published);
    applyThemeToDocument(published);
    setPreviewing(false);
  }, [published]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">Appearance</h1>
      <p className="mt-2 text-sm text-mut">
        AppMintly publishes one palette for everybody. Pick a theme below to preview it on this device;
        your preview ends when you leave or reload.
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
          {published
            ? `Published palette: ${themeById(published).label}.`
            : 'Published palette: the shipped AppMintly look.'}
          {previewing ? ` Previewing ${themeById(theme).label} for this visit only.` : ''}
        </p>

        {previewing && published ? (
          <button
            type="button"
            onClick={restorePublished}
            className="mt-3 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-cta"
          >
            Back to the published palette
          </button>
        ) : null}
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
