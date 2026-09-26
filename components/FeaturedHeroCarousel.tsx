'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Download, ExternalLink, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { BASE_PATH } from '@/lib/api-path';
import { resolveDeveloper } from '@/data/publishers';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { AppIcon } from '@/components/AppIcon';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

interface FeaturedHeroCarouselProps {
  featuredApps: AppItem[];
}

export const FeaturedHeroCarousel: React.FC<FeaturedHeroCarouselProps> = ({ featuredApps }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (featuredApps.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredApps.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [featuredApps.length]);

  if (!featuredApps || featuredApps.length === 0) return null;

  const current = featuredApps[currentIndex];

  // Catalog image paths are repository-relative (e.g. "/brand/x.png").
  // Resolve them against the deployment base path so the hero background
  // loads under the GitHub Pages sub-path like every other catalog asset.
  // Phase 10.10: CTA and size line must follow authoritative release evidence
  // from the canonical catalog record — never the app type, slug or session state.
  const hasApkRelease = hasAuthoritativeApkRelease(current);
  const apkSizeLabel =
    hasApkRelease && current.apk?.fileSizeBytes
      ? `${Math.round(current.apk.fileSizeBytes / 1024)} KB APK`
      : current.size;

  const publisher = resolveDeveloper(current);
  const resolvedIcon =
    current.icon && current.icon.startsWith('/') ? `${BASE_PATH}${current.icon}` : current.icon;
  const heroImage = current.banner || current.icon;
  const resolvedHeroImage = heroImage && heroImage.startsWith('/') ? `${BASE_PATH}${heroImage}` : heroImage;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + featuredApps.length) % featuredApps.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % featuredApps.length);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-inkbg text-white shadow-xl border border-ink/20">
      {/* Background Banner Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={resolvedHeroImage}
          alt={current.name}
          className="w-full h-full object-cover opacity-30 filter brightness-75 scale-105 transition-all duration-700 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-inkbg via-inkbg/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-inkbg via-transparent to-black/30" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 p-6 sm:p-10 lg:p-12 max-w-2xl min-h-[350px] sm:min-h-[400px] flex flex-col justify-between">
        <div>
          {/* Top badge */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E52B32] text-white text-xs font-black tracking-wide uppercase shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Featured App</span>
            </span>
            {current.original && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F7B928]/20 border border-[#F7B928]/40 text-[#F7B928] text-xs font-bold">
                AppMintly Original
              </span>
            )}
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium backdrop-blur-xs">
              {current.category}
            </span>
          </div>

          {/* App logo emphasis — framed hero chip */}
          {resolvedIcon && (
            <div className="mb-4 inline-flex rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 p-1.5 shadow-md">
              <AppIcon
                src={current.icon}
                name={current.name}
                size="xl"
                themeColor={current.themeColor}
                category={current.category}
                className="rounded-xl"
              />
            </div>
          )}

          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-sm leading-tight">
            {current.name}
          </h2>

          <p className="mt-3 text-sm sm:text-base text-white/80 line-clamp-2 max-w-lg leading-relaxed">
            {current.shortDescription || current.description}
          </p>

          <div className="mt-4 flex items-center gap-2.5 text-xs text-white/70 flex-wrap">
            <span className="inline-flex items-center gap-1">
              By {publisher.name}
              {publisher.verified && <VerifiedBadge size="xs" className="[&_svg]:text-[#7FC7A3]" />}
            </span>
            <span aria-hidden="true">•</span>
            <span>v{current.version}</span>
            <span aria-hidden="true">•</span>
            <span>{apkSizeLabel}</span>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3 pt-6 flex-wrap">
          <Link
            href={`/app/${current.slug}`}
            className="btn-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-xs sm:text-sm cursor-pointer"
          >
            {hasApkRelease ? (
              <>
                <Download className="w-4 h-4" />
                <span>Get App</span>
              </>
            ) : current.type === 'Web Game' || current.type === 'Game' ? (
              <>
                <ExternalLink className="w-4 h-4" />
                <span>Play Now</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                <span>Open App</span>
              </>
            )}
          </Link>

          <Link
            href={`/app/${current.slug}`}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm border border-white/20 backdrop-blur-xs transition"
          >
            <span>Details & Features</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Pagination & Next/Prev Controls */}
      <div className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 z-20 flex items-center gap-2">
        <button
          onClick={handlePrev}
          className="p-2 rounded-full bg-black/40 hover:bg-black/70 text-white/80 hover:text-white backdrop-blur-xs transition"
          aria-label="Previous featured app"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Indicators */}
        <div className="flex items-center gap-1.5 px-2">
          {featuredApps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                currentIndex === idx ? 'w-6 bg-[#E52B32]' : 'w-2 bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="p-2 rounded-full bg-black/40 hover:bg-black/70 text-white/80 hover:text-white backdrop-blur-xs transition"
          aria-label="Next featured app"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
