'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Clock,
  Download,
  Trash2,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Layers
} from 'lucide-react';
import { AppItem } from '@/data/apps';
import { useCatalog } from '@/lib/CatalogContext';
import {
  getLocalFavorites,
  getRecentlyOpened,
  getRecentlyDownloaded,
  clearAllLocalData,
  LocalHistoryItem
} from '@/lib/localLibrary';
import { AppCard } from '@/components/AppCard';
import { useToast } from '@/lib/ToastContext';

function formatRelativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function LibraryPage() {
  const { toast } = useToast();
  const { catalog } = useCatalog();
  const [activeTab, setActiveTab] = useState<'favorites' | 'opened' | 'downloaded'>('favorites');
  const [mountedTime, setMountedTime] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMountedTime(Date.now());
    }, 0);
    const handleUpdate = () => setMountedTime(Date.now());
    window.addEventListener('appmintly_local_updated', handleUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('appmintly_local_updated', handleUpdate);
    };
  }, []);

  const { favorites, opened, downloaded } = useMemo(() => {
    const now = mountedTime;
    const favIds = getLocalFavorites();
    const favApps = favIds
      .map((id) => catalog.find((a) => a.id.toLowerCase() === id.toLowerCase() || a.slug.toLowerCase() === id.toLowerCase()))
      .filter((a): a is AppItem => Boolean(a));

    const openedHist = getRecentlyOpened();
    const openedApps = openedHist
      .map((item) => {
        const app = catalog.find((a) => a.id.toLowerCase() === item.appId.toLowerCase() || a.slug.toLowerCase() === item.appId.toLowerCase());
        return app
          ? { app, timestamp: item.timestamp, timeText: formatRelativeTime(item.timestamp, now) }
          : null;
      })
      .filter((x): x is { app: AppItem; timestamp: number; timeText: string } => Boolean(x));

    const downloadedHist = getRecentlyDownloaded();
    const downloadedApps = downloadedHist
      .map((item) => {
        const app = catalog.find((a) => a.id.toLowerCase() === item.appId.toLowerCase() || a.slug.toLowerCase() === item.appId.toLowerCase());
        return app
          ? { app, timestamp: item.timestamp, timeText: formatRelativeTime(item.timestamp, now) }
          : null;
      })
      .filter((x): x is { app: AppItem; timestamp: number; timeText: string } => Boolean(x));

    return { favorites: favApps, opened: openedApps, downloaded: downloadedApps };
  }, [catalog, mountedTime]);

  const handleClearData = () => {
    if (confirm('Clear all your locally saved favorites, recently opened apps, and download history?')) {
      clearAllLocalData();
      setMountedTime(Date.now());
      toast('Local library data cleared.', 'info');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-line text-xs font-bold text-ink mb-2">
            <Bookmark className="w-3.5 h-3.5 text-[#E52B32]" />
            <span>Local Browser Library</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-ink tracking-tight">
            My Local Library
          </h1>
          <p className="text-xs sm:text-sm text-mut mt-1 max-w-xl">
            Saved favorites, recently launched apps, and downloaded APK history stored on your device. No account or remote database needed.
          </p>
        </div>

        <button
          onClick={handleClearData}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card hover:bg-[#E52B32]/10 text-xs font-bold text-mut hover:text-[#E52B32] border border-line transition self-start sm:self-auto cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Local Data</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line mb-8 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('favorites')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition shrink-0 ${
            activeTab === 'favorites'
              ? 'bg-inkbg text-white shadow-xs'
              : 'bg-card text-ink border border-line hover:bg-page'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${activeTab === 'favorites' ? 'fill-white' : 'text-[#E52B32]'}`} />
          <span>Favorites</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
            {favorites.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('opened')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition shrink-0 ${
            activeTab === 'opened'
              ? 'bg-inkbg text-white shadow-xs'
              : 'bg-card text-ink border border-line hover:bg-page'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-[#1976F3]" />
          <span>Recently Opened</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
            {opened.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('downloaded')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition shrink-0 ${
            activeTab === 'downloaded'
              ? 'bg-inkbg text-white shadow-xs'
              : 'bg-card text-ink border border-line hover:bg-page'
          }`}
        >
          <Download className="w-3.5 h-3.5 text-[#16A765]" />
          <span>Recently Downloaded</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
            {downloaded.length}
          </span>
        </button>
      </div>

      {/* Tab Contents */}
      {/* 1. Favorites */}
      {activeTab === 'favorites' && (
        <>
          {favorites.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {favorites.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4 bg-card rounded-3xl border border-line">
              <Bookmark className="w-12 h-12 text-line mx-auto mb-3" />
              <h3 className="text-lg font-bold text-ink">No favorites saved yet</h3>
              <p className="text-xs text-mut mt-1 max-w-sm mx-auto">
                Click the bookmark icon on any application to save it to your local library for quick access.
              </p>
              <Link
                href="/explore"
                className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition"
              >
                <span>Browse Catalog</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </>
      )}

      {/* 2. Recently Opened */}
      {activeTab === 'opened' && (
        <>
          {opened.length > 0 ? (
            <div className="space-y-3">
              {opened.map(({ app, timestamp, timeText }) => (
                <div
                  key={`${app.id}-${timestamp}`}
                  className="flex items-center justify-between p-4 rounded-2xl bg-card border border-line hover:border-ink/30 transition"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={app.icon}
                      alt={app.name}
                      className="w-12 h-12 rounded-xl object-cover border border-ink/10 shrink-0"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/app/${app.slug}`}
                        className="font-bold text-sm text-ink hover:text-[#1976F3] transition truncate block"
                      >
                        {app.name}
                      </Link>
                      <div className="flex items-center gap-2 text-[11px] text-mut mt-0.5">
                        <span>{app.type}</span>
                        <span>•</span>
                        <span>Opened {timeText}</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/app/${app.slug}`}
                    className="shrink-0 px-3.5 py-1.5 rounded-full bg-page hover:bg-inkbg hover:text-white text-xs font-bold text-ink transition border border-line"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4 bg-card rounded-3xl border border-line">
              <Clock className="w-12 h-12 text-line mx-auto mb-3" />
              <h3 className="text-lg font-bold text-ink">No recently opened apps</h3>
              <p className="text-xs text-mut mt-1 max-w-sm mx-auto">
                Apps you launch from AppMintly will appear here automatically.
              </p>
              <Link
                href="/explore"
                className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition"
              >
                <span>Discover Apps</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </>
      )}

      {/* 3. Recently Downloaded */}
      {activeTab === 'downloaded' && (
        <>
          {downloaded.length > 0 ? (
            <div className="space-y-3">
              {downloaded.map(({ app, timestamp, timeText }) => (
                <div
                  key={`${app.id}-${timestamp}`}
                  className="flex items-center justify-between p-4 rounded-2xl bg-card border border-line hover:border-ink/30 transition"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={app.icon}
                      alt={app.name}
                      className="w-12 h-12 rounded-xl object-cover border border-ink/10 shrink-0"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/app/${app.slug}`}
                        className="font-bold text-sm text-ink hover:text-[#1976F3] transition truncate block"
                      >
                        {app.name}
                      </Link>
                      <div className="flex items-center gap-2 text-[11px] text-mut mt-0.5">
                        <span>{app.size}</span>
                        <span>•</span>
                        <span>Downloaded {timeText}</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/app/${app.slug}`}
                    className="shrink-0 px-3.5 py-1.5 rounded-full bg-[#16A765]/10 hover:bg-[#16A765] hover:text-white text-xs font-bold text-[#16A765] transition border border-[#16A765]/20"
                  >
                    View Details
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4 bg-card rounded-3xl border border-line">
              <Download className="w-12 h-12 text-line mx-auto mb-3" />
              <h3 className="text-lg font-bold text-ink">No APK downloads yet</h3>
              <p className="text-xs text-mut mt-1 max-w-sm mx-auto">
                Android APKs downloaded from AppMintly will appear in this local history ledger.
              </p>
              <Link
                href="/explore?type=Android+APK"
                className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition"
              >
                <span>Browse APKs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
