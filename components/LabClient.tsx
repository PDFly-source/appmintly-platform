'use client';

/**
 * Phase 1D — AppMintly Lab, premium edition.
 *
 * The home of upcoming apps and their roadmaps, upgraded from a long
 * documentation-style page into a premium product-discovery experience
 * while keeping every Phase 1B/1C behaviour intact.
 *
 * Data: version-controlled data/upcoming-apps.json (no backend, no DB).
 * Voting: local-only (lib/upcoming-votes.ts) with the honest scope label
 * always visible. The Lab never shows download buttons or versions —
 * these are roadmap records, not installable catalog apps. Since Phase 1D
 * the public Lab UI no longer shows source-repository links either: the
 * repository metadata stays in the data records for engineering use only.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Info, Map as MapIcon, Sparkles } from 'lucide-react';
import { getUpcomingApps } from '@/data/upcoming-apps';
import type { UpcomingApp } from '@/data/upcoming-apps';
import { UpcomingAppCard } from '@/components/UpcomingAppCard';
import { localVoteCount, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';

const FILTERS: { id: 'all' | UpcomingApp['roadmapStatus']; label: string; caption: string }[] = [
  { id: 'all', label: 'All Projects', caption: 'Every roadmap record' },
  { id: 'in-development', label: 'In Development', caption: 'Being built now' },
  { id: 'planned', label: 'Planned', caption: 'On the roadmap ahead' },
  { id: 'early-testing', label: 'Early Testing', caption: 'In limited early use' },
];

const FILTER_HINTS: Record<UpcomingApp['roadmapStatus'], string> = {
  'in-development': 'active development',
  planned: 'planned',
  'early-testing': 'early testing',
};

export default function LabClient() {
  const upcoming = useMemo(() => getUpcomingApps(), []);
  const [filter, setFilter] = useState<'all' | UpcomingApp['roadmapStatus']>('all');
  const [localVotes, setLocalVotes] = useState<number | null>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const roadmapRef = useRef<HTMLDivElement>(null);

  // Read the local vote count after mount (localStorage is client-only —
  // computing it during render would break hydration).
  React.useEffect(() => {
    const refresh = () => setLocalVotes(localVoteCount());
    refresh();
    window.addEventListener('appmintly_upcoming_votes_updated', refresh);
    return () => window.removeEventListener('appmintly_upcoming_votes_updated', refresh);
  }, []);

  const visible = filter === 'all' ? upcoming : upcoming.filter((u) => u.roadmapStatus === filter);

  // Both hero CTAs scroll within this page (no invented navigation).
  // Smooth scrolling only for users who allow motion.
  const scrollTo = (target: 'roadmap' | 'projects') => {
    const el = target === 'roadmap' ? roadmapRef.current : projectsRef.current;
    if (!el) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const activeProjectWord =
    filter === 'all' ? 'projects' : `projects in ${FILTER_HINTS[filter]}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
      {/* ================= Premium hero ================= */}
      <section
        className="relative mt-4 sm:mt-8 overflow-hidden rounded-3xl border border-line bg-card scroll-mt-24"
        aria-labelledby="lab-hero-heading"
      >
        {/* Layered gradient surface + ambient orbs (decorative only) */}
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
          className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3"
          role="group"
          aria-label="Filter by roadmap status"
        >
          {FILTERS.map((f) => {
            const count = f.id === 'all' ? upcoming.length : upcoming.filter((u) => u.roadmapStatus === f.id).length;
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

      {/* ================= Projects ================= */}
      <div ref={projectsRef} className="scroll-mt-24" />
      <section aria-labelledby="lab-projects-heading" className="mt-8">
        <h2 id="lab-projects-heading" className="text-lg sm:text-xl font-black text-ink">
          {filter === 'all' ? 'All upcoming projects' : FILTERS.find((f) => f.id === filter)?.label}
          <span className="ml-2 text-sm font-bold text-mut tabular-nums" aria-hidden>
            {visible.length}
          </span>
        </h2>

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
          <div className="mt-5 grid gap-5">
            {visible.map((app) => (
              <UpcomingAppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
