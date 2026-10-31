'use client';

/**
 * Item 10 / Batch 3 — "Recommended for You" on Home.
 *
 * Renders only when this browser has given a real signal (2+ viewed apps, a
 * saved app, or a followed category), only when recommendations are switched
 * on, and only with published catalog records. Every card carries the factual
 * reason the engine produced, and there is no popularity, rating or engagement
 * input anywhere in the chain.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AppCard } from '@/components/AppCard';
import { useCatalog } from '@/lib/CatalogContext';
import { recommendApps } from '@/lib/personalization/model';
import { usePersonalization } from '@/lib/personalization/usePersonalization';

export function RecommendedForYou() {
  const { publishedApps } = useCatalog();
  const { ready, state, savedSlugs, signal } = usePersonalization();

  const items = useMemo(() => {
    if (!ready || !state.preferences.recommendations || !signal) return [];
    return recommendApps({ catalog: publishedApps, state, savedSlugs, limit: 3 });
  }, [ready, publishedApps, state, savedSlugs, signal]);

  if (items.length === 0) return null;

  return (
    <section
      className="px-4 sm:px-6 max-w-7xl mx-auto mb-14"
      aria-labelledby="for-you-label"
      data-testid="recommended-for-you"
    >
      <div className="flex items-end justify-between mb-5 gap-4">
        <div>
          <h2
            id="for-you-label"
            className="text-xl sm:text-2xl font-bold text-ink tracking-tight flex items-center gap-2"
          >
            <Sparkles aria-hidden="true" className="w-5 h-5 text-link-text" />
            Recommended for You
          </h2>
          <p className="text-xs sm:text-sm text-mut mt-1">
            From apps you viewed, apps you saved and the categories you follow on this device.
          </p>
        </div>
        <Link
          href="/library/settings/"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-link-text hover:text-link-text/80 transition"
        >
          <span>Edit preferences</span>
          <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map(({ app, reasons }) => (
          <div key={app.id} className="h-full flex flex-col">
            <AppCard app={app} />
            <p className="mt-2 text-[11px] leading-snug text-mut">
              <span className="font-semibold text-ink/70">Why: </span>
              {reasons[0]}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-mut">
        Personal suggestions only. AppMintly uses no popularity, rating or download counts, and
        nothing here leaves this browser.{' '}
        <Link href="/library/settings/" className="font-semibold text-link-text hover:underline">
          Manage personalization
        </Link>
      </p>
    </section>
  );
}

export default RecommendedForYou;
