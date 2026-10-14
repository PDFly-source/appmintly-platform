'use client';

/**
 * Phase 1B — AppMintly Lab: the home of upcoming apps and their roadmaps.
 *
 * Data: version-controlled data/upcoming-apps.json (no backend, no DB).
 * Voting: local-only (lib/upcoming-votes.ts) with the honest scope label
 * always visible. The Lab never shows download buttons or versions —
 * these are roadmap records, not installable catalog apps.
 */

import React, { useMemo, useState } from 'react';
import { FlaskConical, Info } from 'lucide-react';
import { getUpcomingApps } from '@/data/upcoming-apps';
import type { UpcomingApp } from '@/data/upcoming-apps';
import { UpcomingAppCard } from '@/components/UpcomingAppCard';
import { localVoteCount, VOTE_SCOPE_LABEL } from '@/lib/upcoming-votes';

const FILTERS: { id: 'all' | UpcomingApp['roadmapStatus']; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-development', label: 'In development' },
  { id: 'planned', label: 'Planned' },
  { id: 'early-testing', label: 'Early testing' },
];

export default function LabClient() {
  const upcoming = useMemo(() => getUpcomingApps(), []);
  const [filter, setFilter] = useState<'all' | UpcomingApp['roadmapStatus']>('all');
  const [localVotes, setLocalVotes] = useState<number | null>(null);

  // Read the local vote count after mount (localStorage is client-only —
  // computing it during render would break hydration).
  React.useEffect(() => {
    const refresh = () => setLocalVotes(localVoteCount());
    refresh();
    window.addEventListener('appmintly_upcoming_votes_updated', refresh);
    return () => window.removeEventListener('appmintly_upcoming_votes_updated', refresh);
  }, []);

  const visible = filter === 'all' ? upcoming : upcoming.filter((u) => u.roadmapStatus === filter);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forge-red/10 text-forge-red border border-forge-red/25 text-[10px] font-black uppercase tracking-wider">
          <FlaskConical className="w-3 h-3" aria-hidden />
          AppMintly Lab
        </span>
        <h1 className="mt-4 text-2xl sm:text-3xl font-black text-ink">
          Upcoming Apps — the public roadmap
        </h1>
        <p className="mt-2 text-sm text-mut max-w-2xl leading-relaxed">
          A transparent look at what the AppMintly ecosystem is building next:
          each entry shows its purpose, who it is for, proposed features,
          planned capabilities and roadmap status — with a link to its real
          source repository.
        </p>
        {localVotes !== null && localVotes > 0 && (
          <p className="mt-2 text-xs text-mut">
            You have voted for {localVotes} upcoming app{localVotes === 1 ? '' : 's'} on this
            device.
          </p>
        )}
      </header>

      {/* Vote honesty note — pinned near the top, not buried in the footer. */}
      <aside
        className="mb-8 rounded-xl border border-line bg-page p-3.5 flex items-start gap-2.5"
        aria-label="About Lab votes"
      >
        <Info className="w-4 h-4 text-mut shrink-0 mt-px" aria-hidden />
        <p className="text-[11px] text-mut leading-relaxed">{VOTE_SCOPE_LABEL}</p>
      </aside>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter by roadmap status">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? upcoming.length : upcoming.filter((u) => u.roadmapStatus === f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                filter === f.id
                  ? 'bg-inkbg text-white'
                  : 'bg-card border border-line text-ink hover:border-ink/30'
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-mut py-16 text-center">
          No upcoming apps in this stage right now. Check back soon.
        </p>
      ) : (
        <div className="grid gap-5">
          {visible.map((app) => (
            <UpcomingAppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
