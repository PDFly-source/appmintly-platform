'use client';

/**
 * Item 10 / Batch 3 — personalized block on app detail pages.
 *
 * Deliberately separate from the catalog's own "Similar apps" section: this one
 * is driven by what THIS browser viewed, saved and follows, is capped at three,
 * and always shows the factual reason. It renders nothing when there is no
 * signal, when recommendations are off, or when nothing qualifies.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useCatalog } from '@/lib/CatalogContext';
import { recommendApps } from '@/lib/personalization/model';
import { usePersonalization } from '@/lib/personalization/usePersonalization';

export function PersonalizedRecommendations({ slug }: { slug: string }) {
  const { publishedApps, catalog } = useCatalog();
  const { ready, state, savedSlugs, signal } = usePersonalization();

  const items = useMemo(() => {
    if (!ready || !state.preferences.recommendations || !signal) return [];
    return recommendApps({ catalog: publishedApps, state, savedSlugs, limit: 3 });
  }, [ready, publishedApps, state, savedSlugs, signal]);

  const lastViewed = useMemo(() => {
    const newest = state.recent[0];
    if (!newest) return null;
    const match = catalog.find((entry) => entry.slug.toLowerCase() === newest.slug);
    return match ? match.name : null;
  }, [state.recent, catalog]);

  if (items.length === 0) return null;

  const heading = lastViewed ? `Because you viewed ${lastViewed}` : 'Recommended for you';

  return (
    <div className="border-t border-line pt-6" data-testid="personalized-recommendations">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="text-base font-semibold text-ink">{heading}</h3>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-forge-blue/30 bg-forge-blue/10 text-[10px] font-bold text-forge-blue">
          <Sparkles aria-hidden="true" className="w-3 h-3" />
          Personalized on this device
        </span>
      </div>
      <p className="text-xs text-mut mb-3">
        Based on apps you viewed and saved, and the categories you follow. Not a popularity ranking.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(({ app, reasons }) => (
          <li key={app.id}>
            <Link
              href={`/app/${app.slug}`}
              className="flex items-start gap-3 rounded-xl border border-line/60 bg-page p-3 transition-colors hover:border-ink/25"
            >
              <AppIcon src={app.icon} name={app.name} size="sm" category={app.category} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{app.name}</span>
                <span className="block truncate text-xs text-mut">
                  {app.category} · {app.type}
                </span>
                <span className="block text-[11px] text-mut mt-0.5">{reasons[0]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-mut">
        Personalized suggestions are computed in this browser.{' '}
        <Link href="/library/settings/" className="font-semibold text-forge-blue hover:underline">
          Manage preferences
        </Link>
      </p>
      <span className="sr-only">
        This section is not a similarity ranking. {slug} itself is never recommended.
      </span>
    </div>
  );
}

export default PersonalizedRecommendations;
