'use client';

import React from 'react';
import Link from 'next/link';
import { useCatalog } from '@/lib/CatalogContext';
import { getDeveloperIdentity } from '@/data/publishers';
import { AppCard } from '@/components/AppCard';
import { Reveal } from '@/components/Reveal';
import type { AppItem } from '@/data/apps';
import { PublisherIdentityCard } from '@/components/PublisherIdentityCard';
import { computePublisherStats } from '@/lib/publisher-stats';
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

  // One shared, tested aggregation layer (lib/publisher-stats.ts). `publishedApps`
  // is already filtered by the project's public-publication rules, so drafts
  // and archived records can never reach these numbers.
  const stats = React.useMemo(
    () => (identity ? computePublisherStats(publishedApps, identity.slug) : null),
    [publishedApps, identity]
  );
  const apps = stats?.apps ?? [];
  // `apps` is already sorted newest-update-first from real metadata.
  const updatedApps = apps;

  if (!identity) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div className="text-center max-w-md py-20">
          <SearchX className="w-12 h-12 mx-auto text-line mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold tracking-tight mb-2">Publisher Not Found</h1>
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
      {/* Publisher header — premium 3D stage */}
      <section className="px-4 sm:px-6 pt-8 sm:pt-12 max-w-7xl mx-auto">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Explore</span>
        </Link>

        <div className="p3d-stage p-4 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-center">
            <div className="p3d-rise" style={{ ['--p3d-d' as string]: '0s' }}>
              <PublisherIdentityCard
                name={identity.name}
                verified={identity.verified}
                eyebrow="Verified Developer & Publisher"
                subtitle={
                  stats && stats.totalApps > 0
                    ? `${stats.publishedApps} published ${stats.publishedApps === 1 ? 'application' : 'applications'}`
                    : undefined
                }
                avatarSize={76}
                footer={[
                  { label: 'Publisher ID', value: identity.slug },
                  { label: 'Marketplace', value: 'AppMintly' },
                ]}
              />
            </div>

            <div className="p3d-rise min-w-0" style={{ ['--p3d-d' as string]: '0.1s' }}>
              {identity.bio && (
                <p className="text-sm sm:text-base p3d-mute leading-relaxed max-w-xl">{identity.bio}</p>
              )}
              {identity.website && (
                <a
                  href={identity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] text-xs font-bold text-[#7dd3fc] hover:text-white transition"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Official Website</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {/* Truthful publisher stats (derived from the live published catalog) */}
              <div
                className="grid grid-cols-2 gap-3 mt-5 lg:mt-6"
                role="list"
                aria-label="Publisher statistics"
              >
                <div className="p3d-glass p-4" role="listitem">
                  <div className="flex items-center gap-1.5 p3d-mute text-[0.68rem] font-bold uppercase tracking-[0.12em]">
                    <Package className="w-3.5 h-3.5" aria-hidden="true" /> Total Apps
                  </div>
                  <p className="p3d-stat-num text-3xl font-extrabold mt-1.5">{stats?.totalApps ?? 0}</p>
                </div>
                <div className="p3d-glass p-4" role="listitem">
                  <div className="flex items-center gap-1.5 p3d-mute text-[0.68rem] font-bold uppercase tracking-[0.12em]">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Published
                  </div>
                  <p className="p3d-stat-num text-3xl font-extrabold mt-1.5">{stats?.publishedApps ?? 0}</p>
                </div>
                <div className="p3d-glass p-4" role="listitem">
                  <div className="flex items-center gap-1.5 p3d-mute text-[0.68rem] font-bold uppercase tracking-[0.12em]">
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Recently Updated
                  </div>
                  <p className="p3d-stat-num text-3xl font-extrabold mt-1.5 p3d-grad">
                    {stats?.latestVersion ? `v${stats.latestVersion}` : '—'}
                  </p>
                  {stats?.latestVersionApp && (
                    <p className="text-[0.7rem] p3d-mute mt-0.5 truncate">{stats.latestVersionApp}</p>
                  )}
                </div>
                <div className="p3d-glass p-4" role="listitem">
                  <div className="flex items-center gap-1.5 p3d-mute text-[0.68rem] font-bold uppercase tracking-[0.12em]">
                    <Globe className="w-3.5 h-3.5" aria-hidden="true" /> Categories
                  </div>
                  <p className="p3d-stat-num text-3xl font-extrabold mt-1.5">{stats?.categoryCount ?? 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Published apps */}
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mt-10" aria-label="Published applications">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Apps by {identity.name}
            </h2>
            <p className="text-xs sm:text-sm text-mut mt-1">
              All published applications from this verified publisher.
            </p>
          </div>
        </div>

        {apps.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app, i) => (
              <Reveal key={app.slug} delay={Math.min(i, 5) * 0.06} className="h-full">
                <AppCard app={app as AppItem} />
              </Reveal>
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
          <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
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
