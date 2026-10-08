'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Download,
  ExternalLink,
  Sparkles,
  Smartphone,
  Gamepad2,
  Wrench,
  Bookmark,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { AppItem, AppType, isNewApp } from '@/data/apps';
import { useToast } from '@/lib/ToastContext';
import { AppIcon } from '@/components/AppIcon';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { resolveDeveloper } from '@/data/publishers';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import { apiUrl } from '@/lib/api-path';
import {
  useLocalFavorite,
  useIsStandalone,
  toggleLocalFavorite,
  trackAppOpened,
  trackAppDownloaded
} from '@/lib/localLibrary';

interface AppCardProps {
  app: AppItem;
  variant?: 'grid' | 'compact' | 'featured' | 'explore';
}

export const AppCard: React.FC<AppCardProps> = ({ app, variant = 'grid' }) => {
  const { toast } = useToast();
  const hasReleasedApk = hasAuthoritativeApkRelease(app);
  const favorite = useLocalFavorite(app.id);
  const isInstalledLocally = useIsStandalone();
  const [downloadedState, setDownloadedState] = useState(false);

  // Compact, truthful metadata for the card footer (Phase 16.2 hierarchy).
  const sizeLabel = app.apk?.fileSizeBytes
    ? `${Math.round(app.apk.fileSizeBytes / 1024)} KB`
    : app.size || '';
  const stateLabel = app.type === 'Android APK' ? 'APK Package' : 'Installable App';

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isNowFav = toggleLocalFavorite(app.id);
    toast(
      isNowFav ? `Saved ${app.name} to Library` : `Removed ${app.name} from Library`,
      'info'
    );
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. Android APK: ONLY when a real authoritative release exists
    if (hasReleasedApk) {
      const apkUrl = app.apk?.apkUrl || app.apkUrl;
      if (apkUrl || app.apk?.fileName) {
        trackAppDownloaded(app.id);

        // 1. Preferred mechanism: plain browser navigation to the verified
        //    public GitHub Release asset. GitHub serves the exact verified
        //    binary with Content-Disposition: attachment, so Android
        //    Chrome's native download manager performs and finalizes the
        //    download itself. No fetch/blob interception on this path.
        if (apkUrl) {
          const link = document.createElement('a');
          link.href = apkUrl;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setDownloadedState(true);
          toast(`APK download started from the verified GitHub release asset. Finish it from the browser download notification, then install from Downloads.`, 'success');
          return;
        }

        (async () => {
          try {
            const fileName =
              app.apk?.fileName ||
              `${app.name.replace(/[^a-zA-Z0-9]/g, '') || 'App'}-${app.apk?.versionName || app.version}.apk`;

            // Fallback for deployments without a release URL: same-origin
            // fetch candidates (server route / static mirrors).
            const endpoints = [
              apiUrl(`/api/download-apk/${encodeURIComponent(fileName)}`),
              `/downloads/apks/${encodeURIComponent(fileName)}`,
              `/downloads/apks/${app.slug}-v${app.version}.apk`,
            ].filter(Boolean) as string[];

            let response: Response | null = null;
            for (const ep of endpoints) {
              try {
                const res = await fetch(ep);
                if (res.ok) {
                  response = res;
                  break;
                }
              } catch (ignored) {}
            }

            if (!response || !response.ok) {
              throw new Error('No verified APK download source could be reached from this page.');
            }

            const ct = response.headers.get('content-type') || '';
            if (ct.includes('text/html') || ct.includes('application/json')) {
              throw new Error('Server returned an authentication or cookie-check page instead of the APK binary.');
            }

            const arrayBuf = await response.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuf);
            if (uint8.length < 4 || uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
              throw new Error('Downloaded file is corrupted or not a valid Android APK binary.');
            }

            const blob = new Blob([arrayBuf], { type: 'application/vnd.android.package-archive' });
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);

            setDownloadedState(true);
            toast(`APK download started. Finish it from the browser download notification, then install from Downloads.`, 'success');
          } catch (err: any) {
            console.error('[AppCard] Download error:', err);
            toast(`APK download unavailable: ${err.message || 'No verified download source could be reached.'}`, 'error');
          }
        })();
      } else {
        toast('Direct APK download link is not configured.', 'error');
      }
      return;
    }

    // 2. Web App / Installable App / Game / Tool / Website
    // Same-context navigation (Phase 10.11): pushes the destination onto
    // this tab's history so Back returns to AppMintly (no new tab).
    const targetUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
    if (targetUrl) {
      trackAppOpened(app.id);
      window.location.assign(targetUrl);
      toast(`Opening ${app.name}...`, 'info');
    } else {
      toast('Application address is not configured.', 'error');
    }
  };

  // Public App Store Badges: Prioritize APP / GAME / TOOL (DO NOT show PWA as main public badge)
  const getPublicBadge = () => {
    if (app.type === 'Web Game' || app.type === 'Game') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#E52B32]/10 text-[#E52B32] border border-[#E52B32]/25">
          <Gamepad2 className="w-3 h-3" /> GAME
        </span>
      );
    }
    if (app.type === 'Tool') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#F7B928]/20 text-[#8C6000] border border-[#F7B928]/35">
          <Wrench className="w-3 h-3" /> TOOL
        </span>
      );
    }
    if (app.type === 'Android APK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#16A765]/10 text-[#16A765] border border-[#16A765]/25">
          <Smartphone className="w-3 h-3" /> APK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#1976F3]/10 text-[#1976F3] border border-[#1976F3]/25">
        <Layers className="w-3 h-3" /> APP
      </span>
    );
  };

  // Primary CTA label (Phase 10.9 distribution model):
  //   real authoritative APK release -> Get App (APK download)
  //   Web App / PWA / Tool / Website   -> Open on Web
  //   Game                             -> Play
  // No special-casing for individual apps: the release evidence in the
  // canonical record decides, nothing else.
  const getActionLabel = () => {
    if (hasReleasedApk) {
      return downloadedState ? 'Download started' : 'Get App';
    }
    if (isInstalledLocally) {
      return 'Open';
    }
    if (app.type === 'Web Game' || app.type === 'Game') {
      return 'Play';
    }
    return 'Open on Web';
  };

  const getActionIcon = () => {
    if (hasReleasedApk) {
      return downloadedState ? (
        <Check className="w-3.5 h-3.5 text-[#16A765]" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      );
    }
    return <ExternalLink className="w-3.5 h-3.5" />;
  };

  // Compact variant (used in lists and sidebars)
  if (variant === 'compact') {
    return (
      <Link
        href={`/app/${app.slug}`}
        className="group flex items-center justify-between p-3 rounded-2xl bg-card border border-line hover:border-ink/35 hover:shadow-xs transition-all duration-200"
      >
        <div className="flex items-center gap-3 min-w-0">
          <AppIcon
            src={app.icon}
            name={app.name}
            size="sm"
            themeColor={app.themeColor}
            category={app.category}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="font-semibold text-sm text-ink truncate group-hover:text-[#1976F3] transition-colors">
                {app.name}
              </h4>
              {isNewApp(app) && (
                <span className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#16A765]/20 text-[#16A765]">
                  NEW
                </span>
              )}
              {app.original && (
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#F7B928]" title="AppMintly Original" />
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-mut mt-0.5">
              <span>{app.category}</span>
              <span>•</span>
              <span>v{app.version}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleActionClick}
          className="btn-cta shrink-0 ml-2 px-3.5 py-2 rounded-full text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
        >
          {getActionLabel()}
        </button>
      </Link>
    );
  }

  // Explore variant (Phase 16.11 Explore Experience 2.0).
  // Premium editorial card used ONLY on the Explore page: at most two
  // data-driven badges (platform/type stays metadata text, not a badge),
  // a larger icon, a tighter hierarchy, and the exact same battle-tested
  // bookmark + Get App download behavior as every other variant.
  if (variant === 'explore') {
    const dev = resolveDeveloper(app);

    // Badge reduction: strictly data-driven, max two prominent badges.
    const exploreBadges: React.ReactNode[] = [];
    if (isNewApp(app)) {
      exploreBadges.push(
        <span
          key="new"
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-cta/12 text-cta border border-cta/25"
        >
          New
        </span>
      );
    }
    if (app.original) {
      exploreBadges.push(
        <span
          key="original"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#F7B928]/15 text-[#8C6000] dark:text-[#F7B928] border border-[#F7B928]/30"
        >
          <Sparkles className="w-3 h-3 text-[#F7B928]" aria-hidden="true" />
          Original
        </span>
      );
    }
    if (app.featured) {
      exploreBadges.push(
        <span
          key="featured"
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border border-line text-mut"
        >
          Featured
        </span>
      );
    }

    return (
      <div className="group relative flex flex-col h-full p-4 sm:p-5 rounded-2xl bg-card border border-line card-accent">
        {/* Badges (max 2) + Library bookmark (44px touch target) */}
        <div className="flex items-center justify-between gap-2 min-h-11 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {exploreBadges.slice(0, 2)}
          </div>
          <button
            onClick={handleFavoriteClick}
            className="flex h-11 w-11 items-center justify-center rounded-full text-mut hover:text-cta hover:bg-page transition shrink-0 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
            title={favorite ? 'Remove from Library' : 'Save to Library'}
            aria-label={favorite ? `Remove ${app.name} from Library` : `Save ${app.name} to Library`}
            aria-pressed={favorite}
          >
            <Bookmark
              key={`fav-${favorite}`}
              className={`w-4 h-4 ${favorite ? 'fill-cta text-cta' : ''} motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-150`}
            />
          </button>
        </div>

        {/* Identity: large app icon + name + publisher + category / format */}
        <Link
          href={`/app/${app.slug}`}
          className="flex items-start gap-3.5 sm:gap-4 mb-3 focus:outline-hidden"
        >
                    <div className="shrink-0 icon-shelf rounded-2xl p-1.5">
  <AppIcon
              src={app.icon}
              name={app.name}
              size="xl"
              themeColor={app.themeColor}
              category={app.category}
              className="motion-safe:group-hover:scale-[1.03] transition-transform duration-200"
            />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="text-base sm:text-lg font-semibold text-ink tracking-tight line-clamp-1 group-hover:text-cta transition-colors">
              {app.name}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-mut min-w-0">
              <span className="truncate">{dev.name}</span>
              {dev.verified && <VerifiedBadge size="xs" />}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-mut/90 uppercase tracking-wide">
              <span>{app.category}</span>
              <span aria-hidden="true" className="w-1 h-1 rounded-full bg-cta/70 shrink-0" />
              <span>{app.type}</span>
            </p>
          </div>
        </Link>

        {/* Two-line clamped description keeps card heights consistent */}
        <p className="text-xs sm:text-[13px] text-mut line-clamp-2 leading-relaxed flex-1 mb-3">
          {app.shortDescription || app.description}
        </p>

        {/* Editorial footer: version · size + emerald Get App CTA */}
        <div className="pt-3.5 border-t border-line/60 flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-mut truncate">
            v{app.version}{sizeLabel ? ` · ${sizeLabel}` : ''}
          </span>
          <button
            onClick={handleActionClick}
            className="btn-cta shrink-0 inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-xs font-bold cursor-pointer"
          >
            {getActionIcon()}
            <span>{getActionLabel()}</span>
          </button>
        </div>
      </div>
    );
  }

  // Standard Grid Card (Store Marketplace Feel)
  return (
    <div className="group relative flex flex-col justify-between h-full p-4 sm:p-5 rounded-2xl bg-card border border-line card-accent">
      {/* Identity first: icon, name, publisher — the app IS the card, badges are supporting metadata */}
      <Link href={`/app/${app.slug}`} className="flex items-start gap-3.5 mb-3 focus:outline-hidden">
                <div className="shrink-0 icon-shelf rounded-2xl p-1.5">
  <AppIcon
            src={app.icon}
            name={app.name}
            size="lg"
            themeColor={app.themeColor}
            category={app.category}
            className="group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base text-ink group-hover:text-[#1976F3] transition-colors line-clamp-1">
            {app.name}
          </h3>
          <p className="text-xs text-mut truncate mt-0.5 flex items-center gap-1">
            <span className="truncate">{resolveDeveloper(app).name}</span>
            {resolveDeveloper(app).verified && <VerifiedBadge size="xs" />}
          </p>
        </div>
      </Link>      {/* Supporting metadata row: platform/status badges + Library save (44px target) */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Badge discipline: platform badge + at most ONE status badge —
              matches the Explore variant's cap so cards never look noisy. */}
          {getPublicBadge()}
          {(isNewApp(app) ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30">
              NEW
            </span>
          ) : app.original ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F7B928]/20 text-[#8C6000] border border-[#F7B928]/40">
              <Sparkles className="w-3 h-3 text-[#F7B928]" /> Original
            </span>
          ) : app.featured ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E52B32]/10 text-[#E52B32] border border-[#E52B32]/25">
              Featured
            </span>
          ) : null)}
        </div>

        <button
          onClick={handleFavoriteClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-mut hover:text-[#E52B32] hover:bg-page transition shrink-0 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E52B32]/50"
          title={favorite ? 'Remove from Library' : 'Save to Library'}
          aria-label={favorite ? `Remove ${app.name} from Library` : `Save ${app.name} to Library`}
          aria-pressed={favorite}
        >
          <Bookmark
            key={`fav-${favorite}`}
            className={`w-4 h-4 ${favorite ? 'fill-[#E52B32] text-[#E52B32]' : ''} motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-150`}
          />
        </button>
      </div>

      {/* Short Description */}
      <p className="text-xs text-mut line-clamp-2 mb-3 leading-relaxed flex-1">
        {app.shortDescription || app.description}
      </p>

      {/* Action Footer — VERSION • SIZE / CATEGORY • STATE then Get App CTA */}
      <div className="pt-3 border-t border-line/60 flex items-center justify-between gap-2">
        <div className="min-w-0 text-left">
          <span className="block text-[11px] font-semibold text-ink/80 truncate">
            v{app.version}{sizeLabel ? ` • ${sizeLabel}` : ''}
          </span>
          <span className="block text-[10px] text-mut truncate">
            {app.category} • {stateLabel}
          </span>
        </div>

        <button
          onClick={handleActionClick}
          className="btn-cta shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold cursor-pointer"
        >
          {getActionIcon()}
          <span>{getActionLabel()}</span>
        </button>
      </div>
    </div>
  );
};
