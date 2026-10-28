'use client';

/**
 * Phase 1E — AppMintly Lab: premium horizontal app showcase.
 *
 * The Lab is now a mobile-first, horizontally swipeable product showcase
 * (CSS scroll-snap + native scrolling — no carousel dependency) with a
 * fixed card order: the real roadmap records in catalog order, followed
 * by the "More Apps Coming Soon" promotional card (which is NOT an app
 * record and never affects filter counts).
 *
 * Data: version-controlled data/upcoming-apps.json (no backend, no DB).
 * Voting: local-only (lib/upcoming-votes.ts) with the honest scope label
 * always visible; orphaned votes for retired entries are pruned on load.
 * The Lab never shows download buttons, versions or repository links —
 * these are roadmap records, not installable catalog apps.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronLeft,
  Search,
  ChevronRight,
  FlaskConical,
  Info,
  Map as MapIcon,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import { getUpcomingApps, ROADMAP_STATUS_LABEL } from '@/data/upcoming-apps';
import type { UpcomingApp } from '@/data/upcoming-apps';
import { UpcomingAppCard } from '@/components/UpcomingAppCard';
import { localVoteCount, pruneOrphanVotes, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';
import { localWishlistCount, pruneOrphanWishlist } from '@/lib/upcoming-wishlist';

const FILTERS: { id: 'all' | UpcomingApp['roadmapStatus']; label: string; caption: string }[] = [
  { id: 'all', label: 'All Projects', caption: 'Every roadmap record' },
  { id: 'planned', label: 'Planned', caption: 'Idea & planning ahead' },
  { id: 'in-development', label: 'In Development', caption: 'Being built now' },
  { id: 'early-testing', label: 'Early Testing', caption: 'Internal testing only' },
  { id: 'published', label: 'Published / Released', caption: 'Live and publicly available' },
];

const FILTER_HINTS: Record<UpcomingApp['roadmapStatus'], string> = {
  'in-development': 'in development',
  planned: 'planned',
  'early-testing': 'in early testing',
  published: 'published / released',
};

export default function LabClient() {
  const upcoming = useMemo(() => getUpcomingApps(), []);
  const [filter, setFilter] = useState<'all' | UpcomingApp['roadmapStatus']>('all');
  const [localVotes, setLocalVotes] = useState<number | null>(null);
  const [localSaved, setLocalSaved] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Real categories derived from the shipped records (never hardcoded).
  const categories = useMemo(
    () => Array.from(new Set(upcoming.map((u) => u.category))).sort(),
    [upcoming]
  );

  const projectsRef = useRef<HTMLDivElement>(null);
  const roadmapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // Read the local vote count after mount (localStorage is client-only —
  // computing it during render would break hydration). Also prune votes
  // for retired roadmap entries so this device's count stays honest.
  React.useEffect(() => {
    const refresh = () => {
      setLocalVotes(localVoteCount());
      setLocalSaved(localWishlistCount());
    };
    pruneOrphanVotes(upcoming.map((u) => u.id));
    pruneOrphanWishlist(upcoming.map((u) => u.id));
    refresh();
    window.addEventListener('appmintly_upcoming_votes_updated', refresh);
    window.addEventListener('appmintly_upcoming_wishlist_updated', refresh);
    return () => {
      window.removeEventListener('appmintly_upcoming_votes_updated', refresh);
      window.removeEventListener('appmintly_upcoming_wishlist_updated', refresh);
    };
  }, [upcoming]);

  const visible = useMemo(() => {
    let out = filter === 'all' ? upcoming : upcoming.filter((u) => u.roadmapStatus === filter);
    if (categoryFilter !== 'all') out = out.filter((u) => u.category === categoryFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.purpose.toLowerCase().includes(q) ||
          u.category.toLowerCase().includes(q)
      );
    }
    return out;
  }, [filter, upcoming, query, categoryFilter]);

  // Slides = the visible app cards (+ the promo card in the All view, but
  // ONLY when at least one real app card is shown — the promo slide never
  // stands alone and never inflates the app/project counts).
  const promoShown = filter === 'all' && visible.length > 0;
  const slides = useMemo(
    () => (promoShown ? visible.length + 1 : visible.length),
    [promoShown, visible]
  );

  // Compare Apps — selection of REAL app records only (promo excluded).
  const MAX_COMPARE = 3;
  const compareApps = useMemo(
    () => upcoming.filter((u) => compareIds.includes(u.id)),
    [upcoming, compareIds]
  );
  const toggleCompare = useCallback((appId: string) => {
    setCompareIds((prev) =>
      prev.includes(appId)
        ? prev.filter((x) => x !== appId)
        : prev.length < MAX_COMPARE
          ? [...prev, appId]
          : prev
    );
  }, []);
  const compareFull = compareIds.length >= MAX_COMPARE;

  const scrollTo = (target: 'roadmap' | 'projects') => {
    const el = target === 'roadmap' ? roadmapRef.current : projectsRef.current;
    if (!el) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  // Reset the carousel AFTER the new slide collection commits: browsers
  // can restore a stale scroll offset when the track content resizes, so
  // the position is forced back to the first slide on every list change.
  useLayoutEffect(() => {
    // scrollTo(0) fires a scroll event when the offset was stale, and the
    // rAF-driven index handler then reports position 1 — no direct
    // setState in the effect (which the lint cascade rule forbids).
    // Direct assignment — instant, bypasses the track's CSS smooth
    // scrolling so a pending animation can never carry a stale offset.
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [filter, query, categoryFilter]);

  /**
   * Real slide-to-slide distance (card width + the responsive gap), measured
   * from the first two slides so it stays correct at every viewport.
   */
  const getStride = (track: HTMLElement): number => {
    const [first, second] = track.querySelectorAll<HTMLElement>('[data-slide]');
    if (!first) return 0;
    if (second) return second.offsetLeft - first.offsetLeft;
    return first.offsetWidth + 16;
  };

  /** Index of the left-most visible slide (1-based position indicator). */
  const onTrackScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const stride = getStride(track);
      if (stride <= 0) return;
      const idx = Math.min(
        Math.max(0, Math.round(track.scrollLeft / stride)),
        Math.max(0, slides - 1)
      );
      setSlideIndex((prev) => (prev === idx ? prev : idx));
    });
  }, [slides]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scrollBySlides = (delta: number) => {
    const track = trackRef.current;
    if (!track) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stride = getStride(track);
    if (stride <= 0) return;
    const target = Math.min(
      Math.max(0, (Math.round(track.scrollLeft / stride) + delta) * stride),
      track.scrollWidth - track.clientWidth
    );
    track.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
  };

  const goToSlide = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stride = getStride(track);
    if (stride <= 0) return;
    track.scrollTo({ left: i * stride, behavior: reduce ? 'auto' : 'smooth' });
  };


  const activeProjectWord = filter === 'all' ? 'projects' : `projects ${FILTER_HINTS[filter]}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-16">
      {/* ================= Premium hero ================= */}
      <section
        className="relative mt-4 sm:mt-8 overflow-hidden rounded-3xl border border-line bg-card scroll-mt-24"
        aria-labelledby="lab-hero-heading"
      >
        <div className="lab-hero-surface absolute inset-0" aria-hidden />
        <div className="lab-orb absolute -top-16 -left-10 w-56 h-56 rounded-full opacity-60" aria-hidden />
        <div className="lab-orb-coral absolute -bottom-20 right-4 w-48 h-48 rounded-full opacity-50" aria-hidden />

        <div className="relative px-5 sm:px-10 py-10 sm:py-14">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forge-red/10 text-forge-red border border-forge-red/25 text-[10px] font-black uppercase tracking-[0.14em]">
            <FlaskConical className="w-3 h-3" aria-hidden />
            AppMintly Lab
          </span>

          <h1
            id="lab-hero-heading"
            className="mt-5 text-[clamp(1.9rem,6vw,3.25rem)] leading-[1.08] font-black tracking-tight text-ink"
          >
            Ideas Today.{' '}
            <span className="bg-gradient-to-r from-cta via-cta-hover to-cta bg-clip-text text-transparent">
              Apps Tomorrow.
            </span>
          </h1>

          <p className="mt-4 text-sm sm:text-[15px] text-mut max-w-2xl leading-relaxed">
            Explore what&apos;s being built next across the AppMintly ecosystem. Discover
            upcoming products, understand their purpose, and help shape what comes next.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => scrollTo('roadmap')}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-6 rounded-xl bg-cta text-page text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer hover:bg-cta-hover hover:shadow-md active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
            >
              <MapIcon className="w-4 h-4" aria-hidden />
              Explore the Roadmap
            </button>
            <button
              type="button"
              onClick={() => scrollTo('projects')}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-6 rounded-xl bg-card border border-line text-ink text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer hover:border-cta/50 hover:text-cta active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
            >
              <Sparkles className="w-4 h-4" aria-hidden />
              Discover What&apos;s Next
            </button>
          </div>

          {/* Real, derived meta only — no invented dates or statistics. */}
          <p className="mt-6 text-[11px] text-mut">
            {upcoming.length} project{upcoming.length === 1 ? '' : 's'} on the public roadmap
            {localVotes !== null && localVotes > 0
              ? ` · you have voted for ${localVotes} on this device`
              : ''}
            {localSaved !== null && localSaved > 0
              ? ` · you have saved ${localSaved} on this device`
              : ''}
          </p>
        </div>
      </section>

      {/* Vote honesty note — pinned near the top, not buried in the footer. */}
      <aside
        className="mt-6 rounded-xl border border-line bg-page p-3.5 flex items-start gap-2.5"
        aria-label="About Lab votes"
      >
        <Info className="w-4 h-4 text-mut shrink-0 mt-px" aria-hidden />
        <p className="text-[11px] text-mut leading-relaxed">{VOTE_SCOPE_LABEL}</p>
      </aside>

      {/* ================= Premium roadmap overview ================= */}
      <div ref={roadmapRef} className="scroll-mt-24" />
      <section aria-labelledby="lab-roadmap-heading" className="mt-8">
        <h2 id="lab-roadmap-heading" className="text-lg sm:text-xl font-black text-ink">
          The roadmap at a glance
        </h2>
        <p className="mt-1 text-xs text-mut">
          Filter the public roadmap by stage. Counts come straight from the roadmap
          records on this page — nothing else.
        </p>

        <div
          className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3"
          role="group"
          aria-label="Filter by roadmap status"
        >
          {FILTERS.map((f) => {
            const count =
              f.id === 'all' ? upcoming.length : upcoming.filter((u) => u.roadmapStatus === f.id).length;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`group text-left rounded-2xl border p-3.5 min-h-[84px] transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none ${
                  active
                    ? 'border-cta/60 bg-cta/10 shadow-sm'
                    : 'border-line bg-card hover:border-cta/40 hover:shadow-sm'
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${active ? 'text-cta' : 'text-mut'}`}>
                    {f.label}
                  </span>
                  <span
                    className={`text-xl font-black tabular-nums ${active ? 'text-cta' : 'text-ink'}`}
                    aria-hidden
                  >
                    {count}
                  </span>
                </span>
                <span className="block mt-1.5 text-[10px] text-mut leading-snug">{f.caption}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ================= Smart discovery toolbar ================= */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mut pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps by name or description"
            aria-label="Search roadmap apps by name or description"
            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-line bg-card text-xs text-ink placeholder:text-mut/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="min-h-[44px] min-w-0 max-w-full px-3 rounded-xl border border-line bg-card text-xs font-semibold text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {(query || categoryFilter !== 'all' || filter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategoryFilter('all');
              setFilter('all');
            }}
            aria-label="Clear all search and filter selections"
            className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-line bg-card text-xs font-bold text-ink hover:border-cta/40 hover:text-cta transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ================= Horizontal swipeable showcase ================= */}
      <div ref={projectsRef} className="scroll-mt-24" />
      <section aria-labelledby="lab-projects-heading" className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <h2 id="lab-projects-heading" className="text-lg sm:text-xl font-black text-ink">
            {filter === 'all'
              ? 'Upcoming projects'
              : FILTERS.find((f) => f.id === filter)?.label}
            <span className="ml-2 text-sm font-bold text-mut tabular-nums" aria-hidden>
              {visible.length}
            </span>
          </h2>

          {/* Position indicator + carousel controls */}
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-bold text-mut tabular-nums whitespace-nowrap"
              aria-live="polite"
            >
              {slides === 0 ? '0 of 0' : `${slideIndex + 1} of ${slides}`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollBySlides(-1)}
                disabled={slides <= 1}
                aria-label="Previous project"
                className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-line bg-card text-ink hover:border-cta/40 hover:text-cta transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => scrollBySlides(1)}
                disabled={slides <= 1}
                aria-label="Next project"
                className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-line bg-card text-ink hover:border-cta/40 hover:text-cta transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none"
              >
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {/* Compare Apps bar — REAL app records only, no promo participation */}
        {compareApps.length > 0 && (
          <div
            className="mt-4 rounded-xl border border-cta/40 bg-cta/5 px-3.5 py-2.5 flex flex-wrap items-center gap-2.5"
            role="status"
            aria-live="polite"
          >
            <Scale className="w-4 h-4 text-cta shrink-0" aria-hidden />
            <span className="text-xs font-bold text-ink">
              Comparing: {compareApps.map((a) => a.name).join(' · ')}
            </span>
            <span className="flex-1" aria-hidden />
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              disabled={compareApps.length < 2}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-cta text-page text-xs font-bold cursor-pointer transition-all duration-200 hover:bg-cta-hover disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none"
            >
              View comparison ({compareApps.length})
            </button>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="inline-flex items-center min-h-[44px] px-3.5 py-2 rounded-xl border border-line bg-card text-xs font-bold text-ink cursor-pointer hover:border-forge-red/40 hover:text-forge-red transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none"
            >
              Clear
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-card px-6 py-14 text-center">
            <FlaskConical className="w-6 h-6 text-mut mx-auto" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-ink">
              No {activeProjectWord} right now
            </p>
            <p className="mt-1 text-xs text-mut">
              The roadmap changes as projects move forward. Check back soon.
            </p>
          </div>
        ) : (
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className="mt-5 flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth motion-reduce:scroll-auto"
            role="region"
            aria-roledescription="carousel"
            aria-label="App showcase — swipe or use the previous and next buttons"
            style={{ scrollPaddingLeft: '0' }}
          >
            {visible.map((app) => (
              <div
                key={app.id}
                data-slide
                className="snap-start shrink-0 w-[90%] sm:w-[400px] lg:w-[440px] flex"
              >
                <UpcomingAppCard
                  app={app}
                  compareOn={compareIds.includes(app.id)}
                  onCompareToggle={toggleCompare}
                  compareDisabled={compareFull}
                />
              </div>
            ))}

            {/* ===== More Apps Coming Soon — promotional card (not an app record) ===== */}
            {promoShown && (
              <div
                data-slide
                className="snap-start shrink-0 self-start w-[90%] sm:w-[400px] lg:w-[440px] flex"
              >
                <article
                  className="relative overflow-hidden h-full w-full rounded-2xl border border-line bg-inkbg text-white flex flex-col p-5 sm:p-6"
                  aria-label="More apps coming soon — promotional card"
                >
                  {/* Ambient gradient + abstract app tiles (decorative) */}
                  <div
                    className="absolute inset-0"
                    aria-hidden
                    style={{
                      background:
                        'linear-gradient(160deg, #10141C 0%, #0B2622 85%, #0E3A34 100%), radial-gradient(30rem 16rem at 85% -10%, rgba(20, 184, 166, 0.35), transparent 60%), radial-gradient(26rem 18rem at -10% 110%, rgba(232, 80, 61, 0.32), transparent 55%)',
                    }}
                  />
                  <div className="absolute right-5 top-16 flex flex-col gap-2.5" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="lab-orb-tile block rounded-xl"
                        style={{
                          width: 34 + (i % 2) * 18,
                          height: 26 + ((i + 1) % 2) * 12,
                          opacity: 0.5 - i * 0.08,
                          transform: `translateX(${i * 9}px)`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="relative">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/90 border border-white/20 text-[10px] font-black uppercase tracking-[0.14em]">
                      <Sparkles className="w-3 h-3" aria-hidden />
                      Coming soon
                    </span>
                    <h3 className="mt-5 text-2xl sm:text-[28px] font-black leading-tight">
                      More Apps.{' '}
                      <span className="bg-gradient-to-r from-cta-hover to-forge-red bg-clip-text text-transparent">
                        More Possibilities.
                      </span>
                    </h3>
                    <p className="mt-3 text-sm text-white/75 leading-relaxed max-w-xs">
                      Great ideas are already in the making. Discover new tools, smarter
                      experiences, and exciting apps joining the AppMintly ecosystem soon.
                    </p>
                  </div>

                  <div className="relative mt-6">
                    <Link
                      href="/explore"
                      className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-xl bg-cta text-page text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer hover:bg-cta-hover hover:shadow-md active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
                    >
                      Explore What&apos;s Next
                      <ArrowRight className="w-4 h-4" aria-hidden />
                    </Link>
                    <p className="mt-3 text-[10px] text-white/55">
                      A look ahead at the AppMintly ecosystem — this card is a preview,
                      not an app listing.
                    </p>
                  </div>
                </article>
              </div>
            )}
          </div>
        )}

        {/* Pagination dots — 44px touch targets with a small visual dot */}
        {slides > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-y-1 max-w-full" role="tablist" aria-label="Go to showcase slide">
            {/* Wraps on narrow screens: one 40x44 dot per slide would otherwise widen the page. */}
            {Array.from({ length: slides }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={slideIndex === i ? 'true' : undefined}
                className="h-11 w-10 inline-flex items-center justify-center cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 rounded-md"
              >
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-200 motion-reduce:transition-none ${
                    slideIndex === i ? 'bg-cta w-6 h-2.5' : 'bg-mut/40 w-2.5 h-2.5 hover:bg-mut/70'
                  }`}
                />
              </button>
            ))}
          </div>
        )}

        {/* Compare Apps dialog — side-by-side, real data only */}
        {compareOpen && compareApps.length >= 2 && (
          <CompareDialog apps={compareApps} onClose={() => setCompareOpen(false)} />
        )}
      </section>
    </div>
  );
}

/** Verification summary computed ONLY from the record's real checks. */
function verificationSummary(app: UpcomingApp): string {
  const checks = app.verification?.checks ?? [];
  if (checks.length === 0) return 'Verification pending';
  const passed = checks.filter((c) => c.result === 'passed').length;
  const failed = checks.filter((c) => c.result === 'failed').length;
  const unable = checks.filter((c) => c.result === 'unable-to-verify').length;
  const pending = checks.filter((c) => c.result === 'pending').length;
  const parts: string[] = [];
  if (passed) parts.push(`${passed} passed`);
  if (failed) parts.push(`${failed} failed`);
  if (unable) parts.push(`${unable} could not be verified`);
  if (pending) parts.push(`${pending} pending`);
  return parts.length > 0 ? parts.join(' · ') : 'Verification pending';
}

/**
 * Compare Apps — side-by-side comparison built ONLY from real project
 * records: status, milestone-derived progress, features, audience and
 * the honest verification summary. No fabricated scores or rankings.
 */
function CompareDialog({ apps, onClose }: { apps: UpcomingApp[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="App comparison"
        tabIndex={-1}
        className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line bg-card p-5 sm:p-6 focus-visible:outline-none"
      >
        <div className="flex items-center justify-between gap-3 sticky top-0 bg-card pb-2">
          <h3 className="text-base font-black text-ink">App comparison</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close app comparison"
            className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-line bg-page text-ink hover:text-forge-red cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <p className="text-[11px] text-mut leading-snug">
          Real roadmap records only — statuses, progress, and verification come from the
          same data this page displays. Nothing is ranked or scored.
        </p>

        <div className={`mt-4 grid gap-3 ${apps.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {apps.map((a) => {
            const total = a.milestones.length;
            const done = a.milestones.filter((m) => m.status === 'done').length;
            const progress = total > 0 ? Math.round((done / total) * 100) : 0;
            const current = a.milestones.find((m) => m.status === 'in-progress' || m.status === 'blocked');
            return (
              <div key={a.id} className="rounded-xl border border-line bg-page p-3.5 grid content-start gap-2">
                <p className="text-sm font-bold text-ink leading-snug">{a.name}</p>
                <p className="text-[11px] text-mut leading-snug">{a.category}</p>
                <p className="text-[11px] font-bold text-cta">{ROADMAP_STATUS_LABEL[a.roadmapStatus]}</p>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-mut">
                    <span className="uppercase tracking-wider">Progress</span>
                    <span className="tabular-nums">
                      {done}/{total} · {progress}%
                    </span>
                  </div>
                  <div
                    className="lab-progress-track mt-1 h-1.5 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    aria-label={`${a.name} roadmap progress`}
                  >
                    <div className="lab-progress-fill h-full rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                {current && (
                  <p className="text-[10px] text-ink/80 leading-snug">
                    <span className="font-bold">Current:</span> {current.title}
                  </p>
                )}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-mut">Top planned features</p>
                  <ul className="mt-1 grid gap-1">
                    {a.proposedFeatures.slice(0, 3).map((f) => (
                      <li key={f} className="text-[10px] text-ink/85 leading-snug">
                        • {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-[10px] text-mut leading-snug">
                  <span className="font-bold text-ink/80">Built for:</span>{' '}
                  {a.intendedUsers.join(', ')}
                </p>
                <p className="text-[10px] text-mut leading-snug">{verificationSummary(a)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
