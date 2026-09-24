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
  variant?: 'grid' | 'compact' | 'featured';
}

export const AppCard: React.FC<AppCardProps> = ({ app, variant = 'grid' }) => {
  const { toast } = useToast();
  const favorite = useLocalFavorite(app.id);
  const isInstalledLocally = useIsStandalone();
  const [downloadedState, setDownloadedState] = useState(false);

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

    // 1. Android APK available or built
    if (app.apk?.enabled || app.type === 'Android APK') {
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
    const targetUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
    if (targetUrl) {
      trackAppOpened(app.id);
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      toast(`Opening ${app.name}...`, 'info');
    } else {
      toast('Application address is not configured.', 'error');
    }
  };

  // Public App Store Badges: Prioritize APP / GAME / TOOL (DO NOT show PWA as main public badge)
  const getPublicBadge = () => {
    if (app.type === 'Web Game' || app.type === 'Game') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#E52B32]/10 text-[#E52B32] border border-[#E52B32]/25">
          <Gamepad2 className="w-3 h-3" /> GAME
        </span>
      );
    }
    if (app.type === 'Tool') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#F7B928]/20 text-[#8C6000] border border-[#F7B928]/35">
          <Wrench className="w-3 h-3" /> TOOL
        </span>
      );
    }
    if (app.type === 'Android APK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#16A765]/10 text-[#16A765] border border-[#16A765]/25">
          <Smartphone className="w-3 h-3" /> APK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#1976F3]/10 text-[#1976F3] border border-[#1976F3]/25">
        <Layers className="w-3 h-3" /> APP
      </span>
    );
  };

  // Primary CTA label matching App Store expectations:
  // Web App: Open | PWA / installable: Get App | APK: Download | Game: Play | Website: Open
  // For Studyria: Get App -> https://studyria.qzz.io/
  const getActionLabel = () => {
    if (app.apk?.enabled || app.type === 'Android APK') {
      return downloadedState ? 'Download started' : 'Get App';
    }
    if (isInstalledLocally) {
      return 'Open';
    }
    if (app.slug === 'studyria' || app.id === 'studyria' || app.type === 'PWA' || (app.pwa && app.pwa.installable)) {
      return 'Get App';
    }
    if (app.type === 'Web Game' || app.type === 'Game') {
      return 'Play';
    }
    if (app.type === 'Web App') {
      return 'Open';
    }
    if (app.type === 'Website') {
      return 'Open';
    }
    if (app.type === 'Tool') {
      return 'Open';
    }
    return 'Open';
  };

  const getActionIcon = () => {
    if (app.apk?.enabled || app.type === 'Android APK') {
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
              <h4 className="font-bold text-sm text-ink truncate group-hover:text-[#1976F3] transition-colors">
                {app.name}
              </h4>
              {isNewApp(app) && (
                <span className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-black bg-[#16A765]/20 text-[#16A765]">
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
          className="shrink-0 ml-2 px-3 py-1.5 rounded-full bg-page hover:bg-inkbg hover:text-white text-xs font-bold text-ink border border-line transition-colors flex items-center gap-1 cursor-pointer"
        >
          {getActionLabel()}
        </button>
      </Link>
    );
  }

  // Standard Grid Card (Store Marketplace Feel)
  return (
    <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-card border border-line hover:border-ink/40 hover:shadow-md transition-all duration-300">
      {/* Top Header: Public Type Badge, New Badge & Library Save */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {getPublicBadge()}
          {isNewApp(app) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30">
              NEW
            </span>
          )}
          {app.original && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#F7B928]/20 text-[#8C6000] border border-[#F7B928]/40">
              <Sparkles className="w-3 h-3 text-[#F7B928]" /> Original
            </span>
          )}
          {app.featured && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E52B32]/10 text-[#E52B32] border border-[#E52B32]/25">
              Featured
            </span>
          )}
        </div>

        <button
          onClick={handleFavoriteClick}
          className="p-1.5 rounded-full text-mut hover:text-[#E52B32] hover:bg-page transition shrink-0 cursor-pointer"
          title={favorite ? 'Remove from Library' : 'Save to Library'}
          aria-label={favorite ? 'Remove from Library' : 'Save to Library'}
        >
          <Bookmark className={`w-4 h-4 ${favorite ? 'fill-[#E52B32] text-[#E52B32]' : ''}`} />
        </button>
      </div>

      {/* Main Body: App Icon, Title, Developer, Version */}
      <Link href={`/app/${app.slug}`} className="flex items-start gap-3.5 mb-3 focus:outline-hidden">
        <AppIcon
          src={app.icon}
          name={app.name}
          size="lg"
          themeColor={app.themeColor}
          category={app.category}
          className="group-hover:scale-105 transition-transform duration-300"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base text-ink group-hover:text-[#1976F3] transition-colors line-clamp-1">
            {app.name}
          </h3>
          <p className="text-xs text-mut truncate mt-0.5 flex items-center gap-1">
            <span className="truncate">{resolveDeveloper(app).name}</span>
            {resolveDeveloper(app).verified && <VerifiedBadge size="xs" />}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-mut">
            <span className="font-medium text-ink/80">v{app.version}</span>
            <span>•</span>
            <span>{app.category}</span>
          </div>
        </div>
      </Link>

      {/* Short Description */}
      <p className="text-xs text-mut line-clamp-2 mb-4 leading-relaxed flex-1">
        {app.shortDescription || app.description}
      </p>

      {/* Action Footer */}
      <div className="pt-3 border-t border-line/60 flex items-center justify-between gap-2">
        <span className="text-[11px] text-mut font-semibold">
          {app.type === 'Android APK' ? (app.size || 'APK Package') : 'Installable App'}
        </span>

        <button
          onClick={handleActionClick}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-inkbg hover:bg-[#E52B32] text-white text-xs font-bold shadow-xs transition-colors duration-200 cursor-pointer"
        >
          {getActionIcon()}
          <span>{getActionLabel()}</span>
        </button>
      </div>
    </div>
  );
};
