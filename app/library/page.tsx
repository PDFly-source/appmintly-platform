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
  getRecentlyOpened,
  getRecentlyDownloaded,
  toggleLocalFavorite,
  removeRecentlyOpenedItem,
  clearRecentlyOpened,
  clearRecentlyDownloaded,
  clearAllLocalData,
  trackAppDownloaded,
  trackAppOpened,
  LocalHistoryItem,
} from '@/lib/localLibrary';

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

  // Re-read local stores after mount and on every local update event.
  useEffect(() => {
    const timer = setTimeout(() => setMountedTime(Date.now()), 0);
    const handleUpdate = () => setMountedTime(Date.now());
    window.addEventListener('appmintly_local_updated', handleUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('appmintly_local_updated', handleUpdate);
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
    const savedApps = getLocalFavorites()
      .map(resolveApp)
      .filter((a): a is AppItem => Boolean(a));
    const recentApps: LibraryEntry[] = getRecentlyOpened()
      .map((item: LocalHistoryItem) => {
        const app = resolveApp(item.appId);
        return app ? { app, timestamp: item.timestamp } : null;
      })
      .filter((e): e is LibraryEntry => Boolean(e));
    const downloadApps: LibraryEntry[] = getRecentlyDownloaded()
      .map((item: LocalHistoryItem) => {
        const app = resolveApp(item.appId);
        return app ? { app, timestamp: item.timestamp } : null;
      })
      .filter((e): e is LibraryEntry => Boolean(e));
    return { saved: savedApps, recent: recentApps, downloads: downloadApps };
  }, [resolveApp, mountedTime]);

  const counts = useMemo(
    () => ({ saved: saved.length, recent: recent.length, downloads: downloads.length }),
    [saved, recent, downloads]
  );

  const current = view === 'saved' ? saved : view === 'recent' ? recent : downloads;

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return current;
    return (current as (LibraryEntry | AppItem)[]).filter((entry) => {
      const app = 'app' in entry ? entry.app : (entry as AppItem);
      const dev = resolveDeveloper(app);
      const hay = `${app.name} ${app.category} ${app.type} ${dev.name}`.toLowerCase();
      return hay.includes(query);
    });
  }, [current, query]);

  const announce = `${visible.length} ${visible.length === 1 ? 'app' : 'apps'} in ${VIEW_META[view].label}${query ? ' matching your search' : ''}.`;

  const unsave = (app: AppItem) => {
    toggleLocalFavorite(app.id);
    toast(`Removed "${app.name}" from saved apps.`, 'info');
  };

  const removeRecent = (app: AppItem) => {
    removeRecentlyOpenedItem(app.id);
    toast(`Removed "${app.name}" from recent history.`, 'info');
  };

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
          <EmptyState
            icon={Clock}
            title="Nothing opened yet"
            body="Apps you open from AppMintly will appear here."
            action={{ label: 'Explore Apps', href: '/explore' }}
          />
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
          {(visible as AppItem[]).map((app) => (
            <SavedRow key={app.id} app={app} onUnsave={unsave} />
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {(visible as LibraryEntry[]).map(({ app, timestamp }) => (
            <li key={`${app.id}-${timestamp}`}>
              {view === 'recent' ? (
                <HistoryRow
                  app={app}
                  meta={`Opened ${timeLabel(timestamp, mountedTime)}`}
                  onRemove={() => removeRecent(app)}
                  removeLabel="Remove from recent history"
                />
              ) : (
                <DownloadRow app={app} timestamp={timestamp} now={mountedTime} />
              )}
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
          savedApps={saved}
          onClose={() => setManageOpen(false)}
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

function SavedRow({ app, onUnsave }: { app: AppItem; onUnsave: (app: AppItem) => void }) {
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
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-[#16A765]/30 bg-[#16A765]/10 text-[#16A765]">
              <Bookmark aria-hidden="true" className="w-2.5 h-2.5 fill-current" />
              Saved
            </span>
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
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-mut hover:text-[#E52B32] hover:bg-[#E52B32]/10 transition"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------------------------- history row ---------------------------- */

function HistoryRow({
  app,
  meta,
  onRemove,
  removeLabel,
}: {
  app: AppItem;
  meta: string;
  onRemove: () => void;
  removeLabel: string;
}) {
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
          <span>{meta}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/app/${app.slug}`}
          className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center bg-inkbg text-white text-xs font-bold hover:bg-cta transition"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${removeLabel}: ${app.name}`}
          className="w-11 h-11 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-mut hover:text-[#E52B32] hover:bg-[#E52B32]/10 transition"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------- download row --------------------------- */

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
            onClick={() => trackAppDownloaded(app.id)}
            className="min-h-[44px] sm:min-h-0 sm:py-2 px-4 rounded-full inline-flex items-center justify-center gap-1.5 bg-[#16A765]/10 text-[#16A765] border border-[#16A765]/25 text-xs font-bold hover:bg-[#16A765] hover:text-white transition"
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
  toast,
}: {
  savedApps: AppItem[];
  onClose: () => void;
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
            <div className="rounded-2xl border border-[#E52B32]/30 bg-[#E52B32]/10 p-4 space-y-1">
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
                className="min-h-[44px] flex-1 rounded-xl bg-[#E52B32] text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition"
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
                        className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-full text-[11px] font-bold text-mut hover:text-[#E52B32] hover:bg-[#E52B32]/10 transition shrink-0"
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
                onClick={() => run(clearRecentlyOpened, 'Recent history cleared.')}
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
                className="min-h-[44px] w-full rounded-xl border border-[#E52B32]/30 bg-[#E52B32]/10 px-4 text-sm font-bold text-[#E52B32] hover:bg-[#E52B32]/20 transition text-left flex items-center justify-between"
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
