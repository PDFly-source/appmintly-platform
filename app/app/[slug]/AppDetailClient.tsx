'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  ExternalLink,
  Bookmark,
  Share2,
  Sparkles,
  Smartphone,
  Gamepad2,
  Wrench,
  CheckCircle2,
  Calendar,
  ArrowLeft,
  Tag,
  Info,
  Maximize2,
  X,
  HelpCircle,
  ShieldCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Monitor
} from 'lucide-react';
import { APPS, AppItem } from '@/data/apps';
import { useCatalog } from '@/lib/CatalogContext';
import { useToast } from '@/lib/ToastContext';
import { AppIcon } from '@/components/AppIcon';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { resolveDeveloper } from '@/data/publishers';
import { AppCard } from '@/components/AppCard';
import { ApkInstallSheet } from '@/components/ApkInstallSheet';
import {
  useLocalFavorite,
  useIsStandalone,
  toggleLocalFavorite,
  trackAppOpened,
  trackAppDownloaded
} from '@/lib/localLibrary';

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { getAppBySlug, catalog, publishedApps } = useCatalog();

  const slug = (params?.slug as string || '').toLowerCase().trim();
  const app = getAppBySlug(slug) || APPS.find((a) => a.slug.toLowerCase() === slug || a.id.toLowerCase() === slug);

  const favorite = useLocalFavorite(app?.id || '');
  const isStandalone = useIsStandalone();
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState<number | null>(null);
  const [showPwaInstallGuide, setShowPwaInstallGuide] = useState(false);
  const [showApkInstallSheet, setShowApkInstallSheet] = useState(false);
  const [isAppInstalledEvent, setIsAppInstalledEvent] = useState(false);
  const isStandaloneInstalled = isStandalone || isAppInstalledEvent;
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Monitor standalone install state & capture beforeinstallprompt
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      const handleAppInstalled = () => {
        setIsAppInstalledEvent(true);
        setDeferredPrompt(null);
        toast(`${app?.name || 'Application'} installed successfully!`, 'success');
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      window.addEventListener('appinstalled', handleAppInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, [app?.name, toast]);

  if (!app) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#E52B32]/10 text-[#E52B32] flex items-center justify-center mx-auto mb-4">
          <Info className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-[#17191C]">Application Not Found</h1>
        <p className="text-sm text-[#6F6F6F] mt-2">
          The requested application is not present in the AppMintly content registry.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/explore"
            className="px-5 py-2.5 rounded-full bg-[#17191C] text-white text-xs font-bold hover:bg-[#E52B32] transition"
          >
            Explore Apps
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full bg-[#FFFDF8] border border-[#E8DED0] text-[#17191C] text-xs font-bold hover:bg-white transition"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Related apps from canonical published catalog
  const relatedApps = publishedApps.filter(
    (a) => a.id !== app.id && a.category.toLowerCase() === app.category.toLowerCase()
  ).slice(0, 3);

  const handleFavoriteClick = () => {
    const isNowFav = toggleLocalFavorite(app.id);
    toast(
      isNowFav ? `Saved ${app.name} to Library` : `Removed ${app.name} from Library`,
      'info'
    );
  };

  const handleShareClick = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `${app.name} on AppMintly`,
          text: app.shortDescription || app.description,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast('App link copied to clipboard!', 'success');
    }
  };

  const hasApk = !!(
    app.apk?.enabled ||
    app.apkUrl ||
    app.type === 'Android APK' ||
    app.slug === 'studyria' ||
    app.slug === 'pdfminifly'
  );

  // Smart Get App CTA Logic: Prioritizes Android APK generation/download
  const handleGetApp = () => {
    // 1. Android APK available (Studyria, PDFMiniFly, or built apps)
    if (hasApk) {
      trackAppDownloaded(app.id);
      setShowApkInstallSheet(true);
      return;
    }

    // 2. Installable Web App / PWA / Website / Tool fallback
    const targetUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
    if (!targetUrl) {
      toast('Application address is not configured.', 'error');
      return;
    }

    trackAppOpened(app.id);

    // If native prompt is available on current scope, trigger it
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult: any) => {
          if (choiceResult.outcome === 'accepted') {
            toast('Installation initiated!', 'success');
          }
          setDeferredPrompt(null);
        });
        return;
      } catch (err) {
        console.error('Error invoking beforeinstallprompt', err);
      }
    }

    // Open destination app in new window / tab
    window.open(targetUrl, '_blank', 'noopener,noreferrer');

    // Show install guide if applicable
    if ((app.type === 'PWA' || app.pwa?.installable) && !isStandaloneInstalled) {
      setShowPwaInstallGuide(true);
      toast(`Opening ${app.name}. Tap Install or Add to Home Screen in your browser.`, 'info');
    } else {
      toast(`Opening ${app.name}...`, 'info');
    }
  };

  const handleOpenDirect = () => {
    const targetUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
    if (targetUrl) {
      trackAppOpened(app.id);
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      toast(`Opening ${app.name}...`, 'info');
    }
  };

  // Public category & type badges (App Store feel)
  const getPublicTypeBadge = () => {
    if (app.type === 'Web Game') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#E52B32]/10 text-[#E52B32] border border-[#E52B32]/25">
          <Gamepad2 className="w-3.5 h-3.5" /> GAME
        </span>
      );
    }
    if (app.type === 'Tool') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#F7B928]/20 text-[#8C6000] border border-[#F7B928]/35">
          <Wrench className="w-3.5 h-3.5" /> TOOL
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#1976F3]/10 text-[#1976F3] border border-[#1976F3]/25">
        <Layers className="w-3.5 h-3.5" /> APP
      </span>
    );
  };

  const getPrimaryCtaText = () => {
    if (hasApk) {
      return 'Get App';
    }
    if (isStandaloneInstalled) {
      return 'Open App';
    }
    if (app.type === 'Web Game' || app.type === 'Game') {
      return 'Play Now';
    }
    if (app.type === 'Tool') {
      return 'Open Tool';
    }
    return 'Open App';
  };

  const validScreenshots = app.screenshots && app.screenshots.length > 0
    ? app.screenshots.filter((s) => !s.includes('unsplash.com'))
    : [];

  return (
    <div className="min-h-screen bg-[#F8F2E7] text-[#17191C] pb-24 sm:pb-16">
      {/* Navigation breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6F6F6F] hover:text-[#17191C] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Marketplace</span>
        </button>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
        {/* 1. TOP HERO SECTION (App Store Style) */}
        <section className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-10 shadow-xs relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-start gap-6 lg:gap-8">
            {/* App Icon */}
            <AppIcon
              src={app.icon}
              name={app.name}
              size="2xl"
              themeColor={app.themeColor}
              category={app.category}
              className="shadow-md mx-auto md:mx-0 shrink-0"
            />

            {/* App Header Info */}
            <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
              <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                {getPublicTypeBadge()}
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#F8F2E7] text-[#17191C] border border-[#E8DED0]">
                  {app.category}
                </span>
                {app.original && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-[#F7B928]/20 text-[#8C6000] border border-[#F7B928]/40">
                    <Sparkles className="w-3.5 h-3.5 text-[#F7B928]" /> Original
                  </span>
                )}
                {isStandaloneInstalled && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#16A765]/15 text-[#16A765] border border-[#16A765]/30">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Installed on device
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#17191C] tracking-tight">
                  {app.name}
                </h1>
                <p className="text-sm sm:text-base font-semibold text-[#6F6F6F] mt-1 flex items-center gap-1.5">
                  <span>{resolveDeveloper(app).name}</span>
                  {resolveDeveloper(app).verified && <VerifiedBadge size="sm" withLabel />}
                </p>
              </div>

              <p className="text-sm sm:text-base text-[#17191C]/80 max-w-2xl leading-relaxed pt-1">
                {app.shortDescription || app.description}
              </p>

              {/* Version & Metadata Row */}
              <div className="flex items-center justify-center md:justify-start gap-4 text-xs font-semibold text-[#6F6F6F] pt-1 flex-wrap">
                <span className="bg-[#F8F2E7] px-2.5 py-1 rounded-md border border-[#E8DED0]/80">
                  Version {app.version}
                </span>
                <span>•</span>
                <span>{app.type === 'Android APK' ? (app.size || 'APK Package') : 'Installable App'}</span>
                <span>•</span>
                <span>Updated {app.lastUpdated || app.releaseDate}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center md:justify-start gap-3 pt-4 flex-wrap">
                <button
                  onClick={handleGetApp}
                  className="px-8 py-3.5 rounded-full bg-[#17191C] hover:bg-[#16A765] text-white text-sm font-black shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{getPrimaryCtaText()}</span>
                </button>

                {(app.webUrl || app.pwaUrl || app.url || app.launchUrl) && (
                  <button
                    onClick={handleOpenDirect}
                    className="px-6 py-3.5 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] text-sm font-bold border border-[#E8DED0] transition flex items-center gap-1.5 cursor-pointer"
                    title="Launch app directly in new browser tab"
                  >
                    <span>Open on Web</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={handleFavoriteClick}
                  className="p-3.5 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] border border-[#E8DED0] transition cursor-pointer"
                  title={favorite ? 'Remove from Library' : 'Save to Library'}
                  aria-label="Save to Library"
                >
                  <Bookmark
                    className={`w-4 h-4 ${favorite ? 'fill-[#E52B32] text-[#E52B32]' : ''}`}
                  />
                </button>

                <button
                  onClick={handleShareClick}
                  className="p-3.5 rounded-full bg-[#F8F2E7] hover:bg-[#E8DED0] text-[#17191C] border border-[#E8DED0] transition cursor-pointer"
                  title="Share App"
                  aria-label="Share App"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>

              {/* Verified Android APK Distribution Specs */}
              {hasApk && (
                <div className="pt-2">
                  <div className="p-3 rounded-2xl bg-[#16A765]/10 border border-[#16A765]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#16A765] shrink-0" />
                      <div>
                        <span className="font-extrabold text-[#17191C]">
                          Verified Android APK Package
                        </span>
                        <span className="text-[#6F6F6F] ml-2 font-mono text-[11px]">
                          {app.apk?.packageId || `com.appmintly.${app.slug}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-[#6F6F6F]">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-[#16A765]/30 text-[#16A765]">
                        v{app.version} ({app.apk?.versionCode || 20000})
                      </span>
                      <span>•</span>
                      <span>{app.size || (app.apk?.fileSizeBytes ? `${(app.apk.fileSizeBytes / 1024).toFixed(0)} KB` : '102 KB')}</span>
                      <span>•</span>
                      <span className="text-[#16A765] font-bold">Signed (v1+v2+v3)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 2. SCREENSHOTS GALLERY (App Store Style) */}
        {validScreenshots.length > 0 && (
          <section className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[#17191C]">Screenshots &amp; Preview</h2>
              <span className="text-xs text-[#6F6F6F] font-semibold">
                Tap image to view full screen
              </span>
            </div>

            {/* Mobile horizontal carousel / Desktop scroll rail */}
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
              {validScreenshots.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedScreenshotIndex(idx)}
                  className="shrink-0 snap-start rounded-2xl overflow-hidden border border-[#E8DED0] bg-[#17191C] shadow-2xs hover:shadow-md hover:border-[#17191C]/40 transition-all cursor-pointer group relative max-w-[320px] sm:max-w-[420px]"
                >
                  <img
                    src={url}
                    alt={`${app.name} preview ${idx + 1}`}
                    className="w-full h-56 sm:h-64 object-contain group-hover:scale-102 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="p-2 rounded-full bg-white/90 text-[#17191C] shadow-md">
                      <Maximize2 className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. ABOUT THIS APP & KEY FEATURES */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Description */}
          <section className="lg:col-span-8 bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-xl font-black text-[#17191C] mb-3">About this app</h2>
              <p className="text-sm sm:text-base text-[#17191C]/85 leading-relaxed whitespace-pre-line">
                {app.description}
              </p>
            </div>

            {/* Features Checklist */}
            {app.features && app.features.length > 0 && (
              <div className="border-t border-[#E8DED0] pt-6">
                <h3 className="text-base font-black text-[#17191C] mb-3">Key Features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {app.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#F8F2E7]/70 border border-[#E8DED0]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#16A765] shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm font-semibold text-[#17191C]">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What's New / Release Notes */}
            {app.releaseNotes && app.releaseNotes.length > 0 && (
              <div className="border-t border-[#E8DED0] pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-black text-[#17191C]">
                    What’s New in Version {app.version}
                  </h3>
                  <span className="text-xs font-semibold text-[#6F6F6F]">
                    {app.lastUpdated || app.releaseDate}
                  </span>
                </div>
                <ul className="space-y-2 text-xs sm:text-sm text-[#17191C]/85">
                  {app.releaseNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#1976F3] font-bold">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Sidebar: App Information (App Store Specs) */}
          <section className="lg:col-span-4 space-y-6">
            <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
              <h2 className="text-base font-black text-[#17191C] border-b border-[#E8DED0] pb-3">
                App Information
              </h2>

              <dl className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Developer</dt>
                  <dd className="font-semibold text-[#17191C] text-right flex items-center justify-end gap-1">
                    {resolveDeveloper(app).name}
                    {resolveDeveloper(app).verified && <VerifiedBadge size="xs" />}
                  </dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Category</dt>
                  <dd className="font-semibold text-[#17191C]">{app.category}</dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Latest Version</dt>
                  <dd className="font-mono font-bold text-[#17191C]">v{app.version}</dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Platform</dt>
                  <dd className="font-semibold text-[#17191C]">
                    {app.type === 'Android APK' ? 'Android Device' : 'Web & Desktop'}
                  </dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Installation</dt>
                  <dd className="font-semibold text-[#16A765]">
                    {app.type === 'Android APK'
                      ? 'Android Package (.apk)'
                      : app.type === 'PWA'
                      ? 'Direct PWA Install'
                      : 'Browser Runtime'}
                  </dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Last Updated</dt>
                  <dd className="font-semibold text-[#17191C]">{app.lastUpdated || app.releaseDate}</dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-[#6F6F6F] font-bold">Privacy &amp; Data</dt>
                  <dd className="font-semibold text-[#16A765]">No Cloud Tracking</dd>
                </div>
              </dl>

              {/* Technical Lifecycle Notice */}
              <div className="p-3.5 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] text-[11px] text-[#6F6F6F] leading-relaxed">
                <p className="font-bold text-[#17191C] mb-1">Application Lifecycle</p>
                Updates to installed applications are delivered directly by the application itself via browser service worker cache refresh upon launch.
              </div>
            </div>

            {/* PWA Direct Installation Helper Button */}
            {app.type === 'PWA' && (
              <button
                onClick={() => setShowPwaInstallGuide(true)}
                className="w-full p-4 rounded-2xl bg-[#FFFDF8] hover:bg-white border border-[#E8DED0] text-left transition flex items-center justify-between group shadow-2xs cursor-pointer"
              >
                <div>
                  <h4 className="text-xs font-bold text-[#17191C] group-hover:text-[#1976F3] transition-colors">
                    How to install this app?
                  </h4>
                  <p className="text-[11px] text-[#6F6F6F]">
                    Step-by-step for Chrome, Edge &amp; Safari
                  </p>
                </div>
                <HelpCircle className="w-5 h-5 text-[#6F6F6F] group-hover:text-[#1976F3] transition-colors" />
              </button>
            )}
          </section>
        </div>

        {/* 4. MORE APPS IN CATEGORY */}
        {relatedApps.length > 0 && (
          <section className="space-y-4 pt-4">
            <h2 className="text-xl font-black text-[#17191C]">
              More in {app.category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedApps.map((rel) => (
                <AppCard key={rel.id} app={rel} variant="grid" />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 5. STICKY MOBILE BOTTOM ACTION BAR (App Store Feel) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF8]/95 backdrop-blur-md border-t border-[#E8DED0] p-3 sm:hidden shadow-lg flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppIcon
            src={app.icon}
            name={app.name}
            size="sm"
            themeColor={app.themeColor}
            category={app.category}
          />
          <div className="min-w-0">
            <h4 className="font-bold text-xs text-[#17191C] truncate">{app.name}</h4>
            <p className="text-[10px] text-[#6F6F6F] truncate">v{app.version} • {app.category}</p>
          </div>
        </div>

        <button
          onClick={handleGetApp}
          className="px-6 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-black shadow-md transition shrink-0 cursor-pointer"
        >
          {getPrimaryCtaText()}
        </button>
      </div>

      {/* 6. FULLSCREEN SCREENSHOT LIGHTBOX */}
      {selectedScreenshotIndex !== null && validScreenshots[selectedScreenshotIndex] && (
        <div
          onClick={() => setSelectedScreenshotIndex(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
        >
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <button
              onClick={() => setSelectedScreenshotIndex(null)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              aria-label="Close viewer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl max-h-[85vh] flex items-center justify-center"
          >
            <img
              src={validScreenshots[selectedScreenshotIndex]}
              alt={`${app.name} preview`}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />

            {validScreenshots.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setSelectedScreenshotIndex(
                      (prev) =>
                        (prev! - 1 + validScreenshots.length) % validScreenshots.length
                    )
                  }
                  className="absolute left-2 sm:-left-12 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition cursor-pointer"
                  aria-label="Previous screenshot"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={() =>
                    setSelectedScreenshotIndex(
                      (prev) => (prev! + 1) % validScreenshots.length
                    )
                  }
                  className="absolute right-2 sm:-right-12 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition cursor-pointer"
                  aria-label="Next screenshot"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Lightbox thumbnail rail */}
          {validScreenshots.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 mt-4 overflow-x-auto max-w-full px-2"
            >
              {validScreenshots.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedScreenshotIndex(idx)}
                  className={`w-14 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    idx === selectedScreenshotIndex
                      ? 'border-[#E52B32] scale-105'
                      : 'border-white/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. AUTHENTIC PWA INSTALLATION GUIDE MODAL */}
      {showPwaInstallGuide && (
        <div
          onClick={() => setShowPwaInstallGuide(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#FFFDF8] border border-[#E8DED0] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 space-y-5"
          >
            <div className="flex items-start justify-between border-b border-[#E8DED0] pb-3">
              <div className="flex items-center gap-3">
                <AppIcon
                  src={app.icon}
                  name={app.name}
                  size="md"
                  themeColor={app.themeColor}
                  category={app.category}
                />
                <div>
                  <h3 className="font-black text-lg text-[#17191C]">
                    Install {app.name}
                  </h3>
                  <p className="text-xs text-[#6F6F6F]">
                    Add directly to your device home screen or desktop
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPwaInstallGuide(false)}
                className="p-1 rounded-full hover:bg-[#F8F2E7] text-[#6F6F6F] hover:text-[#17191C] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#1976F3]/10 border border-[#1976F3]/25 space-y-1">
                <p className="font-bold text-[#1976F3] flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" /> Chrome / Edge (Desktop &amp; Android)
                </p>
                <p className="text-[#17191C]/80 leading-relaxed">
                  In the opened tab, look for the <strong>Install (⊕)</strong> icon on the right side of the address bar, or tap the browser menu (<strong>⋮</strong>) &rarr; <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#E52B32]/10 border border-[#E52B32]/25 space-y-1">
                <p className="font-bold text-[#E52B32] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Safari (iPhone &amp; iPad)
                </p>
                <p className="text-[#17191C]/80 leading-relaxed">
                  Tap the <strong>Share</strong> button (box with upward arrow <span className="font-mono">↑</span>) in Safari&apos;s bottom toolbar, scroll down, and select <strong>&quot;Add to Home Screen&quot;</strong> (⊞).
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-[#F8F2E7] border border-[#E8DED0] text-[11px] text-[#6F6F6F] leading-relaxed">
                <strong>Authentic Cross-Origin PWA:</strong> The installed application runs under its genuine domain (<code className="text-[#17191C] font-mono">{app.url}</code>) with its official manifest, icons, and offline storage. AppMintly does not wrap or alter the application.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8DED0]">
              <button
                onClick={() => setShowPwaInstallGuide(false)}
                className="px-5 py-2.5 rounded-full bg-[#17191C] text-white text-xs font-bold hover:bg-[#E52B32] transition cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. AUTHENTIC ANDROID APK INSTALL SHEET */}
      <ApkInstallSheet
        app={app}
        isOpen={showApkInstallSheet}
        onClose={() => setShowApkInstallSheet(false)}
        onOpenWeb={handleOpenDirect}
      />
    </div>
  );
}
