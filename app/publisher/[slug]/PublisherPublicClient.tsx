'use client';

import React from 'react';
import Link from 'next/link';
import { useCatalog } from '@/lib/CatalogContext';
import { getDeveloperIdentity } from '@/data/publishers';
import { AppCard } from '@/components/AppCard';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import {
  ArrowLeft,
  Globe,
  Package,
  RefreshCw,
  Sparkles,
  ExternalLink,
  SearchX,
} from 'lucide-react';

/**
 * Public publisher profile page.
 *
 * All displayed data is derived from the live published catalog — no mock or
 * fabricated publisher metrics. If a publisher has no published apps, the
 * page shows a truthful empty state.
 */
export default function PublisherPublicClient({ slug }: { slug: string }) {
  const { publishedApps } = useCatalog();
  const identity = getDeveloperIdentity(slug);

  const apps = React.useMemo(
    () => (identity ? publishedApps.filter((a) => a.developerSlug === identity.slug) : []),
    [publishedApps, identity]
  );

  const latestApps = React.useMemo(() => [...apps].slice(0, 6), [apps]);

  const updatedApps = React.useMemo(() => {
    return [...apps].sort((a, b) => {
      const dateA = new Date(a.lastUpdated || a.updatedAt || a.releaseDate || 0).getTime();
      const dateB = new Date(b.lastUpdated || b.updatedAt || b.releaseDate || 0).getTime();
      return dateB - dateA;
    });
  }, [apps]);

  if (!identity) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div className="text-center max-w-md py-20">
          <SearchX className="w-12 h-12 mx-auto text-line mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-black tracking-tight mb-2">Publisher Not Found</h1>
          <p className="text-sm text-mut mb-6">
            No publisher with the address &ldquo;{slug}&rdquo; exists on AppMintly.
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-sm font-bold transition"
          >
            <ArrowLeft className="w-4 h-4" /> Browse Apps
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page text-ink pb-16">
      {/* Publisher header */}
      <section className="px-4 sm:px-6 pt-8 sm:pt-12 max-w-7xl mx-auto">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Explore</span>
        </Link>

        <div className="rounded-3xl bg-card border border-line p-6 sm:p-10 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            {/* Publisher avatar/monogram */}
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-inkbg text-white flex items-center justify-center text-2xl sm:text-3xl font-black shrink-0 shadow-md"
              aria-hidden="true"
            >
              {identity.name.slice(0, 2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight">{identity.name}</h1>
                {identity.verified && <VerifiedBadge />}
              </div>
              {identity.bio && (
                <p className="text-sm sm:text-base text-mut mt-2 max-w-2xl leading-relaxed">
                  {identity.bio}
                </p>
              )}
              {identity.website && (
                <a
                  href={identity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Official Website</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Truthful publisher stats (derived from live catalog) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8" role="list" aria-label="Publisher statistics">
            <div className="rounded-2xl bg-page border border-line p-4" role="listitem">
              <div className="flex items-center gap-1.5 text-mut text-xs font-bold uppercase tracking-wide">
                <Package className="w-3.5 h-3.5" /> Total Apps
              </div>
              <p className="text-2xl font-black mt-1.5">{apps.length}</p>
            </div>
            <div className="rounded-2xl bg-page border border-line p-4" role="listitem">
              <div className="flex items-center gap-1.5 text-mut text-xs font-bold uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5" /> Published
              </div>
              <p className="text-2xl font-black mt-1.5">
                {apps.filter((a) => a.published).length}
              </p>
            </div>
            <div className="rounded-2xl bg-page border border-line p-4" role="listitem">
              <div className="flex items-center gap-1.5 text-mut text-xs font-bold uppercase tracking-wide">
                <RefreshCw className="w-3.5 h-3.5" /> Recently Updated
              </div>
              <p className="text-2xl font-black mt-1.5">
                {updatedApps[0]?.version ? `v${updatedApps[0].version}` : '—'}
              </p>
            </div>
            <div className="rounded-2xl bg-page border border-line p-4" role="listitem">
              <div className="flex items-center gap-1.5 text-mut text-xs font-bold uppercase tracking-wide">
                <Globe className="w-3.5 h-3.5" /> Categories
              </div>
              <p className="text-2xl font-black mt-1.5">
                {new Set(apps.map((a) => a.category)).size}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Published apps */}
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mt-10" aria-label="Published applications">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Apps by {identity.name}
            </h2>
            <p className="text-xs sm:text-sm text-mut mt-1">
              All published applications from this verified publisher.
            </p>
          </div>
        </div>

        {latestApps.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {latestApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        ) : (
          <div className="p-10 rounded-2xl bg-card border border-line text-center">
            <SearchX className="w-10 h-10 mx-auto text-line mb-3" aria-hidden="true" />
            <p className="text-sm font-semibold text-mut">
              This publisher has no published applications yet.
            </p>
          </div>
        )}
      </section>

      {/* Recently updated */}
      {updatedApps.length > 0 && (
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mt-12" aria-label="Recently updated applications">
          <h2 className="text-lg sm:text-xl font-black tracking-tight mb-4">
            Latest Updates
          </h2>
          <div className="rounded-2xl bg-card border border-line shadow-xs divide-y divide-line">
            {updatedApps.slice(0, 5).map((app) => (
              <Link
                key={app.id}
                href={`/app/${app.slug}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-page transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{app.name}</p>
                  <p className="text-xs text-mut truncate">{app.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black">v{app.version}</p>
                  <p className="text-[10px] text-mut">
                    {app.lastUpdated || app.releaseDate || '—'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
