'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Download, ExternalLink, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { AppItem } from '@/data/apps';
import { BASE_PATH } from '@/lib/api-path';

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
  const heroImage = current.banner || current.icon;
  const resolvedHeroImage = heroImage && heroImage.startsWith('/') ? `${BASE_PATH}${heroImage}` : heroImage;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + featuredApps.length) % featuredApps.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % featuredApps.length);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#17191C] text-white shadow-xl border border-[#17191C]/20">
      {/* Background Banner Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={resolvedHeroImage}
          alt={current.name}
          className="w-full h-full object-cover opacity-30 filter brightness-75 scale-105 transition-all duration-700 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17191C] via-[#17191C]/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#17191C] via-transparent to-black/30" />
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

          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-sm leading-tight">
            {current.name}
          </h2>

          <p className="mt-3 text-sm sm:text-base text-white/80 line-clamp-2 max-w-lg leading-relaxed">
            {current.shortDescription || current.description}
          </p>

          <div className="mt-4 flex items-center gap-3 text-xs text-white/70">
            <span>By {current.developer}</span>
            <span>•</span>
            <span>v{current.version}</span>
            <span>•</span>
            <span>{current.size}</span>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3 pt-6 flex-wrap">
          <Link
            href={`/app/${current.slug}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E52B32] hover:bg-[#b81f25] text-white font-bold text-xs sm:text-sm shadow-md transition-all transform hover:-translate-y-0.5"
          >
            {current.type === 'Android APK' ? (
              <>
                <Download className="w-4 h-4" />
                <span>Download APK</span>
              </>
            ) : current.type === 'Web Game' || current.type === 'Game' ? (
              <>
                <ExternalLink className="w-4 h-4" />
                <span>Play Now</span>
              </>
            ) : current.slug === 'studyria' || current.id === 'studyria' || current.type === 'PWA' ? (
              <>
                <ExternalLink className="w-4 h-4" />
                <span>Get App</span>
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
