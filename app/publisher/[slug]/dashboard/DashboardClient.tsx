'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  FileEdit,
  Rocket,
  Image as ImageIcon,
  Bell,
  BarChart3,
  Settings as SettingsIcon,
  ShieldCheck,
  Lock,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Smartphone,
  MonitorSmartphone,
  Sun,
  Moon,
} from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';
import { useTheme } from '@/lib/theme-context';
import { getDeveloperIdentity } from '@/data/publishers';
import { AppItem } from '@/data/apps';
import { AppIcon } from '@/components/AppIcon';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { PUBLISHER_API_BASE } from '@/lib/production-publish';

/**
 * PRIVATE PUBLISHER DASHBOARD (separate from the public profile).
 *
 * Data honesty contract (Phase 9):
 * - Every number shown is derived from the live published catalog or the
 *   device-local draft overlay. No fabricated metrics anywhere.
 * - Metrics that need a backend endpoint that is NOT deployed (analytics,
 *   notifications feed) render an explicit "Awaiting data / Backend
 *   endpoint unavailable" state. Never a placeholder number.
 */

type TabId =
  | 'overview'
  | 'apps'
  | 'drafts'
  | 'releases'
  | 'media'
  | 'updates'
  | 'analytics'
  | 'settings'
  | 'security';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'apps', label: 'Apps', icon: Package },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'releases', label: 'Releases', icon: Rocket },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'updates', label: 'Updates', icon: Bell },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

const SESSION_EDITS_KEY = 'appmintly_session_edits_v1';

function readDrafts(): AppItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SESSION_EDITS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.values(parsed as Record<string, AppItem>);
    }
  } catch {
    /* unreadable — treat as no drafts */
  }
  return [];
}

function releaseState(app: AppItem): 'RELEASED' | 'READY' | 'DRAFT' {
  if (app.published && app.apk?.verified) return 'RELEASED';
  if (app.published) return 'READY';
  return 'DRAFT';
}

const STATE_STYLES: Record<string, string> = {
  RELEASED: 'bg-[#16A765]/15 text-[#16A765] border-[#16A765]/30',
  READY: 'bg-[#1976F3]/15 text-[#1976F3] border-[#1976F3]/30',
  DRAFT: 'bg-[#F7B928]/15 text-[#8C6000] border-[#F7B928]/30',
  BUILDING: 'bg-[#1976F3]/15 text-[#1976F3] border-[#1976F3]/30',
  FAILED: 'bg-[#E52B32]/15 text-[#E52B32] border-[#E52B32]/30',
  ARCHIVED: 'bg-mut/15 text-mut border-mut/30',
};

function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border ${STATE_STYLES[state] || STATE_STYLES.ARCHIVED}`}
    >
      {state === 'RELEASED' && <CheckCircle2 className="w-3 h-3" />}
      {state === 'DRAFT' && <FileEdit className="w-3 h-3" />}
      <span>{state}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="p-4 rounded-2xl bg-card border border-line">
      <div className="flex items-center gap-1.5 text-mut text-[10px] font-black uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-2xl font-black mt-1.5 text-ink">{value}</p>
      {hint && <p className="text-[10px] text-mut mt-0.5">{hint}</p>}
    </div>
  );
}

function AwaitingCard({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="p-4 rounded-2xl bg-card border border-line border-dashed" aria-live="polite">
      <div className="flex items-center gap-1.5 text-mut text-[10px] font-black uppercase tracking-wide">
        <Clock className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-sm font-bold mt-1.5 text-mut">Not available yet</p>
      <p className="text-[10px] text-mut mt-0.5 leading-relaxed">{reason}</p>
    </div>
  );
}

export default function DashboardClient() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || '';
  const identity = getDeveloperIdentity(slug);
  const { publishedApps } = useCatalog();
  const { mode, setMode } = useTheme();
  const [tab, setTab] = React.useState<TabId>('overview');
  const [drafts, setDrafts] = React.useState<AppItem[]>([]);

  React.useEffect(() => {
    if (tab === 'drafts') setDrafts(readDrafts());
  }, [tab]);

  const myApps = React.useMemo(
    () => (identity ? publishedApps.filter((a) => a.developerSlug === identity.slug) : []),
    [publishedApps, identity]
  );

  if (!identity) {
    return (
      <div className="min-h-[60vh] bg-page text-ink flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-mut mb-3" />
          <p className="text-sm font-bold">No publisher found for this dashboard.</p>
          <Link href="/explore" className="text-xs font-bold text-[#1976F3] hover:underline mt-2 inline-block">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const latestRelease = [...myApps].sort(
    (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
  )[0];

  const latestUpdate = [...myApps].sort(
    (a, b) => new Date(b.lastUpdated || b.updatedAt || b.releaseDate || 0).getTime() -
      new Date(a.lastUpdated || a.updatedAt || a.releaseDate || 0).getTime()
  )[0];

  return (
    <div className="min-h-screen bg-page text-ink pb-10">
      {/* Header */}
      <section className="px-4 sm:px-6 pt-8 max-w-6xl mx-auto">
        <Link
          href={`/publisher/${slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1976F3] hover:underline mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Public profile</span>
        </Link>
        <div className="rounded-3xl bg-card border border-line p-5 sm:p-7 shadow-xs">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl bg-inkbg text-white flex items-center justify-center text-lg font-black shrink-0"
              aria-hidden="true"
            >
              {identity.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">Publisher Dashboard</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-mut/10 text-mut text-[10px] font-black border border-line">
                  <Lock className="w-3 h-3" /> PRIVATE
                </span>
                {identity.verified && <VerifiedBadge size="xs" />}
              </div>
              <p className="text-xs text-mut mt-1">
                {identity.name} · {slug} · data from the live published catalog
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs (mobile-first horizontal scroll) */}
      <nav
        className="px-4 sm:px-6 max-w-6xl mx-auto mt-6"
        aria-label="Dashboard sections"
      >
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition cursor-pointer border ${
                  active
                    ? 'bg-inkbg text-white border-inkbg shadow-2xs'
                    : 'bg-card text-ink border-line hover:bg-line/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="px-4 sm:px-6 max-w-6xl mx-auto mt-6 space-y-5" id="dashboard-content">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <StatCard label="Published Apps" value={myApps.length} hint="live catalog records" icon={Package} />
              <StatCard label="Drafts" value={drafts.length} hint="on this device" icon={FileEdit} />
              <StatCard
                label="Latest Release"
                value={latestRelease ? `v${latestRelease.version}` : '—'}
                hint={latestRelease?.releaseDate || 'no releases yet'}
                icon={Rocket}
              />
              <StatCard
                label="Latest Update"
                value={latestUpdate?.version ? `v${latestUpdate.version}` : '—'}
                hint={(latestUpdate && (latestUpdate.lastUpdated || latestUpdate.releaseDate)) || '—'}
                icon={Clock}
              />
              <StatCard label="Catalog Items" value={publishedApps.length} hint="entire marketplace" icon={LayoutDashboard} />
              <AwaitingCard
                label="Downloads"
                reason="Download metrics require the Worker analytics endpoint (not deployed yet)."
              />
            </div>
            <div className="rounded-2xl bg-card border border-line p-4 text-xs text-mut leading-relaxed">
              Data source: the live published catalog (data/apps.json) and this device&apos;s draft
              overlay. Metrics requiring unavailable backend endpoints are marked
              &ldquo;Not available yet&rdquo; — never estimated.
            </div>
          </>
        )}

        {tab === 'apps' && (
          <div className="space-y-3">
            {myApps.length === 0 && (
              <div className="rounded-2xl bg-card border border-line border-dashed p-8 text-center text-sm text-mut">
                No published apps for this publisher yet.
              </div>
            )}
            {myApps.map((app) => (
              <Link
                key={app.id}
                href={`/app/${app.slug}`}
                className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-line hover:border-ink/30 transition"
              >
                <AppIcon src={app.icon} name={app.name} size="sm" category={app.category} themeColor={app.themeColor} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black truncate">{app.name}</p>
                  <p className="text-[11px] text-mut truncate">
                    v{app.version} · {app.category} · {app.type}
                  </p>
                </div>
                <StateBadge state={releaseState(app)} />
              </Link>
            ))}
          </div>
        )}

        {tab === 'drafts' && (
          <div className="space-y-3">
            {drafts.length === 0 ? (
              <div className="rounded-2xl bg-card border border-line border-dashed p-8 text-center">
                <FileEdit className="w-8 h-8 mx-auto text-mut mb-2" />
                <p className="text-sm font-bold">No drafts on this device</p>
                <p className="text-xs text-mut mt-1">
                  Drafts saved from the Publisher Console appear here (device-local only).
                </p>
              </div>
            ) : (
              drafts.map((d) => (
                <div key={d.id || d.slug} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-line">
                  <AppIcon src={d.icon} name={d.name} size="sm" category={d.category} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black truncate">{d.name}</p>
                    <p className="text-[11px] text-mut truncate">
                      {d.slug} · v{d.version} · device-local draft
                    </p>
                  </div>
                  <StateBadge state={d.published ? 'READY' : 'DRAFT'} />
                </div>
              ))
            )}
            <Link
              href="/publisher"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1976F3] hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Publisher Console to edit drafts
            </Link>
          </div>
        )}

        {tab === 'releases' && (
          <div className="space-y-4">
            {myApps.length === 0 && (
              <div className="rounded-2xl bg-card border border-line border-dashed p-8 text-center text-sm text-mut">
                No releases yet.
              </div>
            )}
            {myApps.map((app) => {
              const apk = app.apk;
              const state = releaseState(app);
              return (
                <div key={app.id} className="rounded-2xl bg-card border border-line p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AppIcon src={app.icon} name={app.name} size="sm" category={app.category} />
                      <div className="min-w-0">
                        <p className="text-sm font-black truncate">{app.name}</p>
                        <p className="text-[11px] text-mut">{apk?.releaseTag || app.slug}</p>
                      </div>
                    </div>
                    <StateBadge state={state} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    <div>
                      <dt className="text-mut font-bold">Version</dt>
                      <dd className="font-mono font-bold">{app.version}</dd>
                    </div>
                    <div>
                      <dt className="text-mut font-bold">Version Code</dt>
                      <dd className="font-mono font-bold">{apk?.versionCode ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-mut font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Package ID
                        <span className="text-[9px] font-black text-[#F7B928] bg-[#F7B928]/15 border border-[#F7B928]/30 px-1 rounded">
                          PROTECTED
                        </span>
                      </dt>
                      <dd className="font-mono font-bold break-all">{apk?.packageId || '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-mut font-bold flex items-center gap-1">
                        <Fingerprint className="w-3 h-3" /> SHA-256
                        <span className="text-[9px] font-black text-[#F7B928] bg-[#F7B928]/15 border border-[#F7B928]/30 px-1 rounded">
                          PROTECTED
                        </span>
                      </dt>
                      <dd className="font-mono break-all text-[10px]">{apk?.sha256 || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-mut font-bold">Asset</dt>
                      <dd className="font-mono font-bold truncate">{apk?.fileName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-mut font-bold">Size</dt>
                      <dd className="font-mono font-bold">
                        {apk?.fileSizeBytes ? `${(apk.fileSizeBytes / 1024).toFixed(0)} KB` : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-mut font-bold">Release Date</dt>
                      <dd className="font-bold">{apk?.releaseDate || app.releaseDate}</dd>
                    </div>
                    <div>
                      <dt className="text-mut font-bold">State</dt>
                      <dd className="font-bold">{state}</dd>
                    </div>
                  </dl>

                  {apk?.apkUrl && (
                    <a
                      href={apk.apkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1976F3] hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      GitHub Release reference
                    </a>
                  )}

                  <p className="text-[10px] text-mut border-t border-line pt-2 leading-relaxed">
                    Protected production metadata: package ID, release tag, SHA-256 and release
                    assets are immutable for verified releases. They are read-only here and can
                    never be edited from this dashboard.
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'media' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-line p-4 text-sm">
              <p className="font-black flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Media Manager
              </p>
              <p className="text-xs text-mut mt-2 leading-relaxed">
                Icons and screenshots are managed in the Publisher Console, which validates
                square icons, image dimensions, file sizes, and safe image URLs before a
                catalog publish. Existing production icons are only replaced when a new catalog
                version is explicitly published.
              </p>
            </div>
            <Link
              href="/publisher"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold transition hover:opacity-90"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Console Media Manager
            </Link>
          </div>
        )}

        {tab === 'updates' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-line p-4">
              <p className="text-sm font-black flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notifications
              </p>
              <p className="text-xs text-mut mt-2">No new updates</p>
              <p className="text-[10px] text-mut mt-1 leading-relaxed">
                Notifications are backed by real catalog changes only. The live notification
                feed requires the Worker notifications endpoint (not deployed yet); until then
                this dashboard truthfully reports zero notifications.
              </p>
            </div>
            {myApps.map((app) => (
              <div key={app.id} className="rounded-2xl bg-card border border-line p-4">
                <p className="text-sm font-black">
                  {app.name} <span className="font-mono text-mut">v{app.version}</span>
                </p>
                <p className="text-[10px] text-mut">
                  Released {app.releaseDate}
                  {app.lastUpdated ? ` · updated ${app.lastUpdated}` : ''}
                </p>
                {app.releaseNotes && app.releaseNotes.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {app.releaseNotes.map((note, i) => (
                      <li key={i} className="text-xs text-ink/85 flex gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A765] shrink-0 mt-0.5" />
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-mut mt-1">No changelog recorded for this release.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'analytics' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-line border-dashed p-6 text-center">
              <BarChart3 className="w-8 h-8 mx-auto text-mut mb-2" />
              <p className="text-sm font-bold">Analytics unavailable</p>
              <p className="text-xs text-mut mt-1.5 leading-relaxed max-w-md mx-auto">
                Privacy-friendly aggregate analytics (page views, detail views, searches,
                download clicks) require the Worker analytics endpoint, which is not deployed
                yet. No numbers are shown because no real data exists yet.
              </p>
            </div>
            <div className="rounded-2xl bg-card border border-line p-4 text-[11px] text-mut leading-relaxed">
              <p className="font-black text-ink mb-1">Data contract (ready, awaiting backend)</p>
              Planned events: page_view, app_detail_view, search, category_visit,
              download_click, external_website_click — all aggregate counts only. No
              fingerprints, no precise location, no personal profiles, no cross-site tracking.
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-line p-4">
              <p className="text-sm font-black mb-3 flex items-center gap-2">
                <Sun className="w-4 h-4" /> Appearance
              </p>
              <div className="flex items-center gap-2" role="group" aria-label="Theme mode">
                {([
                  ['light', 'Light', Sun],
                  ['dark', 'Dark', Moon],
                  ['system', 'System', MonitorSmartphone],
                ] as const).map(([m, label, Icon]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition cursor-pointer ${
                      mode === m
                        ? 'bg-inkbg text-white border-inkbg'
                        : 'bg-page text-ink border-line hover:bg-line/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-line p-4 text-[11px] text-mut leading-relaxed">
              Publisher identity, verification status, and publish credentials are managed
              server-side (repository data + Worker secrets) and cannot be edited here.
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-line p-4 space-y-3 text-[11px] leading-relaxed">
              <p className="text-sm font-black flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#16A765]" /> Security posture
              </p>
              <div className="flex items-start gap-2">
                <KeyRound className="w-4 h-4 text-mut shrink-0 mt-0.5" />
                <p>
                  The publish key is held in memory only for the active console session and is
                  verified server-side by the Cloudflare Worker on every privileged request. It
                  is never stored on this device, never placed in URLs, and never persisted.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-mut shrink-0 mt-0.5" />
                <p>
                  Sessions expire automatically after 30 minutes of inactivity. Login attempts
                  are throttled after repeated failures.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-mut shrink-0 mt-0.5" />
                <p>
                  GitHub operations (catalog commits, workflow dispatch, release inspection)
                  happen exclusively inside the Worker. The GitHub PAT never reaches browser
                  JavaScript.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Fingerprint className="w-4 h-4 text-mut shrink-0 mt-0.5" />
                <p>
                  Production releases (package IDs, tags, SHA-256 checksums) are immutable
                  protected metadata. Verified release assets cannot be edited or replaced.
                </p>
              </div>
              <p className="text-[10px] text-mut border-t border-line pt-2">
                Backend boundary: {PUBLISHER_API_BASE.replace('https://', '')}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
