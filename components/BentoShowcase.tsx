'use client';

/**
 * Phase 11 — Bento grid showcase (home page).
 *
 * Every tile is derived from REAL catalog data: featured apps, category
 * counts, authoritative APK release counts, original counts and the newest
 * release. No fake statistics, no fake popularity — counts shown are counts
 * of canonical records. Apps are never duplicated inside the grid: each
 * app tile uses a distinct record from the published catalog.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Sparkles, Download, ArrowRight, Star, AppWindow } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import { BASE_PATH } from '@/lib/api-path';

function resolveAsset(src: string | undefined): string | undefined {
  if (!src) return undefined;
  return src.startsWith('/') ? `${BASE_PATH}${src}` : src;
}

interface BentoShowcaseProps {
  featuredApps: AppItem[];
  publishedApps: AppItem[];
  latestApps: AppItem[];
}

export function BentoShowcase({ featuredApps, publishedApps, latestApps }: BentoShowcaseProps) {
  const tiles = useMemo(() => {
    // Spotlight: the most recently updated featured app (hero already shows
    // it first, but the bento spotlight uses the NEXT one so apps aren't
    // duplicated across the two sections' focal tiles).
    const spotlight = featuredApps[1] || featuredApps[0];
    const usedIds = new Set<string>(spotlight ? [spotlight.id] : []);

    // Newest release tile: newest app not already used
    const newestRelease = latestApps.find((a) => !usedIds.has(a.id)) || latestApps[0];
    if (newestRelease) usedIds.add(newestRelease.id);

    // One app tile per major category actually present in the catalog
    const categoryTiles: { label: string; apps: AppItem[] }[] = [];
    for (const app of publishedApps) {
      if (usedIds.has(app.id)) continue;
      const existing = categoryTiles.find((c) => c.label === app.category);
      if (existing) {
        existing.apps.push(app);
      } else if (categoryTiles.length < 2) {
        categoryTiles.push({ label: app.category, apps: [app] });
      }
    }
    categoryTiles.forEach((c) => c.apps.forEach((a) => usedIds.add(a.id)));

    return { spotlight, newestRelease, categoryTiles };
  }, [featuredApps, publishedApps, latestApps]);

  const apkCount = useMemo(
    () => publishedApps.filter((a) => hasAuthoritativeApkRelease(a)).length,
    [publishedApps]
  );
  const originalsCount = useMemo(
    () => publishedApps.filter((a) => a.original === true).length,
    [publishedApps]
  );

  if (publishedApps.length === 0) return null;

  return (
    <section aria-labelledby="bento-heading" className="py-10">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#E52B32]">
            Discover
          </p>
          <h2 id="bento-heading" className="text-xl sm:text-2xl font-black text-ink tracking-tight">
            The AppMintly bento
          </h2>
          <p className="text-xs text-mut mt-1">
            Real highlights from the canonical catalog — curated, not click-counted.
          </p>
        </div>
        <Link
          href="/explore"
          className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-ink hover:text-[#E52B32] transition-colors"
        >
          View all <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(150px,auto)] gap-3 sm:gap-4">
        {/* Spotlight tile — 2x2 */}
        {tiles.spotlight && (
          <Link
            href={`/app/${tiles.spotlight.slug}`}
            className="group relative col-span-2 row-span-2 rounded-2xl overflow-hidden border border-line shadow-sm hover:shadow-lg transition-shadow motion-reduce:transition-none card-lift glow-soft min-h-[300px]"
          >
            <img
              src={resolveAsset(tiles.spotlight.banner || tiles.spotlight.icon)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:scale-[1.03] transition-transform duration-500 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              loading="lazy"
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-t from-inkbg via-inkbg/60 to-transparent" aria-hidden />
            <div className="relative h-full flex flex-col justify-end p-4 sm:p-5 text-white">
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {tiles.spotlight.original && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F7B928]/25 border border-[#F7B928]/50 text-[#F7B928] text-[10px] font-extrabold">
                    <Sparkles className="w-3 h-3" aria-hidden /> AppMintly Original
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-white/15 backdrop-blur-xs text-[10px] font-bold">
                  {tiles.spotlight.category}
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black tracking-tight">{tiles.spotlight.name}</h3>
              <p className="text-xs sm:text-sm text-white/80 line-clamp-2 mt-1">
                {tiles.spotlight.shortDescription || tiles.spotlight.description}
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold">
                View app <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" aria-hidden />
              </span>
            </div>
          </Link>
        )}

        {/* APK distribution tile — real count of verified releases */}
        <Link
          href="/explore?filter=apk"
          className="group col-span-2 lg:col-span-1 rounded-2xl border border-line bg-card p-4 shadow-sm hover:shadow-md hover:border-ink/30 transition-all motion-reduce:transition-none card-lift flex flex-col"
        >
          <Download className="w-5 h-5 text-[#E52B32]" aria-hidden />
          <p className="mt-2 text-2xl sm:text-3xl font-black text-ink">{apkCount}</p>
          <p className="text-xs font-semibold text-ink">verified Android APK{apkCount === 1 ? '' : 's'}</p>
          <p className="mt-1 text-[11px] text-mut leading-snug">
            {apkCount > 0
              ? 'Signed, checksummed releases you can verify in your browser.'
              : 'No released APKs yet — web apps remain fully available.'}
          </p>
        </Link>

        {/* Originals tile — real count of original records */}
        <Link
          href="/explore?filter=originals"
          className="group col-span-2 lg:col-span-1 rounded-2xl border border-line bg-card p-4 shadow-sm hover:shadow-md hover:border-ink/30 transition-all motion-reduce:transition-none card-lift flex flex-col"
        >
          <Sparkles className="w-5 h-5 text-[#F7B928]" aria-hidden />
          <p className="mt-2 text-2xl sm:text-3xl font-black text-ink">{originalsCount}</p>
          <p className="text-xs font-semibold text-ink">AppMintly Original{originalsCount === 1 ? '' : 's'}</p>
          <p className="mt-1 text-[11px] text-mut leading-snug">
            First-party products published on the marketplace.
          </p>
        </Link>

        {/* Newest release tile */}
        {tiles.newestRelease && (
          <Link
            href={`/app/${tiles.newestRelease.slug}`}
            className="group col-span-2 lg:col-span-1 rounded-2xl border border-line bg-card p-4 shadow-sm hover:shadow-md hover:border-ink/30 transition-all motion-reduce:transition-none card-lift flex flex-col"
          >
            <Star className="w-5 h-5 text-[#16A765]" aria-hidden />
            <p className="mt-2 text-sm sm:text-base font-black text-ink line-clamp-1">
              {tiles.newestRelease.name}
            </p>
            <p className="text-xs font-semibold text-mut">
              Latest update • v{tiles.newestRelease.version}
            </p>
            <p className="mt-1 text-[11px] text-mut leading-snug line-clamp-2">
              {tiles.newestRelease.shortDescription || tiles.newestRelease.description}
            </p>
            <span className="mt-auto pt-2 inline-flex items-center gap-1 text-[11px] font-bold text-ink group-hover:text-[#E52B32] transition-colors">
              See what&apos;s new <ArrowRight className="w-3 h-3" aria-hidden />
            </span>
          </Link>
        )}

        {/* Category tiles — only categories actually present, real app counts */}
        {tiles.categoryTiles.map((c) => (
          <Link
            key={c.label}
            href={`/category/${c.label.toLowerCase()}`}
            className="group col-span-2 lg:col-span-1 rounded-2xl border border-line bg-card p-4 shadow-sm hover:shadow-md hover:border-ink/30 transition-all motion-reduce:transition-none card-lift flex flex-col"
          >
            <AppWindow className="w-5 h-5 text-[#1976F3]" aria-hidden />
            <p className="mt-2 text-sm sm:text-base font-black text-ink">{c.label}</p>
            <p className="text-xs font-semibold text-mut">
              {c.apps.length} published app{c.apps.length === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[11px] text-mut leading-snug line-clamp-2">
              {c.apps[0]?.shortDescription || c.apps[0]?.description}
            </p>
            <span className="mt-auto pt-2 inline-flex items-center gap-1 text-[11px] font-bold text-ink group-hover:text-[#1976F3] transition-colors">
              Browse {c.label.toLowerCase()} <ArrowRight className="w-3 h-3" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
