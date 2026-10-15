'use client';

/**
 * Phase 3.2 — Engineering Dashboard client.
 *
 * Fetches the three shipped engineering data files with cache: 'no-store'
 * (no local caching of engineering data), renders them, and offers a
 * Refresh control that refetches directly from the deployment.
 *
 * Honesty rules enforced by this component:
 *  - Verification badges render ONLY the recorded results.
 *  - 'unable-to-verify' and 'pending' are displayed as themselves.
 *  - Explicit pending engineering gates (Testing QA, Release Readiness)
 *    are listed as PENDING 0% until real evidence exists.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, Clock, FileDiff, FlaskConical,
  RefreshCw, ShieldCheck, Wrench,
} from 'lucide-react';
import { BASE_PATH } from '@/lib/api-path';

type CheckResult = 'pending' | 'passed' | 'failed' | 'unable-to-verify';

interface VerificationCheck {
  id: string;
  category: string;
  result: CheckResult;
  summary?: string;
  source?: string;
  build_id?: string;
  date?: string;
  limitations?: string;
}

interface LabApp {
  id: string;
  name: string;
  status: string;
  hidden: boolean;
  verification: VerificationCheck[];
  milestones: { title: string; status: string }[];
  progress_percent: number;
}

interface Condition { id: string; label: string; status: string; description: string; }

interface EngineeringStatus {
  scan_time: string;
  pipeline_state: string;
  catalog_diff: { additions: number; unchanged: number; removals: number; generated_from: string };
  health_indicator: { overall: string; conditions: Condition[] };
  generated_from: string;
}

interface EngEvent {
  id: string; timestamp: string; type: string; title: string;
  description: string; commit?: string; branch?: string;
}

const RESULT_LABELS: Record<CheckResult, string> = {
  'pending': 'Pending',
  'passed': 'Passed',
  'failed': 'Failed',
  'unable-to-verify': 'Unable to verify',
};

const CATEGORY_LABELS: Record<string, string> = {
  'identity': 'Identity Verified',
  'build': 'Build Verified',
  'core-flow': 'Core Flow Tested',
  'device': 'Device Tested',
  'release': 'Release Ready',
};

function ResultPill({ result }: { result: CheckResult }) {
  const cls =
    result === 'passed'
      ? 'bg-cta/10 text-cta border-cta/40'
      : result === 'failed' || result === 'unable-to-verify'
        ? 'bg-forge-yellow/10 text-forge-yellow border-forge-yellow/40'
        : 'bg-page text-mut border-line';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cls}`}>
      {result === 'passed' ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : result === 'pending' ? <Clock className="w-3 h-3" aria-hidden /> : <AlertCircle className="w-3 h-3" aria-hidden />}
      {RESULT_LABELS[result]}
    </span>
  );
}

export default function EngineeringDashboardClient() {
  const [status, setStatus] = useState<EngineeringStatus | null>(null);
  const [apps, setApps] = useState<LabApp[]>([]);
  const [events, setEvents] = useState<EngEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Starts true: the first load begins with the component, so no effect
  // needs to set state synchronously (lint: no setState-in-effect cascade).
  const [refreshing, setRefreshing] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, a, e] = await Promise.all([
        fetch(`${BASE_PATH}/data/engineering-status.json`, { cache: 'no-store' }),
        fetch(`${BASE_PATH}/data/lab-apps.json`, { cache: 'no-store' }),
        fetch(`${BASE_PATH}/data/engineering-events.json`, { cache: 'no-store' }),
      ]);
      if (!s.ok || !a.ok || !e.ok) throw new Error(`data fetch failed (${s.status}/${a.status}/${e.status})`);
      setStatus(await s.json());
      setApps((await a.json()).apps ?? []);
      setEvents((await e.json()).events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load engineering data.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Defer the first load off the effect's synchronous frame (lint: no
    // setState-in-effect cascade); the fetch itself is unchanged.
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  /** Refresh from the event handler (never from a render or effect body). */
  const refresh = () => {
    setRefreshing(true);
    setError(null);
    void load();
  };

  const visible = apps.filter((a) => !a.hidden);
  const hidden = apps.filter((a) => a.hidden);

  return (
    <main className="min-h-screen bg-page text-ink px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      {/* Header + scan clock + refresh */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-forge-red">
            <Wrench className="w-3.5 h-3.5" aria-hidden /> AppMintly Engineering
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-black">Engineering Dashboard</h1>
          <p className="mt-1 text-[11px] text-mut leading-snug max-w-md">
            Version-controlled pipeline status, rendered with no local caching. Recorded by the
            AppMintly team — not an independent audit.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/80" aria-live="polite">
            <Clock className="w-3.5 h-3.5 text-cta" aria-hidden />
            Last scan: <span className="tabular-nums">{status ? status.scan_time : '…'}</span>
          </p>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-cta text-page text-xs font-bold cursor-pointer transition disabled:opacity-60 hover:bg-cta-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-forge-red/40 bg-forge-red/10 text-forge-red text-xs font-semibold px-3 py-2">
          {error}
        </p>
      )}

      {status && (
        <>
          {/* Pipeline state + health conditions */}
          <section aria-labelledby="health-h" className="mt-5">
            <h2 id="health-h" className="text-[11px] font-black uppercase tracking-wider text-mut mb-2">
              Pipeline health
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {status.health_indicator.conditions.map((c) => (
                <div key={c.id} className="rounded-xl border border-line bg-card p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${c.status === 'green' ? 'bg-cta' : 'bg-forge-red'}`} aria-hidden />
                    {c.label}
                  </p>
                  <p className="mt-1.5 text-[10px] text-mut leading-snug">{c.description}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-mut/80 leading-snug">{status.generated_from}</p>
          </section>

          {/* Catalog diff */}
          <section aria-labelledby="diff-h" className="mt-5">
            <h2 id="diff-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
              <FileDiff className="w-3.5 h-3.5" aria-hidden /> Catalog diff
            </h2>
            <div className="rounded-xl border border-line bg-card p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-black text-cta tabular-nums">{status.catalog_diff.additions}</p>
                <p className="text-[10px] font-bold uppercase text-mut tracking-wider">Additions</p>
              </div>
              <div>
                <p className="text-lg font-black tabular-nums">{status.catalog_diff.unchanged}</p>
                <p className="text-[10px] font-bold uppercase text-mut tracking-wider">Unchanged</p>
              </div>
              <div>
                <p className="text-lg font-black tabular-nums">{status.catalog_diff.removals}</p>
                <p className="text-[10px] font-bold uppercase text-mut tracking-wider">Removals</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-mut/80 leading-snug">{status.catalog_diff.generated_from}</p>
          </section>

          {/* Explicit pending engineering gates — never claim completion. */}
          <section aria-labelledby="gates-h" className="mt-5">
            <h2 id="gates-h" className="text-[11px] font-black uppercase tracking-wider text-mut mb-2">
              Pending engineering gates
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              <li className="rounded-xl border border-line bg-card px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold">Testing QA</span>
                <span className="text-[10px] font-bold text-forge-yellow">PENDING (progress 0%)</span>
              </li>
              <li className="rounded-xl border border-line bg-card px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold">Release Readiness</span>
                <span className="text-[10px] font-bold text-forge-yellow">PENDING (progress 0%)</span>
              </li>
            </ul>
            <p className="mt-2 text-[10px] text-mut/80 leading-snug">
              No testing-QA or release-readiness evidence has been recorded yet — these gates stay
              pending until real checks exist.
            </p>
          </section>
        </>
      )}

      {/* Lab apps — visible first, then hidden engineering records */}
      {apps.length > 0 && (
        <section aria-labelledby="apps-h" className="mt-6">
          <h2 id="apps-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
            <FlaskConical className="w-3.5 h-3.5" aria-hidden /> Lab apps ({visible.length} public, {hidden.length} hidden)
          </h2>
          <div className="grid gap-3">
            {[...visible, ...hidden].map((app) => (
              <article key={app.id} className="rounded-xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black">{app.name}</h3>
                  {app.hidden && (
                    <span className="px-2 py-0.5 rounded-full bg-page border border-line text-[10px] font-bold text-mut">
                      Hidden — not in the public Lab
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-mut">{app.status}</span>
                </div>

                {/* Milestone-derived progress */}
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-page overflow-hidden" role="progressbar" aria-valuenow={app.progress_percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${app.name} milestone progress`}>
                    <div className="h-full bg-cta rounded-full transition-all duration-300 motion-reduce:transition-none" style={{ width: `${app.progress_percent}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-mut tabular-nums">{app.progress_percent}%</span>
                </div>
                <ul className="mt-2 grid sm:grid-cols-3 gap-1">
                  {app.milestones.map((m) => (
                    <li key={m.title} className="text-[10px] text-mut leading-snug">
                      <span className={m.status === 'done' ? 'text-cta font-bold' : 'font-semibold'}>
                        {m.status === 'done' ? '✓' : m.status === 'in-progress' ? '◔' : '○'}
                      </span>{' '}
                      {m.title} <span className="text-mut/70">({m.status})</span>
                    </li>
                  ))}
                </ul>

                {/* Recorded verification checks only */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {app.verification.map((c) => (
                    <span key={c.id} title={c.summary ?? c.id}>
                      <ResultPill result={c.result} />
                    </span>
                  ))}
                </div>
                <details className="mt-2">
                  <summary className="text-[10px] font-bold text-cta cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 rounded">
                    Verification details ({app.verification.length} recorded)
                  </summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {app.verification.map((c) => (
                      <li key={c.id} className="text-[10px] text-mut leading-snug">
                        <p className="font-bold text-ink/80">
                          {CATEGORY_LABELS[c.category] ?? c.category} — {RESULT_LABELS[c.result]}
                          {c.build_id && <span className="ml-1 text-mut font-mono">{c.build_id}</span>}
                          {c.date && <span className="ml-1 text-mut">({c.date})</span>}
                        </p>
                        {c.summary && <p>{c.summary}</p>}
                        {c.source && <p className="text-mut/80">Source: {c.source}</p>}
                        {c.limitations && <p className="text-forge-yellow/90">Limitations: {c.limitations}</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Events timeline */}
      {events.length > 0 && (
        <section aria-labelledby="events-h" className="mt-6">
          <h2 id="events-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
            <Activity className="w-3.5 h-3.5" aria-hidden /> Latest engineering events
          </h2>
          <ol className="relative border-l border-line ml-1.5 space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="ml-4">
                <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-cta border-2 border-card" aria-hidden />
                <p className="text-[11px] font-bold text-ink/90">
                  {ev.title}
                  <span className="ml-1.5 font-semibold text-mut uppercase text-[9px] tracking-wider">{ev.type}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-mut leading-snug">{ev.description}</p>
                <p className="mt-0.5 text-[9px] font-mono text-mut/70">
                  {ev.timestamp}{ev.commit ? ` · ${ev.commit}` : ''}{ev.branch ? ` · ${ev.branch}` : ''}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[10px] text-mut/80 leading-snug flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden />
            Checksums confirm artifact integrity only when compared against a trusted reference — never security or release-readiness proof.
          </p>
        </section>
      )}

      {status === null && !error && <p className="mt-8 text-center text-xs text-mut">Loading engineering data…</p>}
    </main>
  );
}
