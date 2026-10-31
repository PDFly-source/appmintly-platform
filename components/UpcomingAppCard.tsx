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
 * Honesty rules (finalized Lab status system):
 *  - The status badge, availability banner and primary CTA are ALL
 *    status-driven: planned (purple, "Coming Later"), in-development
 *    (amber, informational CTA), early-testing (blue, developer-only
 *    CTA) and published (green/teal, real "Open App" destination).
 *  - Never shows download buttons, versions or install CTAs. The only
 *    public destination CTA is "Open App" on a PUBLISHED record with a
 *    real publicUrl — a build or internal APK never makes a product
 *    published (the data normalizer enforces this fail-closed).
 *  - No public source-repository link.
 *  - A verification check is only 'passed' with real recorded evidence;
 *    a checksum proves integrity, never security.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Clock,
  FlaskConical,
  Heart,
  Image as ImageIcon,
  Lightbulb,
  Scale,
  Share2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  MilestoneStatus,
  UpcomingApp,
  VerificationCheck,
} from '@/data/upcoming-apps';
import {
  VERIFICATION_CATEGORIES,
  ROADMAP_STATUS_LABEL,
  ROADMAP_STATUS_SUBTITLE,
} from '@/data/upcoming-apps';
import { useUpcomingVote, toggleVote, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';
import {
  useWishlist,
  toggleWishlist,
  WISHLIST_SCOPE_LABEL,
} from '@/lib/upcoming-wishlist';

// Production serves the static export under a sub-path — brand assets
// need the same prefix other public/ references use.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const STATUS_STYLES: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'bg-forge-purple/10 text-forge-purple border-forge-purple/30',
  'in-development': 'bg-forge-yellow/10 text-forge-yellow border-forge-yellow/40',
  'early-testing': 'bg-forge-blue/10 text-forge-blue border-forge-blue/30',
  published: 'bg-forge-green/10 text-forge-green border-forge-green/30',
};

/** Text-only status colors — used for the status subtitle under the badge. */
const STATUS_TEXT: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'text-forge-purple',
  'in-development': 'text-forge-yellow',
  'early-testing': 'text-forge-blue',
  published: 'text-forge-green',
};

const STATUS_MONOGRAM: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'bg-forge-purple/12 text-forge-purple border-forge-purple/25',
  'in-development': 'bg-forge-yellow/12 text-forge-yellow border-forge-yellow/30',
  'early-testing': 'bg-forge-blue/12 text-forge-blue border-forge-blue/30',
  published: 'bg-forge-green/12 text-forge-green border-forge-green/25',
};

/** Status-specific availability banner (record copy wins over the default). */
const STATUS_BANNER: Record<UpcomingApp['roadmapStatus'], { className: string; message: string }> = {
  planned: {
    className: 'bg-forge-purple/10 border-forge-purple/30 text-forge-purple',
    message: 'Development has not started. No application access yet.',
  },
  'in-development': {
    className: 'bg-forge-yellow/10 border-forge-yellow/30 text-forge-yellow',
    message: 'Currently being built — public release not available.',
  },
  'early-testing': {
    className: 'bg-forge-blue/10 border-forge-blue/30 text-forge-blue',
    message: 'Internal builds are in testing. Developer-only — not publicly accessible.',
  },
  published: {
    className: 'bg-forge-green/10 border-forge-green/30 text-forge-green',
    message: 'Public Release — genuinely available to the public.',
  },
};

/**
 * Primary CTA per status. Informational for every non-published status
 * (an honest statement, not a fake action); a REAL destination link only
 * for published (publicUrl) or a planned record with a real concept page.
 */
const STATUS_CTA_LABEL: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'Coming Later',
  'in-development': 'In Development',
  'early-testing': 'Internal Testing Only',
  published: 'Open App',
};

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  done: 'Completed',
  'in-progress': 'In progress',
  planned: 'Planned',
  pending: 'Pending',
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
  if (status === 'pending') return <Clock className="w-3.5 h-3.5 text-forge-blue" aria-hidden />;
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

export interface UpcomingAppCardProps {
  app: UpcomingApp;
  /** Compare Apps feature — selection lives in the Lab page (real data). */
  compareOn?: boolean;
  onCompareToggle?: (appId: string) => void;
  /** Max selections enforced by the parent; used for the honest label. */
  compareDisabled?: boolean;
}

export function UpcomingAppCard({ app, compareOn = false, onCompareToggle, compareDisabled = false }: UpcomingAppCardProps) {
  const voted = useUpcomingVote(app.id);
  const saved = useWishlist(app.id);
  const [expanded, setExpanded] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const justVotedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Logo loading / error states (graceful fallback, no CLS) ---
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoRef = useRef<HTMLImageElement | null>(null);

  // The logo <img> starts loading from the static HTML BEFORE hydration —
  // onLoad/onError can fire before React attaches them. On mount, sync the
  // real state of the image from the DOM so a loaded logo is never stuck
  // hidden and a broken one falls back to the monogram.
  useEffect(() => {
    const el = logoRef.current;
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0) setLogoLoaded(true);
    else setLogoFailed(true);
  }, []);

  // --- Description overflow (Show More / Show Less only if it overflows) ---
  const descRef = useRef<HTMLParagraphElement | null>(null);
  const [descClamped, setDescClamped] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  // --- Inline disclosures: audience + all planned features ---
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  // --- Share feedback (Web Share API + copy-link fallback) ---
  const [shareNote, setShareNote] = useState('');
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Overflow must be measured after hydration — the clamp only matters
    // in the browser, and the button is hidden during SSR/hydration.
    // Measured ONCE on mount (with the clamp applied): re-measuring after
    // an expand would see no overflow and drop the toggle button.
    const el = descRef.current;
    if (el) setDescClamped(el.scrollHeight > el.clientHeight + 2);
  }, []);

  useEffect(() => {
    return () => {
      if (shareTimer.current) clearTimeout(shareTimer.current);
    };
  }, []);

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

  const handleWishlist = () => {
    toggleWishlist(app.id);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${BASE_PATH}/lab/`;
    const shareData = {
      title: `${app.name} — AppMintly Lab roadmap`,
      text: `${app.name} is on the AppMintly Lab roadmap. See its purpose, features, and honest development progress.`,
      url,
    };
    const setNote = (msg: string) => {
      setShareNote(msg);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareNote(''), 2200);
    };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return; // native sheet closed — no extra note needed
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return; // user dismissed
        // fall through to the copy-link fallback
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote('Lab link copied — share it anywhere.');
    } catch {
      setNote(`Could not copy automatically — the Lab link is ${url}`);
    }
  };

  // Progress derived from the real milestone records.
  const total = app.milestones.length;
  const done = app.milestones.filter((m) => m.status === 'done').length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const current = app.milestones.find((m) => m.status === 'in-progress' || m.status === 'pending' || m.status === 'blocked');
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
        className="relative border-b border-line flex items-center justify-center px-5 py-4"
        style={brandBg ? { background: brandBg } : undefined}
      >
        {app.logo && !logoFailed ? (
          <span
            className={`block bg-card rounded-xl px-4 py-2.5 shadow-sm transition-opacity duration-200 ${
              logoLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!logoLoaded}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={logoRef}
              src={`${BASE_PATH}${app.logo}`}
              alt={`${app.name} official logo`}
              width={200}
              height={200}
              className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
              loading="lazy"
              decoding="async"
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoFailed(true)}
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

      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-ink leading-snug">{app.name}</h3>
            <p className="text-[11px] text-mut mt-0.5 leading-snug">
              {app.category} · by {app.developer}
            </p>
            {app.roadmapStatus === 'published' && (app.releaseVersion || app.releaseDate) ? (
              <p className="text-[10px] text-mut/90 mt-0.5 leading-snug">
                {app.releaseVersion ? `v${app.releaseVersion}` : ''}
                {app.releaseVersion && app.releaseDate ? ' · ' : ''}
                {app.releaseDate
                  ? `Released ${new Date(app.releaseDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`
                  : ''}
              </p>
            ) : null}
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[app.roadmapStatus]}`}
            >
              <FlaskConical className="w-3 h-3" aria-hidden />
              {ROADMAP_STATUS_LABEL[app.roadmapStatus]}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wide ${STATUS_TEXT[app.roadmapStatus]}`}>
              {app.roadmapStatusLabel ?? ROADMAP_STATUS_SUBTITLE[app.roadmapStatus]}
            </span>
          </span>
        </div>

        {/* Status-specific availability banner — record copy wins over the default */}
        <p
          className={`mt-2.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold leading-snug ${STATUS_BANNER[app.roadmapStatus].className}`}
        >
          {app.accessMessage ?? STATUS_BANNER[app.roadmapStatus].message}
        </p>

        {/* Primary CTA — status-driven and honest.
            PUBLISHED: a real link to the record's verified publicUrl.
            PLANNED with a real concept page: "View Concept".
            Everything else: an informational statement, never a fake action
            and never an install/download button. */}
        {app.roadmapStatus === 'published' && app.publicUrl ? (
          <a
            href={app.publicUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center justify-center gap-1.5 min-h-[40px] w-full rounded-xl bg-forge-green text-white text-xs font-bold shadow-sm transition-all duration-200 hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-forge-green/60"
          >
            <ArrowRight className="w-4 h-4" aria-hidden />
            {STATUS_CTA_LABEL.published}
          </a>
        ) : app.roadmapStatus === 'planned' && app.conceptUrl ? (
          <a
            href={app.conceptUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center justify-center gap-1.5 min-h-[40px] w-full rounded-xl border border-forge-purple/40 bg-forge-purple/10 text-forge-purple text-xs font-bold transition-all duration-200 hover:bg-forge-purple/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-forge-purple/60"
          >
            View Concept
          </a>
        ) : (
          <p
            aria-disabled="true"
            className="mt-2 inline-flex items-center justify-center min-h-[40px] w-full rounded-xl border border-line bg-page px-3 text-[11px] font-bold text-mut cursor-default select-none"
          >
            {STATUS_CTA_LABEL[app.roadmapStatus]}
          </p>
        )}

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

        {/* Description — clamped on small cards, functional Show More */}
        <p
          ref={descRef}
          className={`mt-2.5 text-xs sm:text-[13px] text-ink/90 leading-relaxed ${
            descOpen ? '' : 'line-clamp-3'
          }`}
        >
          {app.purpose}
        </p>
        {descClamped && (
          <button
            type="button"
            onClick={() => setDescOpen((v) => !v)}
            aria-expanded={descOpen}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-cta cursor-pointer hover:text-cta-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 rounded px-0.5"
          >
            {descOpen ? 'Show less' : 'Show more'}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${descOpen ? 'rotate-180' : ''} motion-reduce:transition-none`}
              aria-hidden
            />
          </button>
        )}

        {/* Problem statement — the reason this app exists */}
        {app.problem && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-page border border-line px-2.5 py-1.5 text-[11px] text-ink/85 leading-snug">
            <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-px text-forge-yellow" aria-hidden />
            <span>
              <span className="font-bold">The problem:</span> {app.problem}
            </span>
          </p>
        )}

        {/* Practical user benefits — derived from the planned features */}
        {app.benefits && app.benefits.length > 0 && (
          <ul className="mt-2 grid gap-1" aria-label={`Planned benefits of ${app.name}`}>
            {(app.benefits ?? []).map((b) => (
              <li key={b} className="flex items-start gap-1.5 text-[11px] text-ink/85 leading-snug">
                <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-px text-cta/80" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAudienceOpen((v) => !v)}
            aria-expanded={audienceOpen}
            aria-controls={`${detailsId}-audience`}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-mut hover:text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 rounded px-0.5 py-0.5 text-left"
          >
            <Users className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Built for: {app.intendedUsers[0]}
            {app.intendedUsers.length > 1 && (
              <>
                {` (+${app.intendedUsers.length - 1} more)`}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${audienceOpen ? 'rotate-180' : ''} motion-reduce:transition-none`}
                  aria-hidden
                />
              </>
            )}
          </button>
          {audienceOpen && app.intendedUsers.length > 1 && (
            <ul id={`${detailsId}-audience`} className="mt-1 pl-1 grid gap-0.5">
              {app.intendedUsers.map((u) => (
                <li key={u} className="text-[11px] text-mut leading-snug">
                  • {u}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Feature highlights — PLANNED features, explicitly labelled so
            nothing reads as already implemented. Show All / Show Less
            planned capabilities below. */}
        <div className="mt-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
            Planned features
          </p>
          <div className="grid gap-1.5">
            {app.proposedFeatures.slice(0, 3).map((f) => (
              <p key={f} className="flex items-start gap-1.5 text-[11px] text-ink/85 leading-snug">
                <Circle className="w-3 h-3 shrink-0 mt-1 text-mut/70" aria-hidden />
                {f}
              </p>
            ))}
          </div>
        </div>
        {app.plannedCapabilities.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setFeaturesOpen((v) => !v)}
              aria-expanded={featuresOpen}
              aria-controls={`${detailsId}-features`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-cta cursor-pointer hover:text-cta-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 rounded px-0.5 py-0.5"
            >
              {featuresOpen ? 'Show less' : `Show all planned features (${app.proposedFeatures.length + app.plannedCapabilities.length})`}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${featuresOpen ? 'rotate-180' : ''} motion-reduce:transition-none`}
                aria-hidden
              />
            </button>
            {featuresOpen && (
              <ul id={`${detailsId}-features`} className="mt-1.5 grid gap-1">
                {app.plannedCapabilities.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-[11px] text-mut leading-snug">
                    <Circle className="w-3 h-3 shrink-0 mt-1 text-mut/70" aria-hidden />
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Compact visual roadmap progress — real milestone data */}
        <div className="mt-3.5">
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
          <ul className="mt-2 space-y-1">
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
        <div className="mt-auto pt-3 border-t border-line flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={handleWishlist}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${app.name} from wishlist` : `Save ${app.name} to wishlist`}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
              saved
                ? 'bg-forge-red text-white border border-forge-red'
                : 'bg-card border border-line text-ink hover:border-forge-red/50 hover:text-forge-red'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} aria-hidden />
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label={`Share ${app.name} from the AppMintly Lab roadmap`}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-ink border border-line bg-card hover:border-cta/40 hover:text-cta transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
          >
            <Share2 className="w-4 h-4" aria-hidden />
            Share
          </button>
          {onCompareToggle && (
            <button
              type="button"
              onClick={() => onCompareToggle(app.id)}
              aria-pressed={compareOn}
              disabled={!compareOn && compareDisabled}
              aria-label={
                compareDisabled && !compareOn
                  ? 'Compare selection is full — remove an app first'
                  : `${compareOn ? 'Remove' : 'Add'} ${app.name} ${compareOn ? 'from' : 'to'} the app comparison`
              }
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 disabled:opacity-40 disabled:cursor-not-allowed ${
                compareOn
                  ? 'bg-cta/15 border border-cta/50 text-cta'
                  : 'bg-card border border-line text-ink hover:border-cta/40 hover:text-cta'
              }`}
            >
              <Scale className="w-4 h-4" aria-hidden />
              {compareOn ? 'Comparing' : 'Compare'}
            </button>
          )}
        </div>

        {shareNote && (
          <p className="mt-2 text-[11px] font-semibold text-cta" role="status" aria-live="polite">
            {shareNote}
          </p>
        )}

        <p className="mt-2.5 text-[10px] text-mut leading-snug">
          {VOTE_SCOPE_LABEL} {WISHLIST_SCOPE_LABEL}
        </p>

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
            {(app.benefits?.length ?? 0) > 0 && (
              <div className="sm:col-span-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                  Key benefits
                </h4>
                <ul className="space-y-1">
                  {(app.benefits ?? []).map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[11px] text-ink/85 leading-snug">
                      <CheckCircle2 className="w-3 h-3 shrink-0 mt-1 text-cta" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
