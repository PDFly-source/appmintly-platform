'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  GraduationCap,
  Link2,
  Rocket,
  TrendingUp,
  Clock,
  BadgeCheck,
  Fingerprint,
  Lock,
  Eye,
  FileCheck2,
  SlidersHorizontal,
  Flame,
  Star
} from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';
import { CATEGORIES } from '@/data/categories';
import { PUBLISHERS } from '@/data/publishers';
import { FeaturedHeroCarousel } from '@/components/FeaturedHeroCarousel';
import { BentoShowcase } from '@/components/BentoShowcase';
import { AppCard } from '@/components/AppCard';
import { AppMintlyLogo } from '@/components/AppMintlyLogo';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Reveal } from '@/components/Reveal';
import { PremiumHeroVisual } from '@/components/PremiumHeroVisual';
import { HeroFeatureIndicators } from '@/components/HeroFeatureIndicators';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

export default function HomePage() {
  const router = useRouter();
  const { publishedApps, featuredApps, latestApps, newApps } = useCatalog();
  const [searchQuery, setSearchQuery] = React.useState('');

  // Categorized published applications derived purely from canonical catalog
  const educationApps = publishedApps.filter((a) => a.category.toLowerCase() === 'education');
  const apkApps = publishedApps.filter((a) => a.type === 'Android APK');

  // Web app family (Web App + PWA) — driven by real catalog data only.
  const webApps = publishedApps.filter((a) =>
    ['web app', 'pwa', 'web_app'].includes((a.type || '').toLowerCase())
  );

  // Curated trending picks: explicit curation (featured apps, most recent first).
  // This is NOT analytics-based; the label says "Curated".
  const trendingApps = [...featuredApps]
    .sort((a, b) => {
      const dateA = new Date(a.lastUpdated || a.updatedAt || a.releaseDate || 0).getTime();
      const dateB = new Date(b.lastUpdated || b.updatedAt || b.releaseDate || 0).getTime();
      return dateB - dateA;
    })
    .slice(0, 6);

  // Platform/type discovery — real counts from the published catalog.
  const platformCounts = React.useMemo(() => {
    const counts = new Map<string, { type: string; count: number }>();
    for (const a of publishedApps) {
      const key = a.type || 'Other';
      const entry = counts.get(key);
      counts.set(key, { type: key, count: entry ? entry.count + 1 : 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [publishedApps]);

  // Verified publishers with truthful, live app counts.
  const publishersWithApps = PUBLISHERS.map((p) => ({
    ...p,
    appCount: publishedApps.filter((a) => a.developerSlug === p.slug).length,
  })).filter((p) => p.appCount > 0);

  // Popular Categories — Phase 18. Real counts only: platform-type families
  // (Android/Web) from authoritative catalog signals, plus real CATEGORIES
  // entries. A count of 0 is shown honestly as "Coming Soon" (same
  // convention as the existing /categories page) rather than hidden or
  // padded with fabricated content.
  const popularCategoryTiles = React.useMemo(() => {
    const androidCount = publishedApps.filter((a) => hasAuthoritativeApkRelease(a)).length;
    const webAppCount = webApps.length;
    const countForCategory = (slug: string) =>
      publishedApps.filter((a) => (a.category || '').toLowerCase().replace(/\s+/g, '-') === slug).length;
    return [
      { label: 'Android Apps', href: '/explore?type=Android+APK', Icon: Smartphone, color: '#16A765', count: androidCount },
      { label: 'Web Apps', href: '/explore?type=Web+App', Icon: Globe, color: '#1565E8', count: webAppCount },
      { label: 'Games', href: '/explore?category=games', Icon: Gamepad2, color: '#E31E24', count: countForCategory('games') },
      { label: 'Tools', href: '/explore?category=tools', Icon: Wrench, color: '#F4B400', count: countForCategory('tools') },
      { label: 'Utilities', href: '/explore?category=utilities', Icon: Layers, color: '#1248A8', count: countForCategory('utilities') },
      { label: 'More', href: '/categories', Icon: FolderOpen, color: '#6F6F6F', count: -1 },
    ];
  }, [publishedApps, webApps]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  };

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* 1. HERO — Phase 19: premium dark hero banner. Replaces the Phase 18
          light-card hero visual entirely (component removed, not hidden). */}
      <section className="relative px-4 sm:px-6 pt-6 sm:pt-10 max-w-7xl mx-auto overflow-hidden">
        <div className="relative overflow-hidden rounded-3xl bg-inkbg text-white shadow-2xl border border-white/10 mb-8 sm:mb-10">
          {/* Restrained atmospheric glow — brand accents only, no stock imagery */}
          <div
            className="absolute -top-24 -left-16 w-72 h-72 rounded-full opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(22,167,101,0.5), transparent 70%)', filter: 'blur(50px)' }}
          />
          <div
            className="absolute -bottom-24 -right-10 w-80 h-80 rounded-full opacity-25 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(21,101,232,0.5), transparent 70%)', filter: 'blur(55px)' }}
          />
          <div
            className="absolute top-1/2 right-1/3 w-56 h-56 rounded-full opacity-15 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(244,180,0,0.5), transparent 70%)', filter: 'blur(45px)' }}
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10 items-center p-5 sm:p-10 lg:p-14">
            {/* Hero copy */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5 order-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white text-[11px] font-black uppercase tracking-wider">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                Verified Apps &amp; Tools
              </span>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08]">
                <span className="block text-white">Discover.</span>
                <span className="block" style={{ color: '#16A765' }}>Install.</span>
                <span className="block" style={{ color: '#3B93FF' }}>Experience.</span>
              </h1>

              <p className="text-base sm:text-lg text-white/70 max-w-xl leading-relaxed">
                Your digital world, one place. Browse verified apps, web apps, games, tools and websites &mdash; fast, lightweight and directly accessible on any device.
              </p>

              <div className="pt-1">
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5"
                  style={{ backgroundColor: '#16A765' }}
                >
                  Explore Apps
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Premium hero visual — code-built, real AppMintly mark, no stock imagery */}
            <div className="lg:col-span-5 flex justify-center order-2">
              <PremiumHeroVisual />
            </div>

            {/* Feature indicators — truthful product-level labels only, full width beneath
                both columns. Hidden below sm: the Phase 19 mobile hero order is strictly
                eyebrow -> headline -> description -> CTA -> compact visual, and this keeps
                the mobile hero from growing tall with duplicate content (the same 4 facts
                are also always visible in the trust strip just below the search bar). */}
            <div className="hidden sm:block col-span-1 lg:col-span-12 order-3">
              <HeroFeatureIndicators dark className="max-w-xl lg:max-w-none" />
            </div>
          </div>
        </div>

        {/* Dominant search */}
        <form
          onSubmit={handleSearch}
          role="search"
          aria-label="Search the AppMintly catalog"
          className="flex items-center gap-2 bg-card border border-line rounded-full p-1.5 pl-4 shadow-sm max-w-2xl focus-within:ring-2 focus-within:ring-[#1976F3]/40 transition"
        >
          <Search className="w-4 h-4 text-mut shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search apps, web apps, games, tools, websites..."
            aria-label="Search apps, web apps, games, tools, websites"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-mut/70 min-w-0"
          />
          <Link
            href="/explore"
            aria-label="Open filters and sorting on the Explore page"
            title="Filters"
            className="hidden sm:inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-full text-mut hover:text-ink hover:bg-page transition"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          </Link>
          <button
            type="submit"
            className="shrink-0 px-5 py-2.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold transition"
          >
            Search
          </button>
        </form>

        {/* Quick discovery buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-2xl">
          <Link
            href="/explore"
            className="inline-flex items-center justify-between gap-2 px-5 py-3.5 rounded-2xl text-white text-sm font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5"
            style={{ backgroundColor: '#087A5B' }}
          >
            <span className="inline-flex items-center gap-2">
              <Compass className="w-4 h-4" />
              Explore Apps
            </span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/categories"
            className="inline-flex items-center justify-between gap-2 px-5 py-3.5 rounded-2xl bg-inkbg text-white text-sm font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5"
          >
            <span className="inline-flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Categories
            </span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Discovery chips — real filters on the Explore page */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 mt-4 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Quick discovery">
          <Link
            href="/explore?featured=true"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E31E24] text-white text-xs font-bold transition"
          >
            <Star className="w-3.5 h-3.5" />
            Featured
          </Link>
          <Link
            href="/explore?sort=newest"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-line hover:border-ink/40 text-ink text-xs font-bold transition"
          >
            <Flame className="w-3.5 h-3.5 text-[#F4B400]" />
            New
          </Link>
          <Link
            href="/explore?category=games"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-line hover:border-ink/40 text-ink text-xs font-bold transition"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-[#E31E24]" />
            Games
          </Link>
          <Link
            href="/explore?category=tools"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-line hover:border-ink/40 text-ink text-xs font-bold transition"
          >
            <Wrench className="w-3.5 h-3.5 text-[#F4B400]" />
            Tools
          </Link>
          <Link
            href="/explore?type=Web+App"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-line hover:border-ink/40 text-ink text-xs font-bold transition"
          >
            <Globe className="w-3.5 h-3.5 text-[#1565E8]" />
            Web Apps
          </Link>
        </div>

        {/* Trust strip (truthful, evidence-backed capabilities only) */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-2xl border border-line bg-card/70 px-4 py-3 shadow-xs">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/80">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A765]" aria-hidden="true" />
            Verified Releases
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/80">
            <Fingerprint className="w-3.5 h-3.5 text-[#16A765]" aria-hidden="true" />
            SHA-256 Available
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/80">
            <Link2 className="w-3.5 h-3.5 text-[#16A765]" aria-hidden="true" />
            Official Release Links
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/80">
            <FileCheck2 className="w-3.5 h-3.5 text-[#16A765]" aria-hidden="true" />
            Transparent Versions
          </span>
        </div>
      </section>

      {/* 2. FEATURED APP SPOTLIGHT — Phase 18: dedicated section, single real
          featured app (rotates through every featured=true record). */}
      {featuredApps.length > 0 ? (
        <Reveal>
          <section className="px-4 sm:px-6 max-w-7xl mx-auto mt-10 mb-10" aria-label="Featured app">
            <div className="flex items-end justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-black text-ink tracking-tight">Featured App</h2>
              <Link
                href="/explore?featured=true"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
              >
                See All
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <FeaturedHeroCarousel featuredApps={featuredApps} />
          </section>
        </Reveal>
      ) : (
        <div className="px-4 sm:px-6 max-w-7xl mx-auto mt-10 mb-10">
          <div className="rounded-3xl border border-dashed border-ink/15 bg-card/60 flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Sparkles className="w-5 h-5 text-mut" aria-hidden="true" />
            <p className="text-sm font-bold text-ink">No Featured Apps right now</p>
            <p className="text-xs text-mut max-w-xs">
              The AppMintly team curates which published apps are featured here.
            </p>
          </div>
        </div>
      )}

      {/* 3. POPULAR CATEGORIES — Phase 18: real taxonomy + real live counts;
          zero-count categories are honestly labeled "Coming Soon" rather
          than hidden or fabricated, matching the existing /categories page
          convention (Categories Experience 2.0). */}
      <Reveal>
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-10" aria-label="Popular categories">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-black text-ink tracking-tight">Popular Categories</h2>
            <Link
              href="/categories"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
            >
              See All
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {popularCategoryTiles.map((tile) => (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex flex-col items-center gap-2 rounded-2xl bg-card border border-line hover:border-ink/30 px-3 py-4 text-center transition"
              >
                <span
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                  style={{ backgroundColor: `${tile.color}1F` }}
                >
                  <tile.Icon className="w-5 h-5" style={{ color: tile.color }} aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-ink leading-tight">{tile.label}</span>
                <span className="text-[10px] text-mut leading-tight">
                  {tile.count > 0 ? `${tile.count} app${tile.count === 1 ? '' : 's'}` : tile.count === -1 ? 'Explore all' : 'Coming Soon'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>
      <div className="px-4 sm:px-6 max-w-7xl mx-auto">
        <BentoShowcase featuredApps={featuredApps} publishedApps={publishedApps} latestApps={latestApps} />
      </div>

      {/* 4. FEATURED APPLICATIONS GRID */}
      <Reveal>
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14 mt-10 rounded-3xl gradient-wash py-2" aria-label="Featured applications">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#E52B32] bg-[#E52B32]/10 px-2.5 py-1 rounded-md mb-1.5 border border-[#E52B32]/25">
              <Sparkles className="w-3.5 h-3.5 text-[#E52B32]" />
              <span>Featured App Spotlight</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Featured Applications
            </h2>
            <p className="text-xs sm:text-sm text-mut mt-1">
              Top curated web applications, tools, and platforms on AppMintly.
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
            {featuredApps.map((app, i) => (
              <Reveal key={app.id} delay={Math.min(i, 5) * 0.06} className="h-full">
                <AppCard app={app} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-card border border-line text-center text-mut">
            <p>No featured applications found.</p>
          </div>
        )}
      </section>
      </Reveal>

      {/* 4. TRENDING — CURATED (truthful: editor curation, not download analytics) */}
      {trendingApps.length > 0 && (
        <Reveal>
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Trending curated picks">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#E52B32] bg-[#E52B32]/10 px-2.5 py-1 rounded-md mb-1.5 border border-[#E52B32]/25">
                <TrendingUp className="w-3.5 h-3.5 text-[#E52B32]" />
                <span>Curated Selection</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
                Trending on AppMintly
              </h2>
              <p className="text-xs sm:text-sm text-mut mt-1">
                Hand-picked highlights from the AppMintly editors — curated, not click-counted.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trendingApps.map((app, i) => (
              <Reveal key={app.id} delay={Math.min(i, 5) * 0.06} className="h-full">
                <AppCard app={app} />
              </Reveal>
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* 5. RECENTLY ADDED */}
      {newApps.length > 0 && (
        <Reveal>
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Recently added applications">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#16A765] bg-[#16A765]/10 px-2.5 py-1 rounded-md mb-1.5 border border-[#16A765]/25">
                <Clock className="w-3.5 h-3.5 text-[#16A765]" />
                <span>Fresh Arrivals</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
                Recently Added
              </h2>
              <p className="text-xs sm:text-sm text-mut mt-1">
                The newest applications to join the AppMintly catalog.
              </p>
            </div>
            <Link
              href="/explore?sort=newest"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
            >
              <span>See All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {newApps.slice(0, 6).map((app, i) => (
              <Reveal key={app.id} delay={Math.min(i, 5) * 0.06} className="h-full">
                <AppCard app={app} />
              </Reveal>
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* 6. LATEST RELEASES & RECENT APPLICATIONS */}
      <Reveal>
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Latest applications">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Latest Applications
            </h2>
            <p className="text-xs sm:text-sm text-mut mt-1">
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
          {latestApps.slice(0, 6).map((app, i) => (
            <Reveal key={app.id} delay={Math.min(i, 5) * 0.06} className="h-full">
              <AppCard app={app} />
            </Reveal>
          ))}
        </div>
      </section>
      </Reveal>

      {/* 7. EDUCATION & LEARNING HIGHLIGHT (STUDYRIA FOCUS) */}
      {educationApps.length > 0 && (
        <Reveal>
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Education and exam preparation">
          <div className="p-6 sm:p-8 rounded-3xl bg-radial from-[#16A765]/10 via-card to-card border border-[#16A765]/30 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30 mb-2">
                  <GraduationCap className="w-3.5 h-3.5" /> Education &amp; Career
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
                  Learning &amp; Exam Preparation
                </h3>
                <p className="text-xs sm:text-sm text-mut mt-1 leading-relaxed">
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
              {educationApps.map((app, i) => (
                <Reveal key={app.id} delay={Math.min(i, 5) * 0.06} className="h-full">
                  <AppCard app={app} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
        </Reveal>
      )}

      {/* 8. POPULAR WEB APPS (real catalog data only) */}
      {webApps.length > 0 && (
        <Reveal>
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Popular web apps">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#1976F3] bg-[#1976F3]/10 px-2.5 py-1 rounded-md mb-1.5 border border-[#1976F3]/25">
                <Globe className="w-3.5 h-3.5 text-[#1976F3]" />
                <span>Run in Your Browser</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
                Popular Web Apps
              </h2>
              <p className="text-xs sm:text-sm text-mut mt-1">
                Installable web apps and PWAs — no store required.
              </p>
            </div>
            <Link
              href="/explore?type=Web+App"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#1976F3] hover:text-[#0f55b8] transition"
            >
              <span>All Web Apps</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {webApps.slice(0, 6).map((app, i) => (
              <Reveal key={app.id} delay={Math.min(i, 5) * 0.06} className="h-full">
                <AppCard app={app} />
              </Reveal>
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* 9. ANDROID APK CORNER (IF ANY REAL APKS ARE PUBLISHED) */}
      {apkApps.length > 0 && (
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Direct Android APK downloads">
          <div className="p-6 sm:p-8 rounded-3xl bg-card border border-line shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30 mb-2">
                  <Smartphone className="w-3.5 h-3.5" /> Direct Android APKs
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
                  Download Verified Android Packages
                </h3>
                <p className="text-xs sm:text-sm text-mut mt-1 leading-relaxed">
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
              {apkApps.map((app, i) => (
                <Reveal key={app.id} delay={Math.min(i, 5) * 0.06}>
                  <AppCard app={app} variant="compact" />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 10. VERIFIED PUBLISHERS (real publisher identities with live app counts) */}
      {publishersWithApps.length > 0 && (
        <Reveal>
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Verified publishers">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#F7B928] bg-[#F7B928]/10 px-2.5 py-1 rounded-md mb-1.5 border border-[#F7B928]/25">
                <BadgeCheck className="w-3.5 h-3.5 text-[#F7B928]" />
                <span>Trusted Developers</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
                Verified Publishers
              </h2>
              <p className="text-xs sm:text-sm text-mut mt-1">
                Publisher identities verified by the AppMintly team.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {publishersWithApps.map((p, i) => (
              <Reveal key={p.slug} delay={Math.min(i, 5) * 0.06} className="h-full">
              <Link
                href={`/publisher/${p.slug}`}
                className="group flex items-center gap-4 p-5 rounded-2xl bg-card border border-line hover:border-ink/35 hover:shadow-xs transition-all h-full"
              >
                <div
                  className="w-12 h-12 rounded-xl bg-inkbg text-white flex items-center justify-center text-base font-black shrink-0"
                  aria-hidden="true"
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-black truncate group-hover:text-[#1976F3] transition-colors">
                      {p.name}
                    </h3>
                    {p.verified && <VerifiedBadge size="xs" />}
                  </div>
                  <p className="text-xs text-mut mt-0.5">
                    {p.appCount} published {p.appCount === 1 ? 'application' : 'applications'}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-mut group-hover:text-[#1976F3] group-hover:translate-x-0.5 transition shrink-0" />
              </Link>
              </Reveal>
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* 11. DISCOVER BY PLATFORM (real catalog counts) */}
      {platformCounts.length > 0 && (
        <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Discover by platform">
          <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight mb-2">
            Discover by Platform
          </h2>
          <p className="text-xs sm:text-sm text-mut mb-6">
            Every format in the catalog, with live application counts.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {platformCounts.map(({ type, count }) => (
              <Link
                key={type}
                href={`/explore?type=${encodeURIComponent(type)}`}
                className="group p-5 rounded-2xl bg-card border border-line hover:border-ink/35 hover:shadow-xs transition-all text-center"
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  {(type.toLowerCase().includes('apk') || type.toLowerCase().includes('android')) && (
                    <Smartphone className="w-4 h-4 text-[#16A765]" aria-hidden="true" />
                  )}
                  {!type.toLowerCase().includes('apk') && !type.toLowerCase().includes('android') && (
                    <Globe className="w-4 h-4 text-[#1976F3]" aria-hidden="true" />
                  )}
                  <h3 className="text-sm font-black group-hover:text-[#1976F3] transition-colors">
                    {type}
                  </h3>
                </div>
                <p className="text-2xl font-black text-ink">{count}</p>
                <p className="text-[11px] text-mut mt-0.5">
                  {count === 1 ? 'application' : 'applications'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 12. WHY APPMINTLY */}
      <Reveal>
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="Why AppMintly">
        <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight mb-2">
          Why AppMintly
        </h2>
        <p className="text-xs sm:text-sm text-mut mb-6">
          A marketplace built around transparency, directness, and user control.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="p-6 rounded-2xl bg-card border border-line">
            <div className="w-10 h-10 rounded-xl bg-[#E52B32]/10 flex items-center justify-center mb-3" aria-hidden="true">
              <Zap className="w-5 h-5 text-[#E52B32]" />
            </div>
            <h3 className="text-sm font-black mb-1.5">Direct Access</h3>
            <p className="text-xs text-mut leading-relaxed">
              Apps launch straight from the publisher. No walled gardens, no lock-in — web apps open directly, APKs download from official release links.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-card border border-line">
            <div className="w-10 h-10 rounded-xl bg-[#16A765]/10 flex items-center justify-center mb-3" aria-hidden="true">
              <FolderOpen className="w-5 h-5 text-[#16A765]" />
            </div>
            <h3 className="text-sm font-black mb-1.5">One Unified Catalog</h3>
            <p className="text-xs text-mut leading-relaxed">
              Web apps, PWAs, Android packages, games, tools, and websites — organized in a single searchable marketplace.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-card border border-line">
            <div className="w-10 h-10 rounded-xl bg-[#1976F3]/10 flex items-center justify-center mb-3" aria-hidden="true">
              <ShieldCheck className="w-5 h-5 text-[#1976F3]" />
            </div>
            <h3 className="text-sm font-black mb-1.5">Honest Metadata</h3>
            <p className="text-xs text-mut leading-relaxed">
              Versions, sizes, and checksums come from real release data — verified before anything reaches the storefront.
            </p>
          </div>
        </div>
      </section>
      </Reveal>

      {/* 13. SECURITY / TRUST */}
      <Reveal>
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-16" aria-label="Security and trust">
        <div className="rounded-3xl bg-card border border-line shadow-xs p-6 sm:p-10">
          <div className="flex items-center gap-2.5 mb-2">
            <ShieldCheck className="w-6 h-6 text-[#16A765]" aria-hidden="true" />
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Trust &amp; Safety</h2>
          </div>
          <p className="text-xs sm:text-sm text-mut mb-6 max-w-2xl leading-relaxed">
            Every application on AppMintly is served with verifiable release information.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-page border border-line">
              <Link2 className="w-5 h-5 text-[#16A765] mb-2" aria-hidden="true" />
              <h3 className="text-xs font-black mb-1">Official Release Links</h3>
              <p className="text-[11px] text-mut leading-relaxed">
                APK downloads point directly to the publisher&apos;s official GitHub release assets.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-page border border-line">
              <BadgeCheck className="w-5 h-5 text-[#16A765] mb-2" aria-hidden="true" />
              <h3 className="text-xs font-black mb-1">Verified Publishers</h3>
              <p className="text-[11px] text-mut leading-relaxed">
                Publisher identities are verified at the repository level by the AppMintly team.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-page border border-line">
              <Fingerprint className="w-5 h-5 text-[#16A765] mb-2" aria-hidden="true" />
              <h3 className="text-xs font-black mb-1">SHA-256 Checksums</h3>
              <p className="text-[11px] text-mut leading-relaxed">
                Every published APK lists its SHA-256 checksum so you can verify integrity.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-page border border-line">
              <Eye className="w-5 h-5 text-[#16A765] mb-2" aria-hidden="true" />
              <h3 className="text-xs font-black mb-1">Transparent Versions</h3>
              <p className="text-[11px] text-mut leading-relaxed">
                Version numbers, sizes, and update dates are shown as they were released.
              </p>
            </div>
          </div>
        </div>
      </section>
      </Reveal>

      {/* 14. APP INSTALLATION CTA / DESKTOP RUNTIME BANNER */}
      <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-16">
        <div className="rounded-3xl bg-inkbg text-white p-6 sm:p-10 border border-ink/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1976F3] text-white text-xs font-bold uppercase tracking-wider">
              <Rocket className="w-3.5 h-3.5" /> APPMINTLY PLATFORM
            </span>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Install AppMintly Directly to Your Home Screen
            </h3>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">
              AppMintly works seamlessly as a standalone application on Android, iOS, Windows, macOS, and Linux. Enjoy instantaneous catalog search, real-time updates, and an offline-ready library.
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
