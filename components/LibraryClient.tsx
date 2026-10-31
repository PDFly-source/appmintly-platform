'use client';

/**
 * LIBRARY EXPERIENCE 2.0 — Phase 16.4.
 *
 * Premium, focused personal library: Saved / Recent / Downloads, local
 * search, polished empty states and a secondary Manage surface with safe
 * destructive confirmations.
 *
 * LOCAL-FIRST: everything reads the existing localStorage stores from
 * lib/localLibrary.ts (favorites, recently opened, recently downloaded).
 * No account, no backend, no new storage keys, no cloud sync.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark, Clock, Download, Search, X, Trash2, ArrowRight, ExternalLink,
  ShieldCheck, Settings2, Check, Loader2,
} from 'lucide-react';
import { AppItem } from '@/data/apps';
import { resolveDeveloper } from '@/data/publishers';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { AppIcon } from '@/components/AppIcon';
import {
  getLocalFavorites,
  getRecentlyDownloaded,
  toggleLocalFavorite,
  clearRecentlyOpened,
  clearRecentlyDownloaded,
  clearAllLocalData,
  trackAppDownloaded,
  trackAppOpened,
  LocalHistoryItem,
} from '@/lib/localLibrary';
import { AppCard } from '@/components/AppCard';
import { useRecentlyViewed } from '@/lib/personalization/useRecentlyViewed';
import { recordDownloadedVersion } from '@/lib/app-installs';
import { isSaved as isLabSaved, localWishlistIds, toggleWishlist } from '@/lib/upcoming-wishlist';
import { getUpcomingApps } from '@/data/upcoming-apps';
import {
  mergeWishlist,
  searchWishlist,
  removalTargets,
  type WishlistEntry,
} from '@/lib/wishlist';

type LibraryView = 'saved' | 'recent' | 'downloads';

interface LibraryEntry {
  app: AppItem;
  timestamp: number;
}

const VIEW_META: Record<LibraryView, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  saved: { label: 'Saved', icon: Bookmark },
  recent: { label: 'Recent', icon: Clock },
  downloads: { label: 'Downloads', icon: Download },
};

/** Reliable timestamp label: Today / Yesterday / compact relative / date. */
function timeLabel(ts: number, now: number): string {
  const d = new Date(ts);
  const n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  const yesterday = new Date(now - 86_400_000);
  if (sameDay) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diff = Math.max(0, now - ts);
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LibraryPage() {
  const { toast } = useToast();
  const { catalog } = useCatalog();

  const [view, setView] = useState<LibraryView>('saved');
  const [mountedTime, setMountedTime] = useState(0);
  const [search, setSearch] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmClearRecent, setConfirmClearRecent] = useState(false);

  // Recently viewed now comes from the Item 10 personalization store
  // (appmintly.personalization.v1), resolved against published catalog records
  // so an unpublished or removed app can never render a phantom row.
  const recentViewed = useRecentlyViewed(catalog);

  // Re-read local stores after mount and on every local update event.
  useEffect(() => {
    const timer = setTimeout(() => setMountedTime(Date.now()), 0);
    const handleUpdate = () => setMountedTime(Date.now());
    window.addEventListener('appmintly_local_updated', handleUpdate);
    // Lab wishlist writes live in their own store with their own event; the
    // unified list must react to both or a Lab save would not appear here.
    window.addEventListener('appmintly_upcoming_wishlist_updated', handleUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('appmintly_local_updated', handleUpdate);
      window.removeEventListener('appmintly_upcoming_wishlist_updated', handleUpdate);
    };
  }, []);

  const resolveApp = useCallback(
    (id: string): AppItem | undefined =>
      catalog.find(
        (a) => a.id.toLowerCase() === id.toLowerCase() || a.slug.toLowerCase() === id.toLowerCase()
      ),
    [catalog]
  );

  const { saved, recent, downloads } = useMemo(() => {
    // SSR/hydration guard: only read localStorage after mount so the first
    // client render matches the server HTML (no React #418 text mismatch).
    if (!mountedTime) return { saved: [], recent: [], downloads: [] };
    // Unified wishlist: catalog favourites + Lab saves, merged on the
    // published app id so an app saved in both stores appears exactly once.
    const { entries: savedApps } = mergeWishlist<AppItem>({
      catalogIds: getLocalFavorites(),
      labIds: localWishlistIds(),
      apps: catalog,
      roadmap: getUpcomingApps(),
    });
    const downloadApps: LibraryEntry[] = getRecentlyDownloaded()
      .map((item: LocalHistoryItem) => {
        const app = resolveApp(item.appId);
        return app ? { app, timestamp: item.timestamp } : null;
      })
      .filter((e): e is LibraryEntry => Boolean(e));
    const recentApps: LibraryEntry[] = recentViewed.items.map((entry) => ({
      app: entry.app as AppItem,
      timestamp: entry.at,
    }));
    return { saved: savedApps, recent: recentApps, downloads: downloadApps };
  }, [resolveApp, mountedTime, catalog, recentViewed.items]);

  const counts = useMemo(
    () => ({ saved: saved.length, recent: recent.length, downloads: downloads.length }),
    [saved, recent, downloads]
  );

  const current: (WishlistEntry | LibraryEntry)[] =
    view === 'saved' ? saved : view === 'recent' ? recent : downloads;

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (view === 'saved') return searchWishlist(saved, search);
    if (!query) return current;
    return (current as LibraryEntry[]).filter((entry) => {
      const app = entry.app;
      const dev = resolveDeveloper(app);
      const hay = `${app.name} ${app.category} ${app.type} ${dev.name}`.toLowerCase();
      return hay.includes(query);
    });
  }, [current, query, saved, search, view]);

  const announce = `${visible.length} ${visible.length === 1 ? 'app' : 'apps'} in ${VIEW_META[view].label}${query ? ' matching your search' : ''}.`;

  const unsave = (app: AppItem) => {
    const entry = saved.find((e) => e.app.id === app.id);
    const targets = removalTargets(entry);
    // Remove from every store that actually holds it, and only those, so the
    // library list cannot keep showing an app the user just removed while
    // untouched stores keep their data.
    if (targets.catalog && getLocalFavorites().includes(app.id)) {
      toggleLocalFavorite(app.id);
    }
    for (const labId of targets.labIds) {
      if (isLabSaved(labId)) toggleWishlist(labId);
    }
    toast(`Removed "${app.name}" from saved apps.`, 'info');
  };

  const removeRecent = (app: AppItem) => {
    recentViewed.remove(app.slug);
    toast(`Removed "${app.name}" from recently viewed.`, 'info');
  };

  const clearRecentHistory = () => {
    recentViewed.clear();
    // The legacy "recently opened" store is no longer rendered, but it still
    // receives writes from app cards, so clearing it keeps storage honest.
    clearRecentlyOpened();
    setConfirmClearRecent(false);
    toast('Recently viewed history cleared.', 'info');
  };

  const toggleRecentRecording = () => {
    const next = !recentViewed.enabled;
    recentViewed.setEnabled(next);
    toast(
      next
        ? 'Recently viewed recording on. Visits will be saved on this device.'
        : 'Recently viewed recording off. Your existing history is kept.',
      'info'
    );
  };

  const recentControls = (
    <div className="rounded-2xl border border-line bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Recently viewed</p>
          <p className="text-[11px] text-mut mt-0.5">
            {recentViewed.enabled
              ? 'Visits to published apps are saved on this device only.'
              : 'Recording is off. Your existing history is kept.'}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={recentViewed.enabled}
          onClick={toggleRecentRecording}
          className={`min-h-[44px] shrink-0 inline-flex items-center gap-1.5 px-4 rounded-full border text-xs font-bold transition ${
            recentViewed.enabled
              ? 'border-forge-green/40 bg-forge-green/10 text-forge-green'
              : 'border-line bg-page text-mut hover:text-ink'
          }`}
        >
          <Clock aria-hidden="true" className="w-3.5 h-3.5" />
          {recentViewed.enabled ? 'Recording on' : 'Recording off'}
        </button>
      </div>

      {confirmClearRecent ? (
        <div className="rounded-xl border border-forge-red/30 bg-forge-red/10 p-3 space-y-2.5">
          <p className="text-xs font-bold text-ink">Clear recently viewed history?</p>
          <p className="text-[11px] text-mut">
            This removes your view history from this device. Saved apps and Lab wishlist
            saves are not affected.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmClearRecent(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-xs font-bold text-ink hover:border-mut/40 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={clearRecentHistory}
              className="min-h-[44px] flex-1 rounded-xl bg-forge-red text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition"
            >
              <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
              Clear history
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={recentViewed.storedCount === 0}
          onClick={() => setConfirmClearRecent(true)}
          className="min-h-[44px] w-full rounded-xl border border-line bg-page px-4 text-xs font-bold text-mut hover:text-ink hover:border-mut/40 disabled:opacity-45 disabled:hover:text-mut transition text-left flex items-center justify-between"
        >
          <span>Clear history</span>
          <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* ---------------- header ---------------- */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight leading-none">
            MY LIBRARY
          </h1>
          <p className="text-xs sm:text-sm text-mut mt-2">
            Your personal AppMintly space.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line bg-card text-[10px] font-bold text-mut">
            <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" />
            Private • On-device
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5 px-4 rounded-full border border-line bg-card text-xs font-bold text-mut hover:text-ink transition"
        >
          <Settings2 aria-hidden="true" className="w-3.5 h-3.5" />
          <span>Manage</span>
        </button>
      </header>

      {/* ---------------- local search ---------------- */}
      <div className="relative">
        <label htmlFor="library-search" className="sr-only">Search your library</label>
        <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-mut pointer-events-none" />
        <input
          id="library-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your library..."
          className="w-full h-11 pl-10 pr-10 rounded-xl border border-line bg-card text-sm text-ink placeholder:text-mut/70 focus:outline-none focus:ring-2 focus:ring-cta/50"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-mut hover:bg-page hover:text-ink transition"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ---------------- segmented control ---------------- */}
      <div
        role="group"
        aria-label="Library views"
        className="grid grid-cols-3 gap-1 p-1 rounded-full border border-line bg-page w-full max-w-md"
      >
        {(Object.keys(VIEW_META) as LibraryView[]).map((v) => {
          const Icon = VIEW_META[v].icon;
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={active}
              onClick={() => setView(v)}
              className={`min-h-[44px] rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                active
                  ? 'bg-inkbg text-white shadow-xs'
                  : 'text-mut hover:text-ink'
              }`}
            >
              <Icon aria-hidden="true" className={`w-4 h-4 ${v === 'saved' && active ? 'fill-white' : ''}`} />
              <span>{VIEW_META[v].label}</span>
              <span
                aria-hidden="true"
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  active ? 'bg-white/15' : 'bg-card border border-line'
                }`}
              >
                {counts[v]}
              </span>
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">{announce}</p>

      {/* ---------------- view content ---------------- */}
      {query && visible.length === 0 ? (
        <EmptyState
          title="No matching apps"
          body="Try another search or browse your library."
          action={{ label: 'Clear Search', onClick: () => setSearch(''), icon: X }}
        />
      ) : visible.length === 0 ? (
        view === 'saved' ? (
          <EmptyState
            icon={Bookmark}
            title="Build your library"
            body="Save apps you want to find quickly later."
            action={{ label: 'Explore Apps', href: '/explore' }}
          />
        ) : view === 'recent' ? (
          <div className="space-y-3">
            {recentControls}
            <EmptyState
              icon={Clock}
              title={recentViewed.hidden > 0 ? 'No available apps yet' : 'Nothing opened yet'}
              body={
                recentViewed.hidden > 0
                  ? 'The apps you viewed are no longer published. They stay saved on this device in case they return.'
                  : recentViewed.enabled
                    ? 'Open a published app from AppMintly and it will appear here.'
                    : 'Recently viewed recording is off. Turn it on above to collect history.'
              }
              action={{ label: 'Explore Apps', href: '/explore' }}
            />
          </div>
        ) : (
          <EmptyState
            icon={Download}
            title="No downloads yet"
            body="Downloaded APK history will appear here."
            action={{ label: 'Browse Apps', href: '/explore' }}
          />
        )
      ) : view === 'saved' ? (
        <ul className="space-y-3">
          {(visible as WishlistEntry<AppItem>[]).map((entry) => (
            <SavedRow key={entry.app.id} app={entry.app} entry={entry} onUnsave={unsave} />
          ))}
        </ul>
      ) : view === 'recent' ? (
        <div className="space-y-3">
          {recentControls}
          <ul className="space-y-2.5">
            {(visible as LibraryEntry[]).map(({ app, timestamp }) => (
              <li key={app.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <AppCard app={app} variant="compact" />
                </div>
                <span className="sr-only">Viewed {timeLabel(timestamp, mountedTime)}</span>
                <button
                  type="button"
                  onClick={() => removeRecent(app)}
                  aria-label={`Remove ${app.name} from recently viewed`}
                  className="min-h-[44px] min-w-[44px] shrink-0 inline-flex items-center justify-center rounded-xl border border-line bg-card text-mut hover:text-forge-red hover:border-forge-red/30 transition"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="space-y-3">
          {(visible as LibraryEntry[]).map(({ app, timestamp }) => (
            <li key={`${app.id}-${timestamp}`}>
              <DownloadRow app={app} timestamp={timestamp} now={mountedTime} />
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- continue exploring ---------------- */}
      {recent.length > 0 && (
        <section className="pt-2" aria-labelledby="continue-exploring-label">
          <h2 id="continue-exploring-label" className="text-[10px] font-bold uppercase tracking-widest text-mut">
            Continue exploring
          </h2>
          <div className="mt-2.5 flex items-center gap-3.5 p-3.5 rounded-2xl border border-line bg-card">
            <AppIcon
              src={recent[0].app.icon}
              name={recent[0].app.name}
              size="md"
              themeColor={recent[0].app.themeColor}
              category={recent[0].app.category}
              className="shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink truncate">{recent[0].app.name}</p>
              <p className="text-[11px] text-mut mt-0.5">
                Recently opened • {timeLabel(recent[0].timestamp, mountedTime)}
              </p>
            </div>
            <Link
              href={`/app/${recent[0].app.slug}`}
              className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5 px-4 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-cta transition"
            >
              Open
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* ---------------- manage dialog ---------------- */}
      {manageOpen && (
        <ManageDialog
          savedApps={saved.map((entry) => entry.app)}
          onClose={() => setManageOpen(false)}
          onClearRecent={recentViewed.clear}
          toast={toast}
        />
      )}
    </div>
  );
}

/* --------------------------- empty state --------------------------- */

function EmptyState({
  icon: Icon = Bookmark,
  title,
  body,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action: { label: string; href?: string; onClick?: () => void; icon?: React.ComponentType<{ className?: string }> };
}) {
  const ActionIcon = action.icon || ArrowRight;
  const cls =
    'min-h-[44px] mt-5 inline-flex items-center gap-1.5 px-5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-cta transition';
  return (
    <div className="text-center py-14 px-4 bg-card rounded-3xl border border-line">
      <Icon aria-hidden="true" className="w-10 h-10 text-line mx-auto" />
      <h2 className="text-base font-bold text-ink mt-3">{title}</h2>
      <p className="text-xs text-mut mt-1 max-w-xs mx-auto">{body}</p>
      {action.href ? (
        <Link href={action.href} className={cls}>
          <span>{action.label}</span>
          <ActionIcon aria-hidden="true" className="w-3.5 h-3.5" />
        </Link>
      ) : (
        <button type="button" onClick={action.onClick} className={cls}>
          <span>{action.label}</span>
          <ActionIcon aria-hidden="true" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ----------------------------- saved row ----------------------------- */

function SavedRow({
  app,
  entry,
  onUnsave,
}: {
  app: AppItem;
  entry: WishlistEntry;
  onUnsave: (app: AppItem) => void;
}) {
  const dev = resolveDeveloper(app);
  const launchUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
  return (
    <li>
      <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-line bg-card hover:border-mut/40 transition min-w-0">
        <Link href={`/app/${app.slug}`} className="shrink-0" aria-hidden="true" tabIndex={-1}>
          <AppIcon src={app.icon} name={app.name} size="lg" themeColor={app.themeColor} category={app.category} className="shrink-0" />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/app/${app.slug}`} className="text-sm font-bold text-ink hover:text-cta transition truncate block">
            {app.name}
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-mut min-w-0">
            <span className="truncate">{dev.name}</span>
            {dev.verified && <VerifiedBadge size="xs" />}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-mut/90">
            <span className="px-1.5 py-0.5 rounded-md border border-line bg-page">v{app.version}</span>
            <span className="px-1.5 py-0.5 rounded-md border border-line bg-page">{app.type}</span>
            <span className="px-1.5 py-0.5 rounded-md border border-line bg-page">{app.category}</span>
            <span className="px-1.5 py-0.5 rounded-md border border-line bg-page">
              {entry.platform}
            </span>
            {entry.sources.saved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-forge-green/30 bg-forge-green/10 text-forge-green">
                <Bookmark aria-hidden="true" className="w-2.5 h-2.5 fill-current" />
                Saved
              </span>
            )}
            {entry.sources.lab && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-forge-blue/30 bg-forge-blue/10 text-forge-blue"
                title="Also saved on the AppMintly Lab roadmap"
              >
                Lab
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          {launchUrl ? (
            <a
              href={launchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAppOpened(app.id)}
              className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center gap-1.5 bg-inkbg text-white text-xs font-bold hover:bg-cta transition"
            >
              <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
              Open
            </a>
          ) : (
            <Link
              href={`/app/${app.slug}`}
              className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center bg-inkbg text-white text-xs font-bold hover:bg-cta transition"
            >
              View
            </Link>
          )}
          <Link
            href={`/app/${app.slug}`}
            className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center border border-line text-xs font-bold text-mut hover:text-ink hover:border-mut/40 transition"
          >
            Get App
          </Link>
          <button
            type="button"
            onClick={() => onUnsave(app)}
            aria-label={`Remove ${app.name} from saved apps`}
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-mut hover:text-forge-red hover:bg-forge-red/10 transition"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------------------------- history row ---------------------------- */

function DownloadRow({ app, timestamp, now }: { app: AppItem; timestamp: number; now: number }) {
  const apkUrl = app.apk?.apkUrl || app.apkUrl;
  return (
    <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-line bg-card hover:border-mut/40 transition min-w-0">
      <Link href={`/app/${app.slug}`} className="shrink-0" aria-hidden="true" tabIndex={-1}>
        <AppIcon src={app.icon} name={app.name} size="lg" themeColor={app.themeColor} category={app.category} className="shrink-0" />
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/app/${app.slug}`} className="text-sm font-bold text-ink hover:text-cta transition truncate block">
          {app.name}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-mut">
          <span className="px-1.5 py-0.5 rounded-md border border-line bg-page font-bold">v{app.version}</span>
          <span className="font-semibold">{app.type}</span>
          {app.size && <span>• {app.size}</span>}
        </p>
        <p className="mt-0.5 text-[10px] text-mut/80 font-semibold">
          Downloaded {timeLabel(timestamp, now)} — download history, not installed status.
        </p>
      </div>
      <div className="shrink-0">
        {apkUrl ? (
          <a
            href={apkUrl}
            onClick={() => {
              trackAppDownloaded(app.id);
              recordDownloadedVersion(app.id, app.apk?.versionName || app.version || '');
            }}
            className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center gap-1.5 bg-forge-green/10 text-forge-green border border-forge-green/25 text-xs font-bold hover:bg-forge-green hover:text-white transition"
          >
            <Download aria-hidden="true" className="w-3.5 h-3.5" />
            Download again
          </a>
        ) : (
          <Link
            href={`/app/${app.slug}`}
            className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center border border-line text-xs font-bold text-mut hover:text-ink hover:border-mut/40 transition"
          >
            View
          </Link>
        )}
      </div>
    </div>
  );
}

/* --------------------------- manage dialog --------------------------- */

function ManageDialog({
  savedApps,
  onClose,
  onClearRecent,
  toast,
}: {
  savedApps: AppItem[];
  onClose: () => void;
  onClearRecent: () => void;
  toast: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingAll) setConfirmingAll(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmingAll]);

  const run = (fn: () => void, message: string) => {
    setBusy(true);
    fn();
    setBusy(false);
    toast(message, 'info');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="Close manage dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-dialog-label"
        tabIndex={-1}
        className="relative w-full sm:max-w-md bg-page border border-line rounded-t-3xl sm:rounded-3xl p-5 space-y-4 focus:outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id="manage-dialog-label" className="text-sm font-bold text-ink">
            Manage library
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 -mt-2 rounded-xl flex items-center justify-center text-mut hover:text-ink hover:bg-card transition"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {confirmingAll ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-forge-red/30 bg-forge-red/10 p-4 space-y-1">
              <p className="text-sm font-bold text-ink">Clear local library?</p>
              <p className="text-xs text-mut">
                This will remove saved apps, recent history and local download records from this device.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingAll(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-sm font-bold text-ink hover:border-mut/40 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(clearAllLocalData, 'Local library data cleared.')}
                className="min-h-[44px] flex-1 rounded-xl bg-forge-red text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition"
              >
                {busy ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Trash2 aria-hidden="true" className="w-4 h-4" />}
                Clear data
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {savedApps.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-mut mb-2">Saved apps</p>
                <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {savedApps.map((app) => (
                    <li key={app.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2">
                      <span className="text-xs font-bold text-ink truncate">{app.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          toggleLocalFavorite(app.id);
                          toast(`Removed "${app.name}" from saved apps.`, 'info');
                        }}
                        className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-full text-[11px] font-bold text-mut hover:text-forge-red hover:bg-forge-red/10 transition shrink-0"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  run(() => {
                    onClearRecent();
                    clearRecentlyOpened();
                  }, 'Recently viewed history cleared.')
                }
                className="min-h-[44px] w-full rounded-xl border border-line bg-card px-4 text-sm font-bold text-ink hover:border-mut/40 transition text-left flex items-center justify-between"
              >
                <span>Clear recent history</span>
                <ArrowRight aria-hidden="true" className="w-4 h-4 text-mut" />
              </button>
              <button
                type="button"
                onClick={() => run(clearRecentlyDownloaded, 'Download history cleared.')}
                className="min-h-[44px] w-full rounded-xl border border-line bg-card px-4 text-sm font-bold text-ink hover:border-mut/40 transition text-left flex items-center justify-between"
              >
                <span>Clear download history</span>
                <ArrowRight aria-hidden="true" className="w-4 h-4 text-mut" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingAll(true)}
                className="min-h-[44px] w-full rounded-xl border border-forge-red/30 bg-forge-red/10 px-4 text-sm font-bold text-forge-red hover:bg-forge-red/20 transition text-left flex items-center justify-between"
              >
                <span>Clear all local data</span>
                <Trash2 aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
