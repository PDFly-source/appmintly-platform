'use client';

/**
 * Phase 1E — Upcoming App showcase card (AppMintly Lab).
 *
 * A premium product-showcase card for the horizontal swipeable Lab
 * showcase: branded visual header (official logo asset when supplied,
 * monogram fallback), status badge, the exact unreleased disclosure,
 * concise description, audience, three feature highlights, a real
 * milestone-derived progress bar and the LOCAL-ONLY vote button with its
 * honest scope label. Lengthy roadmap detail lives behind an accessible
 * expandable panel.
 *
 * Honesty rules (unchanged since Phase 1B/1C):
 *  - "Roadmap preview – not released yet": a repository or logo existing
 *    never means a product is released or downloadable.
 *  - Never shows download buttons, versions or install CTAs.
 *  - No public source-repository link; `sourceRepo` stays engineering
 *    metadata in the data records only.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  FlaskConical,
  Heart,
  Users,
} from 'lucide-react';
import type { UpcomingApp } from '@/data/upcoming-apps';
import { useUpcomingVote, toggleVote, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';

// Production serves the static export under a sub-path — brand assets need
// the same prefix the other public/ references use (AppMintlyLogo, Footer).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const STATUS_STYLES: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'bg-forge-blue/10 text-forge-blue border-forge-blue/30',
  'in-development': 'bg-forge-yellow/10 text-forge-yellow border-forge-yellow/40',
  'early-testing': 'bg-cta/10 text-cta border-cta/30',
};

const STATUS_MONOGRAM: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'bg-forge-blue/12 text-forge-blue border-forge-blue/25',
  'in-development': 'bg-forge-yellow/12 text-forge-yellow border-forge-yellow/30',
  'early-testing': 'bg-cta/12 text-cta border-cta/30',
};

/**
 * Per-app brand header treatments (restrained gradients behind the
 * official logo artwork). Falls back to the AppMintly default for
 * records without a supplied brand palette.
 */
const BRAND_HEADER: Record<string, string> = {
  billcraft:
    'linear-gradient(135deg, rgba(75, 0, 130, 0.16), rgba(138, 43, 226, 0.10) 45%, rgba(64, 224, 208, 0.12))',
  cartora:
    'linear-gradient(135deg, rgba(0, 77, 38, 0.18), rgba(0, 100, 50, 0.10) 50%, rgba(220, 252, 199, 0.14))',
  nutrilens:
    'linear-gradient(135deg, rgba(0, 77, 64, 0.16), rgba(100, 221, 23, 0.10) 50%, rgba(255, 215, 0, 0.10))',
};

function MilestoneIcon({ status }: { status: 'done' | 'in-progress' | 'planned' }) {
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-cta" aria-hidden />;
  if (status === 'in-progress') return <CircleDot className="w-3.5 h-3.5 text-forge-yellow" aria-hidden />;
  return <Circle className="w-3.5 h-3.5 text-mut" aria-hidden />;
}

export function UpcomingAppCard({ app }: { app: UpcomingApp }) {
  const voted = useUpcomingVote(app.id);
  const [expanded, setExpanded] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const justVotedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the transient vote confirmation safely on unmount.
  useEffect(() => {
    return () => {
      if (justVotedTimer.current) clearTimeout(justVotedTimer.current);
    };
  }, []);

  const handleVote = () => {
    const now = toggleVote(app.id);
    if (now) {
      setJustVoted(true);
      if (justVotedTimer.current) clearTimeout(justVotedTimer.current);
      justVotedTimer.current = setTimeout(() => setJustVoted(false), 600);
    }
  };

  // Progress derived from the real milestone records (done / total).
  const total = app.milestones.length;
  const done = app.milestones.filter((m) => m.status === 'done').length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const detailsId = `roadmap-details-${app.slug}`;
  const brandBg = BRAND_HEADER[app.slug] || undefined;

  return (
    <article
      className="group min-w-0 h-full rounded-2xl border border-line bg-card flex flex-col shadow-sm transition-all duration-200 hover:border-cta/35 hover:shadow-md motion-reduce:transition-none overflow-hidden"
      aria-label={`${app.name} — upcoming app`}
    >
      {/* ===== Branded visual header ===== */}
      {app.logo ? (
        <div
          className="relative border-b border-line flex items-center justify-center px-6 py-5"
          style={brandBg ? { background: brandBg } : undefined}
        >
          {/* Supplied official logo asset — white tile keeps it crisp and
              readable in every theme; object-contain preserves proportions. */}
          <span className="block bg-white rounded-xl px-5 py-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE_PATH}${app.logo}`}
              alt={`${app.name} official logo`}
              width={200}
              height={200}
              className="w-32 h-32 sm:w-36 sm:h-36 object-contain"
              loading="lazy"
              decoding="async"
            />
          </span>
        </div>
      ) : (
        /* Monogram fallback (used by records without a supplied logo, e.g.
           Register — its existing identity, preserved as-is). */
        <div className="flex items-center gap-3.5 border-b border-line px-5 py-4">
          <span
            className={`shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center text-lg font-black ${STATUS_MONOGRAM[app.roadmapStatus]}`}
            aria-hidden
          >
            {app.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-ink leading-snug">{app.name}</h3>
            <p className="text-[11px] text-mut mt-0.5">
              {app.category} · by {app.developer}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 p-5">
        {/* Header (when the branded logo block already carries the name,
            keep a compact identity line for screen readers and skimmers). */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-ink leading-snug">{app.name}</h3>
            <p className="text-[11px] text-mut mt-0.5 truncate">
              {app.category} · by {app.developer}
            </p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[app.roadmapStatus]}`}
          >
            <FlaskConical className="w-3 h-3" aria-hidden />
            {app.roadmapStatusLabel}
          </span>
        </div>

        {/* Phase 1C content review: make the roadmap boundary explicit —
            nothing on this card is available or installable today. */}
        <p className="mt-3 rounded-lg bg-forge-yellow/10 border border-forge-yellow/30 px-3 py-2 text-[11px] font-semibold text-forge-yellow leading-snug">
          Roadmap preview – not released yet. Nothing here is installable or
          available on AppMintly today.
        </p>

        {/* Short, readable description + audience */}
        <p className="mt-3 text-xs sm:text-[13px] text-ink/90 leading-relaxed">{app.purpose}</p>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-mut leading-snug">
          <Users className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
          <span>
            <span className="font-semibold text-ink/80">Built for:</span> {app.intendedUsers[0]}
            {app.intendedUsers.length > 1 && ` (+${app.intendedUsers.length - 1} more)`}
          </span>
        </p>

        {/* Three concise feature highlights */}
        <div className="mt-3.5 grid gap-1.5">
          {app.proposedFeatures.slice(0, 3).map((f) => (
            <p key={f} className="flex items-start gap-1.5 text-[11px] text-ink/85 leading-snug">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px text-cta/80" aria-hidden />
              {f}
            </p>
          ))}
        </div>

        {/* Compact visual roadmap progress — real milestone data */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-mut">
            <span className="uppercase tracking-wider">Roadmap progress</span>
            <span className="tabular-nums" aria-label={`${done} of ${total} milestones complete`}>
              {done}/{total} milestones
            </span>
          </div>
          <div
            className="lab-progress-track mt-1.5 h-1.5 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`${app.name} roadmap progress`}
          >
            <div className="lab-progress-fill h-full rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <ul className="mt-2.5 space-y-1">
            {app.milestones.slice(0, 2).map((m, i) => (
              <li key={`${m.title}-${i}`} className="flex items-center gap-1.5">
                <MilestoneIcon status={m.status} />
                <span className="text-[10px] text-mut leading-snug">{m.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-auto pt-4 border-t border-line flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleVote}
            aria-pressed={voted}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
              voted
                ? 'bg-cta text-page shadow-sm hover:bg-cta-hover'
                : 'bg-page border border-cta/40 text-cta hover:border-cta hover:bg-cta/10'
            } ${justVoted ? 'lab-vote-pop' : ''}`}
          >
            <Heart className={`w-4 h-4 ${voted ? 'fill-current' : ''}`} aria-hidden />
            {voted ? 'Voted — saved on this device' : 'Vote for This App'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="inline-flex items-center gap-1 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-ink border border-line bg-card hover:border-cta/40 hover:text-cta transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 motion-reduce:transition-none"
          >
            {expanded ? 'Hide roadmap details' : 'View Roadmap'}
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''} motion-reduce:transition-none`}
              aria-hidden
            />
          </button>
        </div>

        <p className="mt-3 text-[10px] text-mut">{VOTE_SCOPE_LABEL}</p>

        {/* Expandable roadmap details — full record on demand */}
        {expanded && (
          <div
            id={detailsId}
            className="mt-4 rounded-xl border border-line bg-page p-4 grid gap-4 sm:grid-cols-2"
          >
            <div>
              <h4 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                <Users className="w-3 h-3" aria-hidden />
                Intended for
              </h4>
              <ul className="space-y-1">
                {app.intendedUsers.map((u) => (
                  <li key={u} className="text-[11px] text-mut leading-snug">
                    • {u}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                Proposed features
              </h4>
              <ul className="space-y-1">
                {app.proposedFeatures.map((f) => (
                  <li key={f} className="text-[11px] text-mut leading-snug">
                    • {f}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                Planned capabilities
              </h4>
              <ul className="space-y-1">
                {app.plannedCapabilities.map((c) => (
                  <li key={c} className="text-[11px] text-mut leading-snug">
                    • {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                Milestones
              </h4>
              <ul className="space-y-1.5">
                {app.milestones.map((m, i) => (
                  <li key={`${m.title}-${i}`} className="flex items-start gap-1.5">
                    <span className="mt-px">
                      <MilestoneIcon status={m.status} />
                    </span>
                    <span className="text-[11px] text-mut leading-snug">{m.title}</span>
                  </li>
                ))}
              </ul>
            </div>
            {app.draftNote && (
              <p className="sm:col-span-2 text-[10px] text-mut/80 border-t border-line pt-2.5">
                {app.draftNote}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
