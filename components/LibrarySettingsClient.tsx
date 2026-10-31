'use client';

/**
 * Item 10 / Batch 3 — /library/settings/
 *
 * The only place the visitor can see and edit what personalization stores:
 * category preferences, the two switches, and the two destructive actions.
 * Everything is local to this browser. No account, no network request.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import { PERSONALIZATION_LIMITS } from '@/lib/personalization/model';
import { catalogCategories } from '@/lib/personalization/preferences';
import { usePersonalization } from '@/lib/personalization/usePersonalization';

export default function LibrarySettingsClient() {
  const { publishedApps } = useCatalog();
  const { toast } = useToast();
  const {
    ready,
    state,
    savedSlugs,
    signals,
    toggleCategory,
    setOption,
    clearRecent,
    resetAll,
  } = usePersonalization();

  const [confirmRecent, setConfirmRecent] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const categories = useMemo(() => catalogCategories(publishedApps), [publishedApps]);
  const selected = state.preferences.categories;

  if (!ready) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm text-mut">Loading your on-device preferences…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6" data-testid="personalization-settings">
      <div>
        <Link
          href="/library/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink transition"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Back to Library
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight mt-3">
          PERSONALIZATION
        </h1>
        <p className="text-xs sm:text-sm text-mut mt-2">
          What AppMintly recommends, and what it remembers on this device.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line bg-card text-[10px] font-bold text-mut">
          <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" />
          Stored locally • Never sent anywhere
        </p>
      </div>

      {/* ---------------- category preferences ---------------- */}
      <section className="rounded-2xl border border-line bg-card p-4 space-y-3" aria-labelledby="cat-prefs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="cat-prefs" className="text-sm font-bold text-ink">Category preferences</h2>
            <p className="text-[11px] text-mut mt-0.5">
              Pick the categories you care about. Only real AppMintly categories are listed.
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold text-mut">
            {selected.length}/{PERSONALIZATION_LIMITS.categories}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const active = selected.some((entry) => entry.toLowerCase() === category.toLowerCase());
            const atCap = !active && selected.length >= PERSONALIZATION_LIMITS.categories;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                disabled={atCap}
                onClick={() => toggleCategory(publishedApps, category)}
                className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-full border text-xs font-bold transition disabled:opacity-45 ${
                  active
                    ? 'border-forge-blue/40 bg-forge-blue/10 text-link-text'
                    : 'border-line bg-page text-mut hover:text-ink hover:border-mut/40'
                }`}
              >
                {active && <Check aria-hidden="true" className="w-3.5 h-3.5" />}
                {category}
              </button>
            );
          })}
        </div>
        {categories.length === 0 && (
          <p className="text-xs text-mut">No published categories are available right now.</p>
        )}
        <p className="text-[11px] text-mut">
          {selected.length === 0
            ? 'No categories followed yet. Following one is enough to unlock recommendations.'
            : `Following ${selected.length} ${selected.length === 1 ? 'category' : 'categories'}: ${selected.join(', ')}.`}
        </p>
      </section>

      {/* ---------------- switches ---------------- */}
      <section className="rounded-2xl border border-line bg-card p-4 space-y-3" aria-labelledby="switches">
        <h2 id="switches" className="text-sm font-bold text-ink">Switches</h2>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-link-text" />
              Recommendations
            </p>
            <p className="text-[11px] text-mut mt-0.5">
              Show “Recommended for You” on Home and personalized picks on app pages.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={state.preferences.recommendations}
            onClick={() => {
              const next = !state.preferences.recommendations;
              setOption({ recommendations: next });
              toast(next ? 'Recommendations on.' : 'Recommendations off.', 'info');
            }}
            className={`min-h-[44px] shrink-0 px-4 rounded-full border text-xs font-bold transition ${
              state.preferences.recommendations
                ? 'border-forge-green/40 bg-forge-green/10 text-success-text'
                : 'border-line bg-page text-mut'
            }`}
          >
            {state.preferences.recommendations ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Clock aria-hidden="true" className="w-3.5 h-3.5 text-mut" />
              Recently viewed
            </p>
            <p className="text-[11px] text-mut mt-0.5">
              Record the apps you open. Turning this off keeps your existing history.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={state.preferences.recentEnabled}
            onClick={() => {
              const next = !state.preferences.recentEnabled;
              setOption({ recentEnabled: next });
              toast(
                next ? 'Recently viewed recording on.' : 'Recently viewed recording off. History kept.',
                'info'
              );
            }}
            className={`min-h-[44px] shrink-0 px-4 rounded-full border text-xs font-bold transition ${
              state.preferences.recentEnabled
                ? 'border-forge-green/40 bg-forge-green/10 text-success-text'
                : 'border-line bg-page text-mut'
            }`}
          >
            {state.preferences.recentEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </section>

      {/* ---------------- what is stored ---------------- */}
      <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="stored">
        <h2 id="stored" className="text-sm font-bold text-ink">What is stored on this device</h2>
        <ul className="mt-2 space-y-1 text-[11px] text-mut">
          <li>• {signals.views} recently viewed {signals.views === 1 ? 'app' : 'apps'} (newest 24 kept)</li>
          <li>• {signals.saved} saved {signals.saved === 1 ? 'app' : 'apps'} (your existing saved list)</li>
          <li>• {signals.categories} followed {signals.categories === 1 ? 'category' : 'categories'}</li>
        </ul>
        <p className="mt-3 text-[11px] text-mut">
          This lives in this browser’s local storage only. There is no account and no server copy, so
          clearing your browser’s site data or browsing in private mode may remove it. Removing a
          saved app or clearing history here never touches your saved apps, Lab wishlist, compare
          list, update watch, installs or notifications.
        </p>
      </section>

      {/* ---------------- destructive actions ---------------- */}
      <section className="rounded-2xl border border-line bg-card p-4 space-y-3" aria-labelledby="danger">
        <h2 id="danger" className="text-sm font-bold text-ink">Clear personalization</h2>

        {confirmRecent ? (
          <div className="rounded-xl border border-forge-red/30 bg-forge-red/10 p-3 space-y-2">
            <p className="text-xs font-bold text-ink">Clear recently viewed history?</p>
            <p className="text-[11px] text-mut">
              Removes {signals.views} {signals.views === 1 ? 'entry' : 'entries'} from this browser.
              Saved apps and Lab wishlist saves are not affected.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRecent(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-xs font-bold text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearRecent();
                  setConfirmRecent(false);
                  toast('Recently viewed history cleared.', 'info');
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-forge-red text-on-brand text-xs font-bold"
              >
                Clear history
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={signals.views === 0}
            onClick={() => setConfirmRecent(true)}
            className="min-h-[44px] w-full rounded-xl border border-line bg-page px-4 text-xs font-bold text-ink hover:border-mut/40 disabled:opacity-45 transition flex items-center justify-between"
          >
            <span>Clear recently viewed history</span>
            <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        )}

        {confirmAll ? (
          <div className="rounded-xl border border-forge-red/40 bg-forge-red/10 p-3 space-y-2">
            <p className="text-xs font-bold text-ink">Remove all personalization?</p>
            <p className="text-[11px] text-mut">
              Clears view history, followed categories and both switches in this browser. Saving
              this off. Your saved apps, Lab wishlist, compare list, update watch, installs and
              notifications are untouched.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmAll(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-xs font-bold text-ink"
              >
                Keep my data
              </button>
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  setConfirmAll(false);
                  toast('All personalization data removed.', 'info');
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-forge-red text-on-brand text-xs font-bold"
              >
                Remove all
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            className="min-h-[44px] w-full rounded-xl border border-forge-red/30 bg-forge-red/10 px-4 text-xs font-bold text-forge-red hover:bg-forge-red/20 transition flex items-center justify-between"
          >
            <span>Remove all personalization data</span>
            <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        )}
      </section>
    </div>
  );
}
