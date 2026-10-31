'use client';

/**
 * AppMintly Item 6 — Smart App Update Center (client surface).
 *
 * The rules live in lib/updates/model.ts; this file renders them and never
 * adds a number of its own. Every version, date and note shown here comes from
 * the published catalog record, and the only "update available" badge comes
 * from a strict comparison against a record this browser actually stored.
 *
 * Accessibility / responsive notes:
 *  - semantic headings and lists, one h1, real buttons (44px min touch),
 *  - <details> for version history so it is keyboard operable for free,
 *  - single column on mobile, no fixed widths, no horizontal overflow.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Download,
  HelpCircle,
  History,
  Globe2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { APPS, type AppItem } from '@/data/apps';
import { AppIcon } from '@/components/AppIcon';
import { ApkInstallSheet } from '@/components/ApkInstallSheet';
import { getInstallRecord, knownLocalVersion } from '@/lib/app-installs';
import {
  buildUpdateCenter,
  latestVersionOf,
  recentlyUpdated,
  releaseNotesFor,
  versionHistoryFor,
  versionKnowledge,
  webUpdateHint,
  type VersionKnowledge,
} from '@/lib/updates/model';
import { notificationsEnabled, useWatchList } from '@/lib/updates/watch';

const PUBLISHED: AppItem[] = APPS.filter((a) => a.published === true);

export function UpdateCenter() {
  const [localVersions, setLocalVersions] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const { watched, toggle } = useWatchList();
  const [notifyOn, setNotifyOn] = useState(false);

  // Local records are read after mount so server and client markup agree.
  useEffect(() => {
    // Deliberate post-hydration read of localStorage: SSR cannot know these
    // values, so writing them once after mount is the intent here.
    const map: Record<string, string> = {};
    for (const app of PUBLISHED) {
      map[app.id] = knownLocalVersion(getInstallRecord(app.id));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalVersions(map);
    setNotifyOn(notificationsEnabled());
    setReady(true);
  }, []);

  const buckets = useMemo(() => buildUpdateCenter(PUBLISHED as never[], localVersions), [localVersions]);
  const recent = useMemo(() => recentlyUpdated(PUBLISHED as never[], 4), []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mut">Update center</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Your apps, at their latest published version
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-mut">
          Versions come from the published AppMintly catalog. AppMintly never asks your device what is installed: it
          compares the catalog against the version this browser downloaded, so &ldquo;up to date&rdquo; always means
          &ldquo;matches what you downloaded here&rdquo;.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-mut">
          <BadgeCheck className="h-3.5 w-3.5 text-success-text" aria-hidden="true" />
          {buckets.totalPublished} published apps checked
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-mut">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          {watched.length} watched in this browser
        </span>
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink hover:border-ink/30"
        >
          {notifyOn ? <Bell className="h-3.5 w-3.5 text-success-text" aria-hidden="true" /> : <BellOff className="h-3.5 w-3.5" aria-hidden="true" />}
          Update notifications {notifyOn ? 'on' : 'off'} · manage
        </Link>
      </div>

      <section aria-labelledby="available-heading" className="mt-8">
        <h2 id="available-heading" className="text-sm font-bold uppercase tracking-wider text-mut">
          Updates for apps you downloaded
        </h2>
        {!ready ? (
          <div className="mt-3 h-24 animate-pulse rounded-2xl border border-line bg-card" />
        ) : buckets.available.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-line bg-card p-5 text-sm text-mut">
            No updates found for the versions recorded in this browser. This list stays empty until the catalog
            publishes a newer verified release than the one you downloaded here.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {buckets.available.map(({ app, knowledge }) => (
              <UpdateRow
                key={app.id}
                app={app as AppItem}
                knowledge={knowledge}
                watched={watched.includes(app.id || '')}
                onToggleWatch={() => app.id && toggle(app.id)}
                highlight
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="uptodate-heading" className="mt-8">
        <h2 id="uptodate-heading" className="text-sm font-bold uppercase tracking-wider text-mut">
          Up to date
        </h2>
        {ready && buckets.upToDate.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-line bg-card p-5 text-sm text-mut">
            Nothing to show yet. Download an app from its page and it will appear here with the version this browser
            recorded.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {buckets.upToDate.map(({ app, knowledge }) => (
              <UpdateRow
                key={app.id}
                app={app as AppItem}
                knowledge={knowledge}
                watched={watched.includes(app.id || '')}
                onToggleWatch={() => app.id && toggle(app.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="unknown-heading" className="mt-8">
        <h2 id="unknown-heading" className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-mut">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> No version recorded in this browser
        </h2>
        <p className="mt-1 text-[11px] text-mut">
          AppMintly cannot see what is installed on your device, so these apps are listed as unknown rather than
          &ldquo;up to date&rdquo;.
        </p>
        {buckets.unknown.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {buckets.unknown.map(({ app, knowledge }) => (
              <li key={app.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                <AppIcon src={(app as AppItem).icon} name={app.name || "App"} category={(app as AppItem).category} themeColor={(app as AppItem).themeColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/app/${app.slug}/`} className="truncate text-sm font-bold text-ink hover:underline">
                    {app.name}
                  </Link>
                  <p className="truncate text-[11px] text-mut">
                    Published v{knowledge.latestVersion}
                    {knowledge.deliverable ? ' · verified APK' : ' · web only'}
                  </p>
                </div>
                <Link
                  href={`/app/${app.slug}/`}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-ink hover:border-ink/30"
                >
                  Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="recent-heading" className="mt-10">
        <h2 id="recent-heading" className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-mut">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Recently updated
        </h2>
        <p className="mt-1 text-[11px] text-mut">Ordered by the release dates recorded in the catalog, not by build time.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {recent.map(({ app, date, dateField }) => (
            <li key={app.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-start gap-3">
                <AppIcon src={(app as AppItem).icon} name={app.name || "App"} category={(app as AppItem).category} themeColor={(app as AppItem).themeColor} size="md" />
                <div className="min-w-0 flex-1">
                  <Link href={`/app/${app.slug}/`} className="text-sm font-bold text-ink hover:underline">
                    {app.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-mut">
                    <span className="inline-flex items-center gap-1 font-semibold text-ink">v{latestVersionOf(app)}</span>
                    {date ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" aria-hidden="true" />
                        {date}
                        <span className="text-[10px] opacity-70">({dateField})</span>
                      </span>
                    ) : (
                      <span>No release date published</span>
                    )}
                  </p>
                  {releaseNotesFor(app).length > 0 ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-mut">{releaseNotesFor(app)[0]}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 rounded-2xl border border-line bg-card p-4 text-[11px] leading-relaxed text-mut">
        <strong className="text-ink">What this page can and cannot know.</strong> It reads the published catalog and
        this browser&rsquo;s own download records. It never reports installs, ratings, download counts or popularity,
        and it never marks an unpublished or unverified release as available. A &ldquo;download&rdquo; is a request
        for the verified release asset; AppMintly does not claim an installation completed.
      </p>
    </div>
  );
}

function UpdateRow({
  app,
  knowledge,
  watched,
  onToggleWatch,
  highlight = false,
}: {
  app: AppItem;
  knowledge: VersionKnowledge;
  watched: boolean;
  onToggleWatch: () => void;
  highlight?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const history = versionHistoryFor(app as never);
  const notes = releaseNotesFor(app as never);
  const web = webUpdateHint(app as never);

  return (
    <li
      className={`rounded-2xl border bg-card p-4 ${
        highlight ? 'border-forge-green/40 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]' : 'border-line'
      }`}
    >
      <div className="flex items-start gap-3">
        <AppIcon src={(app as AppItem).icon} name={app.name || "App"} category={(app as AppItem).category} themeColor={(app as AppItem).themeColor} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/app/${app.slug}/`} className="text-sm font-bold text-ink hover:underline">
              {app.name}
            </Link>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                knowledge.state === 'update-available'
                  ? 'bg-forge-green/15 text-success-text'
                  : knowledge.state === 'up-to-date'
                    ? 'bg-ink/5 text-ink'
                    : 'bg-amber-500/15 text-amber-700'
              }`}
            >
              {knowledge.state === 'update-available'
                ? 'Update available'
                : knowledge.state === 'up-to-date'
                  ? 'Up to date'
                  : knowledge.label}
            </span>
          </div>

          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mut">
            <div className="flex items-center gap-1">
              <dt className="font-semibold">Latest</dt>
              <dd className="font-mono text-ink">v{knowledge.latestVersion}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="font-semibold">You downloaded</dt>
              <dd className="font-mono text-ink">{knowledge.localVersion ? `v${knowledge.localVersion}` : 'not in this browser'}</dd>
            </div>
            {app.apk?.releaseDate ? (
              <div className="flex items-center gap-1">
                <dt className="font-semibold">Released</dt>
                <dd className="text-ink">{app.apk.releaseDate}</dd>
              </div>
            ) : null}
          </dl>

          {notes.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-mut">What&rsquo;s new</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-ink">
                {notes.slice(0, 4).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-mut">No release notes were published for this version.</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {knowledge.deliverable ? (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-inkbg px-4 text-xs font-bold text-on-ink hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {knowledge.state === 'update-available' ? `Get v${knowledge.latestVersion}` : 'Download APK'}
              </button>
            ) : null}
            {web.state === 'web-always-current' ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[11px] font-semibold text-mut">
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> Web build always latest
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleWatch}
              aria-pressed={watched}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-[11px] font-bold text-ink hover:border-ink/30"
            >
              {watched ? <Bell className="h-3.5 w-3.5 text-success-text" aria-hidden="true" /> : <BellOff className="h-3.5 w-3.5" aria-hidden="true" />}
              {watched ? 'Watching' : 'Watch'}
            </button>
          </div>

          {history.length > 1 ? (
            <details className="mt-3 rounded-xl border border-line bg-canvas/60 p-3">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-mut">
                Version history ({history.length})
              </summary>
              <ol className="mt-2 space-y-2">
                {history.map((entry, index) => (
                  <li key={`${entry.version}-${index}`} className="text-[11px]">
                    <span className="font-mono font-bold text-ink">v{entry.version}</span>
                    {entry.date ? <span className="ml-2 text-mut">{entry.date}</span> : null}
                    {entry.source === 'changelog' ? <span className="ml-2 text-[10px] text-mut">(changelog)</span> : null}
                    {entry.notes.length > 0 ? <p className="mt-0.5 text-mut">{entry.notes.join(' · ')}</p> : null}
                  </li>
                ))}
              </ol>
            </details>
          ) : (
            <p className="mt-3 flex items-center gap-1 text-[11px] text-mut">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> No earlier releases recorded in the catalog.
            </p>
          )}
        </div>
      </div>

      <ApkInstallSheet app={app} isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
    </li>
  );
}

/** Small inline indicator for the app detail page. */
export function UpdateIndicator({ app }: { app: AppItem }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    // Post-hydration read only; the indicator renders nothing until it is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(knownLocalVersion(getInstallRecord(app.id)));
  }, [app.id]);

  if (local === null) return null;
  const knowledge = versionKnowledge(app as never, local);
  if (knowledge.state !== 'update-available' && knowledge.state !== 'catalog-behind') return null;

  return (
    <p
      className={`mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold ${
        knowledge.state === 'update-available' ? 'bg-forge-green/15 text-success-text' : 'bg-amber-500/15 text-amber-700'
      }`}
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {knowledge.state === 'update-available'
        ? `Update available: v${knowledge.latestVersion} (you downloaded v${knowledge.localVersion})`
        : knowledge.label}
      <Link href="/updates/" className="underline underline-offset-2">
        Update center
      </Link>
    </p>
  );
}
