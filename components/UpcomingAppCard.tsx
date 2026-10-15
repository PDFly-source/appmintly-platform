'use client';

/**
 * AppMintly Lab 3.0 — Upcoming App showcase card.
 *
 * Premium evidence-driven product card: branded logo header, honest
 * status banner, description, audience, three feature highlights,
 * milestone-derived progress (completed / current / upcoming), the
 * AppMintly verification system (badges only with evidence — otherwise
 * an honest "Verification pending"), an optional screenshot viewer
 * (only for records that actually have real screenshots) and the
 * LOCAL-ONLY vote button with its honest scope label.
 *
 * Honesty rules (unchanged since Phase 1B):
 *  - "Roadmap preview – not released": a logo or repository existing
 *    never means a product is released or downloadable.
 *  - Never shows download buttons, versions or install CTAs.
 *  - No public source-repository link.
 *  - A verification check is only 'passed' with real recorded evidence;
 *    a checksum proves integrity, never security.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  FlaskConical,
  Heart,
  Image as ImageIcon,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  MilestoneStatus,
  UpcomingApp,
  VerificationCheck,
} from '@/data/upcoming-apps';
import { VERIFICATION_CATEGORIES } from '@/data/upcoming-apps';
import { useUpcomingVote, toggleVote, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';

// Production serves the static export under a sub-path — brand assets
// need the same prefix other public/ references use.
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

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  done: 'Completed',
  'in-progress': 'In progress',
  planned: 'Planned',
  blocked: 'Blocked',
};

const VERIFICATION_TITLES: Record<string, string> = {
  identity: 'Identity Verified',
  build: 'Build Verified',
  'core-flow': 'Core Flow Tested',
  device: 'Device Tested',
  release: 'Release Ready',
};

/** Per-app brand header treatments (restrained gradients). */
const BRAND_HEADER: Record<string, string> = {
  billcraft:
    'linear-gradient(135deg, rgba(75, 0, 130, 0.16), rgba(138, 43, 226, 0.10) 45%, rgba(64, 224, 208, 0.12))',
  cartora:
    'linear-gradient(135deg, rgba(0, 77, 38, 0.18), rgba(0, 100, 50, 0.10) 50%, rgba(220, 252, 199, 0.14))',
  nutrilens:
    'linear-gradient(135deg, rgba(0, 77, 64, 0.16), rgba(100, 221, 23, 0.10) 50%, rgba(255, 215, 0, 0.10))',
};

function MilestoneIcon({ status }: { status: MilestoneStatus }) {
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-cta" aria-hidden />;
  if (status === 'in-progress') return <CircleDot className="w-3.5 h-3.5 text-forge-yellow" aria-hidden />;
  if (status === 'blocked') return <AlertCircle className="w-3.5 h-3.5 text-forge-red" aria-hidden />;
  return <Circle className="w-3.5 h-3.5 text-mut" aria-hidden />;
}

/** Verification summary derived ONLY from real recorded checks. */
function useVerificationSummary(app: UpcomingApp) {
  const checks: VerificationCheck[] =
    app.verification?.checks ??
    VERIFICATION_CATEGORIES.map((category) => ({ category, result: 'pending' as const }));
  const passed = checks.filter((c) => c.result === 'passed');
  const failed = checks.filter((c) => c.result === 'failed');
  const unable = checks.filter((c) => c.result === 'unable-to-verify');
  const pending = checks.filter((c) => c.result === 'pending');
  return { checks, passed, failed, unable, pending, anyPassed: passed.length > 0 };
}

/** Full-screen screenshot viewer — only used for real screenshots. */
function ScreenshotViewer({
  shots,
  onClose,
}: {
  shots: { src: string; alt: string }[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % shots.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + shots.length) % shots.length);
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, shots.length]);

  const go = (d: number) => setIndex((i) => (i + d + shots.length) % shots.length);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="App screenshot viewer"
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-w-2xl w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE_PATH}${shots[index].src}`}
          alt={shots[index].alt}
          className="w-full max-h-[78vh] object-contain rounded-xl bg-white/5 shadow-2xl"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close screenshot viewer"
          className="absolute -top-3 -right-3 inline-flex items-center justify-center w-11 h-11 rounded-full bg-card border border-line text-ink hover:text-forge-red cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
        {shots.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous screenshot"
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-card/90 border border-line text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next screenshot"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-card/90 border border-line text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
            >
              <ChevronRight className="w-5 h-5" aria-hidden />
            </button>
            <p className="mt-2 text-center text-[11px] text-white/70 tabular-nums" aria-live="polite">
              {index + 1} of {shots.length}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function UpcomingAppCard({ app }: { app: UpcomingApp }) {
  const voted = useUpcomingVote(app.id);
  const [expanded, setExpanded] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const justVotedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { checks, unable, pending, anyPassed } = useVerificationSummary(app);

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

  // Progress derived from the real milestone records.
  const total = app.milestones.length;
  const done = app.milestones.filter((m) => m.status === 'done').length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const current = app.milestones.find((m) => m.status === 'in-progress' || m.status === 'blocked');
  const upcoming = app.milestones.find((m) => m.status === 'planned');

  const detailsId = `roadmap-details-${app.slug}`;
  const brandBg = BRAND_HEADER[app.slug] || undefined;
  const shots = app.screenshots ?? [];

  return (
    <article
      className="group min-w-0 h-full rounded-2xl border border-line bg-card flex flex-col shadow-sm transition-all duration-200 hover:border-cta/35 hover:shadow-md motion-reduce:transition-none overflow-hidden"
      aria-label={`${app.name} — upcoming app`}
    >
      {/* ===== Branded visual header ===== */}
      <div
        className="relative border-b border-line flex items-center justify-center px-6 py-5"
        style={brandBg ? { background: brandBg } : undefined}
      >
        {app.logo ? (
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
        ) : (
          /* Monogram fallback (Register's existing identity, preserved). */
          <span className="flex items-center gap-3.5">
            <span
              className={`shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center text-lg font-black ${STATUS_MONOGRAM[app.roadmapStatus]}`}
              aria-hidden
            >
              {app.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="text-[15px] font-bold text-ink">{app.name}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5">
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

        {/* Exact unreleased boundary banner */}
        <p className="mt-3 rounded-lg bg-forge-yellow/10 border border-forge-yellow/30 px-3 py-2 text-[11px] font-semibold text-forge-yellow leading-snug">
          Roadmap preview – not released yet. Nothing here is installable or
          available on AppMintly today.
        </p>

        {/* Verification — badges ONLY with evidence; otherwise honest pending. */}
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-mut leading-snug">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-mut" aria-hidden />
          {anyPassed ? (
            <span>
              Verified: {checks.filter((c) => c.result === 'passed').map((c) => VERIFICATION_TITLES[c.category]).join(', ')}
              {unable.length > 0 && `; ${unable.length} check${unable.length > 1 ? 's' : ''} could not be verified`}
              {pending.length > 0 && `; ${pending.length} pending`}
              . See details below.
            </span>
          ) : unable.length > 0 ? (
            <span>
              {unable.length} verification check{unable.length > 1 ? 's' : ''} could not be
              verified in the current environment — nothing has passed yet. See details below.
            </span>
          ) : (
            <span>
              Verification pending — no verification checks have been recorded for this
              app yet. See details below.
            </span>
          )}
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
              {done}/{total} milestones · {progress}%
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
          {/* Completed / current / upcoming summary from real records */}
          <ul className="mt-2.5 space-y-1">
            {current && (
              <li className="flex items-center gap-1.5">
                <MilestoneIcon status={current.status} />
                <span className="text-[10px] text-ink/80 leading-snug">
                  <span className="font-bold">{MILESTONE_LABELS[current.status]}:</span> {current.title}
                </span>
              </li>
            )}
            {upcoming && (
              <li className="flex items-center gap-1.5">
                <MilestoneIcon status="planned" />
                <span className="text-[10px] text-mut leading-snug">Up next: {upcoming.title}</span>
              </li>
            )}
          </ul>
        </div>

        {/* Actions — every button performs its advertised function */}
        <div className="mt-auto pt-4 border-t border-line flex flex-wrap items-center gap-2.5">
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
          {shots.length > 0 && (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="inline-flex items-center gap-1 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-ink border border-line bg-card hover:border-cta/40 hover:text-cta transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
            >
              <ImageIcon className="w-4 h-4" aria-hidden />
              Preview Screenshots
            </button>
          )}
        </div>

        <p className="mt-3 text-[10px] text-mut">{VOTE_SCOPE_LABEL}</p>

        {/* Expandable details: full timeline + verification center */}
        {expanded && (
          <div id={detailsId} className="mt-4 rounded-xl border border-line bg-page p-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                Milestone timeline
              </h4>
              <ul className="space-y-2">
                {app.milestones.map((m) => (
                  <li key={m.id} className="flex items-start gap-2">
                    <span className="mt-px shrink-0">
                      <MilestoneIcon status={m.status} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-ink/85 leading-snug">
                        {m.title}
                        <span className="ml-1.5 font-semibold text-mut">
                          ({MILESTONE_LABELS[m.status]})
                        </span>
                      </p>
                      {m.description && (
                        <p className="text-[10px] text-mut leading-snug mt-0.5">{m.description}</p>
                      )}
                      {m.evidence && (
                        <p className="text-[10px] text-cta/90 leading-snug mt-0.5">Evidence: {m.evidence}</p>
                      )}
                      {m.lastUpdated && (
                        <p className="text-[10px] text-mut/80 leading-snug mt-0.5">Last updated: {m.lastUpdated}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sm:col-span-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                What was verified?
              </h4>
              <ul className="space-y-1">
                {checks.map((c) => (
                  <li key={c.category} className="flex items-start gap-1.5">
                    <MilestoneIcon
                      status={
                        c.result === 'passed'
                          ? 'done'
                          : c.result === 'failed' || c.result === 'unable-to-verify'
                            ? 'blocked'
                            : 'planned'
                      }
                    />
                    <span className="text-[10px] text-mut leading-snug">
                      <span className="font-bold text-ink/80">{VERIFICATION_TITLES[c.category]}:</span>{' '}
                      {c.result === 'passed'
                        ? `Passed — ${c.summary ?? 'recorded evidence'}`
                        : c.result === 'failed'
                          ? `Failed — ${c.summary ?? 'recorded failure'}`
                          : c.result === 'unable-to-verify'
                            ? `Unable to verify — ${c.summary ?? 'the check could not be completed'}`
                            : 'Pending — no check recorded yet'}
                      {c.buildId ? ` [${c.buildId}]` : ''}
                      {c.date ? ` (${c.date})` : ''}
                      {c.source ? ` Evidence: ${c.source}.` : ''}
                      {c.limitations ? ` — ${c.limitations}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-mut/80 leading-snug">
                Source: {app.verification?.source ?? 'No verification record available.'} A checksum, where
                one exists, confirms artifact integrity against a reference — never that an app is secure.
              </p>
            </div>

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
            {app.draftNote && (
              <p className="sm:col-span-2 text-[10px] text-mut/80 border-t border-line pt-2.5">
                {app.draftNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Full-screen screenshot viewer (real screenshots only) */}
      {viewerOpen && shots.length > 0 && (
        <ScreenshotViewer shots={shots} onClose={() => setViewerOpen(false)} />
      )}
    </article>
  );
}
