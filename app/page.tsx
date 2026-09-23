'use client';

import React from 'react';
import Link from 'next/link';
import {
  Compass,
  Sparkles,
  ArrowRight,
  Smartphone,
  Globe,
  Gamepad2,
  Wrench,
  Search,
  CheckCircle2,
  Layers,
  Zap,
  ShieldCheck,
  FolderOpen,
  GraduationCap
} from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';
import { CATEGORIES } from '@/data/categories';
import { FeaturedHeroCarousel } from '@/components/FeaturedHeroCarousel';
import { AppCard } from '@/components/AppCard';

export default function HomePage() {
  const { publishedApps, featuredApps, latestApps, newApps } = useCatalog();

  // Categorized published applications derived purely from canonical catalog
  const originalApps = publishedApps.filter((a) => a.original);
  const apkApps = publishedApps.filter((a) => a.type === 'Android APK');
  const educationApps = publishedApps.filter((a) => a.category.toLowerCase() === 'education');
  const toolApps = publishedApps.filter((a) => a.type === 'Tool' || a.category.toLowerCase() === 'tools');

  return (
    <div className="min-h-screen bg-[#F8F2E7] text-[#17191C]">
      {/* 1. HERO SECTION */}
      <section className="relative px-4 sm:px-6 pt-6 sm:pt-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-8 sm:mb-12">
          {/* Hero Text */}
          <div className="lg:col-span-6 space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFFDF8] border border-[#E8DED0] shadow-2xs text-xs font-bold text-[#17191C]">
              <span className="w-2 h-2 rounded-full bg-[#16A765] animate-pulse"></span>
              <span className="text-[#16A765] font-black">APPFORGE</span>
              <span className="text-[#6F6F6F]">•</span>
              <span>Universal App Marketplace</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[#17191C] leading-[1.08]">
              Explore Apps &amp; Software
            </h1>

            <p className="text-base sm:text-lg text-[#6F6F6F] max-w-xl leading-relaxed">
              Discover verified web apps, installable tools, games and APKs. Fast, zero tracking bloat, and directly accessible on any device.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-sm font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5"
              >
                <Compass className="w-4 h-4" />
                <span>Explore Marketplace</span>
              </Link>

              <Link
                href="/categories"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#FFFDF8] hover:bg-white text-[#17191C] text-sm font-bold border border-[#E8DED0] shadow-xs transition"
              >
                <Layers className="w-4 h-4 text-[#1976F3]" />
                <span>Browse Categories</span>
              </Link>
            </div>

            {/* Quick platform badges */}
            <div className="flex items-center gap-4 pt-2 text-xs text-[#6F6F6F] flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#1976F3]" /> Web Applications
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-[#16A765]" /> Educational Portals
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-[#F7B928]" /> Utility &amp; Dev Tools
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#16A765]" /> Android Packages
              </span>
            </div>
          </div>

          {/* Hero Featured Spotlight Carousel */}
          <div className="lg:col-span-6">
            <FeaturedHeroCarousel featuredApps={featuredApps.length > 0 ? featuredApps : publishedApps.slice(0, 3)} />
          </div>
        </div>

        {/* 2. CATEGORY QUICK CHIPS */}
        <div className="border-t border-b border-[#E8DED0]/80 py-4 mb-10 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2.5 min-w-max pb-1">
            <span className="text-xs font-black uppercase tracking-wider text-[#6F6F6F] mr-2">
              Categories:
            </span>
            {CATEGORIES.slice(0, 10).map((cat) => (
              <Link
                key={cat.id}
                href={`/explore?category=${encodeURIComponent(cat.slug)}`}
                className="px-3.5 py-1.5 rounded-full bg-[#FFFDF8] hover:bg-white border border-[#E8DED0] hover:border-[#17191C]/30 text-xs font-semibold text-[#17191C] transition-all shadow-2xs hover:shadow-xs"
              >
                {cat.name}
              </Link>
            ))}
            <Link
              href="/categories"
              className="px-3.5 py-1.5 rounded-full bg-[#F8F2E7] hover:bg-[#17191C] hover:text-white border border-[#E8DED0] text-xs font-bold text-[#17191C] transition-all"
            >
              All Categories &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* 3. FEATURED APPLICATIONS GRID */}
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#E52B32] bg-[#E52B32]/10 px-2.5 py-1 rounded-md mb-1.5 border border-[#E52B32]/25">
              <Sparkles className="w-3.5 h-3.5 text-[#E52B32]" />
              <span>Featured App Spotlight</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-[#17191C] tracking-tight">
              Featured Applications
            </h2>
            <p className="text-xs sm:text-sm text-[#6F6F6F] mt-1">
              Top curated web applications, tools, and platforms on APPFORGE.
            </p>
          </div>
          <Link
            href="/explore"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
          >
            <span>View All Apps</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {featuredApps.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featuredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-[#FFFDF8] border border-[#E8DED0] text-center text-[#6F6F6F]">
            <p>No featured applications found.</p>
          </div>
        )}
      </section>

      {/* 4. LATEST RELEASES & RECENT APPLICATIONS */}
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-[#17191C] tracking-tight">
              Latest Applications
            </h2>
            <p className="text-xs sm:text-sm text-[#6F6F6F] mt-1">
              Recently added and updated software from verified publishers.
            </p>
          </div>
          <Link
            href="/explore?sort=newest"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
          >
            <span>See All Latest</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {latestApps.slice(0, 6).map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </section>

      {/* 5. EDUCATION & LEARNING HIGHLIGHT (STUDYRIA FOCUS) */}
      {educationApps.length > 0 && (
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14">
          <div className="p-6 sm:p-8 rounded-3xl bg-radial from-[#16A765]/10 via-[#FFFDF8] to-[#FFFDF8] border border-[#16A765]/30 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30 mb-2">
                  <GraduationCap className="w-3.5 h-3.5" /> Education &amp; Career
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-[#17191C] tracking-tight">
                  Learning &amp; Exam Preparation
                </h3>
                <p className="text-xs sm:text-sm text-[#6F6F6F] mt-1 leading-relaxed">
                  High-yield study materials, interactive quizzes, mock tests, and syllabus notes.
                </p>
              </div>
              <Link
                href="/explore?category=education"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#16A765] hover:bg-[#128a53] text-white text-xs font-bold transition shadow-xs self-start md:self-auto"
              >
                <span>Browse Education</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {educationApps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6. ANDROID APK CORNER (IF ANY REAL APKS ARE PUBLISHED) */}
      {apkApps.length > 0 && (
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14">
          <div className="p-6 sm:p-8 rounded-3xl bg-[#FFFDF8] border border-[#E8DED0] shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30 mb-2">
                  <Smartphone className="w-3.5 h-3.5" /> Direct Android APKs
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-[#17191C] tracking-tight">
                  Download Verified Android Packages
                </h3>
                <p className="text-xs sm:text-sm text-[#6F6F6F] mt-1 leading-relaxed">
                  Download verified APKs directly to your device without requiring store lock-in.
                </p>
              </div>
              <Link
                href="/explore?type=Android+APK"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#16A765] hover:bg-[#128a53] text-white text-xs font-bold transition shadow-xs self-start md:self-auto"
              >
                <span>Browse All APKs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apkApps.map((app) => (
                <AppCard key={app.id} app={app} variant="compact" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7. APP INSTALLATION & DESKTOP RUNTIME BANNER */}
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-16">
        <div className="rounded-3xl bg-[#17191C] text-white p-6 sm:p-10 border border-[#17191C]/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1976F3] text-white text-xs font-bold uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5" /> APPFORGE PLATFORM
            </span>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Install APPFORGE Directly to Your Home Screen
            </h3>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">
              APPFORGE works seamlessly as a standalone application on Android, iOS, Windows, macOS, and Linux. Enjoy instantaneous catalog search, real-time updates, and an offline-ready library.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full md:w-auto">
            <Link
              href="/explore"
              className="text-center px-6 py-3 rounded-full bg-[#E52B32] hover:bg-[#b81f25] text-white text-xs sm:text-sm font-bold shadow-md transition"
            >
              Explore Catalog Now
            </Link>
            <Link
              href="/about"
              className="text-center px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-semibold border border-white/20 transition"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
