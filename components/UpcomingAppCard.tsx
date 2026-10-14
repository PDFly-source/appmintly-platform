'use client';

/**
 * Phase 1B — Upcoming App card (AppMintly Lab).
 *
 * Shows the full roadmap record: purpose, intended users, proposed
 * features, planned capabilities, roadmap status and milestones — plus
 * the LOCAL-ONLY vote button with its honest scope label.
 * Never shows download buttons, versions or install CTAs: these are
 * upcoming apps, not installable catalog records.
 */

import React from 'react';
import { ArrowRight, CheckCircle2, Circle, CircleDot, ExternalLink, FlaskConical, Users } from 'lucide-react';
import type { UpcomingApp } from '@/data/upcoming-apps';
import { useUpcomingVote, toggleVote, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';

const STATUS_STYLES: Record<UpcomingApp['roadmapStatus'], string> = {
  planned: 'bg-forge-blue/10 text-forge-blue border-forge-blue/30',
  'in-development': 'bg-forge-yellow/10 text-forge-yellow border-forge-yellow/40',
  'early-testing': 'bg-cta/10 text-cta border-cta/30',
};

function MilestoneIcon({ status }: { status: 'done' | 'in-progress' | 'planned' }) {
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-cta" aria-hidden />;
  if (status === 'in-progress') return <CircleDot className="w-3.5 h-3.5 text-forge-yellow" aria-hidden />;
  return <Circle className="w-3.5 h-3.5 text-mut" aria-hidden />;
}

export function UpcomingAppCard({ app }: { app: UpcomingApp }) {
  const voted = useUpcomingVote(app.id);

  return (
    <article
      className="rounded-2xl border border-line bg-card p-5 flex flex-col"
      aria-label={`${app.name} — upcoming app`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            {app.name}
          </h3>
          <p className="text-[11px] text-mut mt-0.5">
            {app.developer} · {app.category}
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
        Roadmap preview — not released yet. Nothing here is installable or
        available on AppMintly today.
      </p>

      <p className="mt-3 text-xs text-ink/90 leading-relaxed">{app.purpose}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            Roadmap
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
      </div>

      <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const now = toggleVote(app.id);
            void now;
          }}
          aria-pressed={voted}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            // Phase 1C contrast audit: white on teal CTA is 2.49:1 in
            // dark/AMOLED (fails AA). Dark page-text on teal passes
            // AAA (dark) / AA (light) in both modes.
            voted
              ? 'bg-cta text-page'
              : 'bg-page border border-line text-ink hover:border-ink/30'
          }`}
        >
          {voted ? 'Voted — on this device' : 'Vote for this app'}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </button>
        <a
          href={app.sourceRepo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-cta hover:underline"
        >
          Source repository
          <ExternalLink className="w-3 h-3" aria-hidden />
        </a>
      </div>

      <p className="mt-3 text-[10px] text-mut">{VOTE_SCOPE_LABEL}</p>
      {app.draftNote && <p className="mt-1 text-[10px] text-mut/80">{app.draftNote}</p>}
    </article>
  );
}
