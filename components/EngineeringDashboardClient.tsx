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
  Activity, AlertCircle, ArrowUpDown, Ban, CheckCircle2, Clock, FileDiff,
  FlaskConical, GitBranch, RefreshCw, Search, ShieldCheck, Wrench,
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
  /** Provenance class — automated test evidence vs repository inspection. */
  evidence_class?: string;
}

interface LabApp {
  id: string;
  name: string;
  status: string;
  hidden: boolean;
  verification: VerificationCheck[];
  milestones: {
    id: string;
    title: string;
    description: string;
    status: string;
    evidence?: string;
    evidence_class?: string;
  }[];
  progress_percent: number;
}

interface EngBuild {
  id: string;
  kind: string;
  name: string;
  commit: string;
  workflow_run_id: number;
  outcome: string;
  timestamp: string;
  scope: string;
  source: string;
}

interface Blocker {
  id: string;
  app: string;
  reason: string;
  status: string;
  note: string;
  recorded_at: string;
}

interface Condition { id: string; label: string; status: string; description: string; }

interface EngineeringStatus {
  scan_time: string;
  pipeline_state: string;
  catalog_diff: { additions: number; unchanged: number; removals: number; generated_from: string };
  health_indicator: { overall: string; conditions: Condition[] };
  /** Recorded blockers — reason, affected app, resolution status. */
  blockers?: Blocker[];
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
  const [builds, setBuilds] = useState<EngBuild[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'name' | 'progress'>('name');
  const [error, setError] = useState<string | null>(null);
  // Starts true: the first load begins with the component, so no effect
  // needs to set state synchronously (lint: no setState-in-effect cascade).
  const [refreshing, setRefreshing] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, a, e, b] = await Promise.all([
        fetch(`${BASE_PATH}/data/engineering-status.json`, { cache: 'no-store' }),
        fetch(`${BASE_PATH}/data/lab-apps.json`, { cache: 'no-store' }),
        fetch(`${BASE_PATH}/data/engineering-events.json`, { cache: 'no-store' }),
        fetch(`${BASE_PATH}/data/engineering-builds.json`, { cache: 'no-store' }),
      ]);
      if (!s.ok || !a.ok || !e.ok || !b.ok) throw new Error(`data fetch failed (${s.status}/${a.status}/${e.status}/${b.status})`);
      setStatus(await s.json());
      setApps((await a.json()).apps ?? []);
      setEvents((await e.json()).events ?? []);
      setBuilds((await b.json()).builds ?? []);
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

  // Apps toolbar: search + status filter + sort (client-side only).
  const q = query.trim().toLowerCase();
  const filteredApps = apps.filter((app) => {
    if (statusFilter !== 'all' && app.status !== statusFilter) return false;
    if (q && !app.name.toLowerCase().includes(q) && !app.id.includes(q)) return false;
    return true;
  });
  const sortedApps = [...filteredApps].sort((x, y) =>
    sortKey === 'progress' ? y.progress_percent - x.progress_percent : x.name.localeCompare(y.name)
  );

  // Evidence center: ONLY checks with recorded evidence, tagged with a
  // provenance class so automated test evidence is never presented as
  // independently verified production/device evidence.
  const evidenceRecords = apps.flatMap((app) =>
    app.verification.filter((c) => c.evidence_class).map((c) => ({ app: app.name, ...c }))
  );
  const blockers: Blocker[] = status?.blockers ?? [];

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

          {/* Search / filter / sort toolbar — keyboard accessible, 44px targets */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mut pointer-events-none" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps by name or id"
                aria-label="Search engineering apps by name or id"
                className="w-full min-h-[44px] pl-8 pr-3 rounded-xl border border-line bg-card text-xs text-ink placeholder:text-mut/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter apps by development status"
              className="min-h-[44px] min-w-0 max-w-full px-3 rounded-xl border border-line bg-card text-xs font-semibold text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
            >
              <option value="all">All statuses</option>
              <option value="in-development">In development</option>
              <option value="planned">Planned</option>
              <option value="early-testing">Early testing</option>
            </select>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-mut" aria-hidden />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'name' | 'progress')}
                aria-label="Sort apps"
                className="min-h-[44px] px-3 rounded-xl border border-line bg-card text-xs font-semibold text-ink cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60"
              >
                <option value="name">Sort: Name</option>
                <option value="progress">Sort: Progress</option>
              </select>
            </div>
          </div>

          {sortedApps.length === 0 && (
            <p className="rounded-xl border border-line bg-card px-4 py-3 text-xs text-mut">
              No app records match the current search or filter.
            </p>
          )}
          <div className="grid gap-3">
            {sortedApps.map((app) => (
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

      {/* Build & release tracker — verbatim workflow facts only */}
      {builds.length > 0 && (
        <section aria-labelledby="builds-h" className="mt-6">
          <h2 id="builds-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
            <GitBranch className="w-3.5 h-3.5" aria-hidden /> Build & release tracker ({builds.length} recorded)
          </h2>
          <ol className="grid gap-2">
            {builds.map((b) => (
              <li key={b.id} className="rounded-xl border border-line bg-card px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.outcome === 'success' ? 'bg-cta/10 text-cta border-cta/40' : 'bg-forge-red/10 text-forge-red border-forge-red/40'}`}>
                  {b.outcome === 'success' ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : <AlertCircle className="w-3 h-3" aria-hidden />}
                  {b.outcome}
                </span>
                <span className="text-xs font-bold">{b.name}</span>
                <span className="text-[10px] font-mono text-mut">commit {b.commit}</span>
                <a
                  href={`https://github.com/PDFly-source/appmintly-platform/actions/runs/${b.workflow_run_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-mono text-cta underline underline-offset-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/60 rounded"
                >
                  run {b.workflow_run_id}
                </a>
                <span className="ml-auto text-[10px] text-mut tabular-nums">{b.timestamp}</span>
                <p className="w-full text-[10px] text-mut/80 leading-snug">{b.scope} — {b.source}</p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[10px] text-mut/80 leading-snug">
            Records are verbatim GitHub Actions facts (ids, commits, outcomes, timestamps). A successful deploy
            is not proof of device testing or release readiness.
          </p>
        </section>
      )}

      {/* Evidence center — provenance classes are never interchangeable */}
      <section aria-labelledby="evidence-h" className="mt-6">
        <h2 id="evidence-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden /> Evidence center ({evidenceRecords.length} recorded)
        </h2>
        {evidenceRecords.length === 0 ? (
          <p className="rounded-xl border border-line bg-card px-4 py-3 text-xs text-mut">
            No verification evidence has been recorded yet — all checks stay pending.
          </p>
        ) : (
          <div className="grid gap-2">
            {evidenceRecords.map((r) => (
              <article key={`${r.app}-${r.id}`} className="rounded-xl border border-line bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-black">{r.app}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-mut">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                  <ResultPill result={r.result} />
                  <span className="ml-auto rounded-full bg-page border border-line px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mut">
                    {r.evidence_class === 'automated-test-evidence' ? 'Automated test evidence' : r.evidence_class === 'repository-inspection' ? 'Repository inspection' : r.evidence_class}
                  </span>
                </div>
                {r.summary && <p className="mt-1.5 text-[10px] text-ink/85 leading-snug">{r.summary}</p>}
                {r.source && <p className="mt-1 text-[10px] text-mut/85 leading-snug">Source: {r.source}{r.build_id ? ` · ${r.build_id}` : ''}{r.date ? ` · ${r.date}` : ''}</p>}
                {r.limitations && <p className="mt-1 text-[10px] text-forge-yellow/90 leading-snug">Limitations: {r.limitations}</p>}
              </article>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-mut/80 leading-snug">
          Provenance classes are kept separate: repository facts, team-reported progress, automated test
          evidence, and independently verified production/device evidence are never interchangeable.
          No independently verified production/device evidence has been recorded yet.
        </p>
      </section>

      {/* Blocker management — documented, with resolution status */}
      <section aria-labelledby="blockers-h" className="mt-6">
        <h2 id="blockers-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
          <Ban className="w-3.5 h-3.5" aria-hidden /> Blockers ({blockers.filter((b) => b.status === 'open').length} open)
        </h2>
        {blockers.length === 0 ? (
          <p className="rounded-xl border border-line bg-card px-4 py-3 text-xs text-mut">No blockers recorded.</p>
        ) : (
          <ul className="grid gap-2">
            {blockers.map((b) => (
              <li key={b.id} className="rounded-xl border border-line bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-black">{b.app}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.status === 'open' ? 'bg-forge-yellow/10 text-forge-yellow border-forge-yellow/40' : 'bg-cta/10 text-cta border-cta/40'}`}>
                    {b.status === 'open' ? <Clock className="w-3 h-3" aria-hidden /> : <CheckCircle2 className="w-3 h-3" aria-hidden />}
                    {b.status}
                  </span>
                  <span className="ml-auto text-[9px] font-mono text-mut/80">recorded {b.recorded_at}</span>
                </div>
                <p className="mt-1 text-[10px] text-ink/85 leading-snug">{b.reason}</p>
                {b.note && <p className="mt-1 text-[10px] text-mut/85 leading-snug">{b.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Events timeline */}
      {events.length > 0 && (
        <section aria-labelledby="events-h" className="mt-6">
          <h2 id="events-h" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mut mb-2">
            <Activity className="w-3.5 h-3.5" aria-hidden /> Audit history — recorded changes & evidence updates
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
