'use client';

/**
 * Phase 11 — Global Command Palette.
 *
 * Ctrl+K / Cmd+K on desktop; a discoverable navbar trigger on every device.
 * Searches the canonical catalog (app name, category, developer) with a
 * lightweight subsequence fuzzy matcher — no heavy dependency — and offers
 * quick navigation actions. Keyboard-first: arrow navigation, Enter to open,
 * Escape to close, focus trapped inside the dialog while open.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, CornerDownLeft, Home, Compass, LayoutGrid, Bookmark, AppWindow } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { useCatalog } from '@/lib/CatalogContext';

interface NavAction {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: React.ReactNode;
  keywords: string;
}

const NAV_ACTIONS: NavAction[] = [
  { id: 'home', label: 'Go to Home', hint: 'Home page', href: '/', icon: <Home className="w-4 h-4" />, keywords: 'home start landing marketplace' },
  { id: 'explore', label: 'Go to Explore', hint: 'Browse all apps', href: '/explore', icon: <Compass className="w-4 h-4" />, keywords: 'explore browse all apps search' },
  { id: 'categories', label: 'Go to Categories', hint: 'App categories', href: '/categories', icon: <LayoutGrid className="w-4 h-4" />, keywords: 'categories category directory' },
  { id: 'library', label: 'Go to Library', hint: 'Your saved apps', href: '/library', icon: <Bookmark className="w-4 h-4" />, keywords: 'library saved favorites bookmarks' },
];

/** Lightweight fuzzy subsequence score: higher = better match, 0 = no match. */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q); // exact substring ranks first
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    streak = found === ti ? streak + 2 : 1;
    score += streak;
    ti = found + 1;
  }
  return score;
}

interface PaletteRow {
  key: string;
  kind: 'action' | 'app';
  label: string;
  hint: string;
  icon: React.ReactNode;
  href: string;
}

export function CommandPalette() {
  const router = useRouter();
  const { publishedApps } = useCatalog();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  // Global shortcut: Ctrl+K / Cmd+K toggles the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Open the palette when the site asks for it (navbar trigger / mobile)
  useEffect(() => {
    const openPalette = () => {
      setOpen(true);
      setActiveIndex(0);
      setQuery('');
    };
    window.addEventListener('appmintly:open-command-palette', openPalette);
    return () => window.removeEventListener('appmintly:open-command-palette', openPalette);
  }, []);

  // Focus management: trap focus while open, restore on close
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
    return () => {
      document.removeEventListener('keydown', trap, true);
      previouslyFocused?.focus?.();
    };
  }, [open, close]);

  const rows: PaletteRow[] = useMemo(() => {
    const out: PaletteRow[] = [];
    for (const a of NAV_ACTIONS) {
      const s = Math.max(
        fuzzyScore(query, a.label),
        fuzzyScore(query, a.keywords),
        fuzzyScore(query, a.hint)
      );
      if (s > 0) out.push({ key: `action-${a.id}`, kind: 'action', label: a.label, hint: a.hint, icon: a.icon, href: a.href });
    }
    for (const app of publishedApps as AppItem[]) {
      const s = Math.max(
        fuzzyScore(query, app.name),
        fuzzyScore(query, app.category),
        fuzzyScore(query, app.developer),
        fuzzyScore(query, app.type)
      );
      if (s > 0) {
        out.push({
          key: `app-${app.id}`,
          kind: 'app',
          label: app.name,
          hint: `${app.category} • ${app.developer}`,
          icon: <AppWindow className="w-4 h-4" />,
          href: `/app/${app.slug}`,
        });
      }
    }
    return out.slice(0, 24);
  }, [query, publishedApps]);


  const handleSelect = (row: PaletteRow) => {
    close();
    router.push(row.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) handleSelect(row);
    }
  };

  // Keep the active row visible while arrowing through the list
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette — search apps and pages"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Backdrop with subtle blur (glass language, avoids heavy neon) */}
      <div className="absolute inset-0 bg-inkbg/45 backdrop-blur-sm" aria-hidden />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-2xl bg-card border border-line shadow-2xl overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
          <Search className="w-4 h-4 text-mut shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0); // reset selection with every new search
            }}
            onKeyDown={onKeyDown}
            placeholder="Search apps, categories, developers…"
            aria-label="Search apps, categories, developers"
            aria-controls="command-palette-results"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded="true"
            className="w-full bg-transparent text-ink text-sm placeholder:text-mut focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={close}
            className="shrink-0 px-2 py-1 rounded-md text-[10px] font-bold text-mut border border-line hover:text-ink hover:border-ink/30 transition-colors cursor-pointer"
            aria-label="Close command palette (Escape)"
          >
            ESC
          </button>
        </div>

        <div
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-mut text-center">
              No results for &ldquo;{query}&rdquo;. Try an app name, category or developer.
            </p>
          ) : (
            <>
              <p className="px-4 pb-1 text-[10px] font-black uppercase tracking-wider text-mut">
                {query ? 'Results' : 'Quick actions & apps'}
              </p>
              {rows.map((row, i) => (
                <Link
                  key={row.key}
                  href={row.href}
                  data-index={i}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(row);
                  }}
                  className={`flex items-center gap-3 mx-2 my-0.5 px-3 py-2.5 rounded-xl text-sm transition-colors outline-hidden ${
                    i === activeIndex
                      ? 'bg-inkbg text-white'
                      : 'text-ink hover:bg-page'
                  }`}
                >
                  <span className={`shrink-0 ${i === activeIndex ? 'text-white' : 'text-mut'}`} aria-hidden>
                    {row.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{row.label}</span>
                    <span className={`block text-xs truncate ${i === activeIndex ? 'text-white/70' : 'text-mut'}`}>
                      {row.hint}
                    </span>
                  </span>
                  {i === activeIndex && (
                    <CornerDownLeft className="w-3.5 h-3.5 shrink-0 text-white/80" aria-hidden />
                  )}
                </Link>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-line bg-page text-[10px] text-mut">
          <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-line bg-card font-bold">↑</kbd><kbd className="px-1 rounded border border-line bg-card font-bold">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-line bg-card font-bold">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-line bg-card font-bold">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}


/** Navbar/nav entry point: dispatches the open event (mobile + desktop). */
export function CommandPaletteTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('appmintly:open-command-palette'))}
      className={
        className ||
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-card text-mut text-xs font-semibold hover:border-ink/35 hover:text-ink transition-colors cursor-pointer'
      }
      aria-label="Open command palette (Ctrl K)"
      aria-keyshortcuts="Control+K"
    >
      <Search className="w-3.5 h-3.5" aria-hidden />
      <span>Quick find</span>
      <kbd className="px-1.5 py-0.5 rounded bg-page border border-line text-[10px] font-bold text-mut">Ctrl K</kbd>
    </button>
  );
}
