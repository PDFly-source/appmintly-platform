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
import { resolveAssetDisplayUrl } from '@/lib/screenshot-assets';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { resolveDeveloper } from '@/data/publishers';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import { QrCodeDialog } from '@/components/QrCodeDialog';
import { PrivacyTechCard } from '@/components/PrivacyTechCard';
import { ApkHashVerifier } from '@/components/ApkHashVerifier';
import { AppMediaPreview } from '@/components/AppMediaPreview';
import { QrCode as QrCodeIcon } from 'lucide-react';
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
  const [showQrDialog, setShowQrDialog] = useState(false);
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
        <h1 className="text-2xl font-black text-ink">Application Not Found</h1>
        <p className="text-sm text-mut mt-2">
          The requested application is not present in the AppMintly content registry.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/explore"
            className="px-5 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition"
          >
            Explore Apps
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full bg-card border border-line text-ink text-xs font-bold hover:bg-white transition"
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

  // Phase 10.9: Android APK distribution renders ONLY when the canonical
  // record carries real release evidence (verified release + sha256 +
  // downloadable asset) written by the production release pipeline. No
  // hardcoded app slugs, no fabricated stub-apk matching: a Web App without
  // a released APK is distributed as a web experience only.
  const hasApk = hasAuthoritativeApkRelease(app);

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
    return 'Open on Web';
  };

  // Real screenshots only (no stock photos). Canonical repository asset
  // paths are resolved against the Pages base path for display (Phase 10.8).
  const validScreenshots = app.screenshots && app.screenshots.length > 0
    ? app.screenshots
        .filter((s) => !s.includes('unsplash.com'))
        .map((s) => resolveAssetDisplayUrl(s))
    : [];

  return (
    <div className="min-h-screen bg-page text-ink pb-24 sm:pb-16">
      {/* Navigation breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-mut hover:text-ink transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Marketplace</span>
        </button>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
        {/* 1. TOP HERO SECTION (App Store Style) */}
        <section className="bg-card border border-line rounded-3xl p-6 sm:p-10 shadow-xs relative overflow-hidden">
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
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-page text-ink border border-line">
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
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-ink tracking-tight">
                  {app.name}
                </h1>
                <p className="text-sm sm:text-base font-semibold text-mut mt-1 flex items-center gap-1.5">
                  {resolveDeveloper(app).slug ? (
                    <Link
                      href={`/publisher/${resolveDeveloper(app).slug}`}
                      className="hover:text-[#1976F3] transition underline decoration-transparent hover:decoration-current underline-offset-2"
                    >
                      {resolveDeveloper(app).name}
                    </Link>
                  ) : (
                    <span>{resolveDeveloper(app).name}</span>
                  )}
                  {resolveDeveloper(app).verified && <VerifiedBadge size="sm" withLabel />}
                </p>
              </div>

              <p className="text-sm sm:text-base text-ink/80 max-w-2xl leading-relaxed pt-1">
                {app.shortDescription || app.description}
              </p>

              {/* Version & Metadata Row */}
              <div className="flex items-center justify-center md:justify-start gap-4 text-xs font-semibold text-mut pt-1 flex-wrap">
                <span className="bg-page px-2.5 py-1 rounded-md border border-line/80">
                  Version {app.version}
                </span>
                <span>•</span>
                <span>
                  {app.type === 'Android APK'
                    ? app.size || 'APK Package'
                    : hasApk
                    ? `${app.type} + Android APK`
                    : app.type}
                </span>
                <span>•</span>
                <span>Updated {app.lastUpdated || app.releaseDate}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center md:justify-start gap-3 pt-4 flex-wrap">
                <button
                  onClick={handleGetApp}
                  className="btn-cta px-8 py-3.5 rounded-full text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{getPrimaryCtaText()}</span>
                </button>

                {hasApk && (app.webUrl || app.pwaUrl || app.url || app.launchUrl) && (
                  <button
                    onClick={handleOpenDirect}
                    className="px-6 py-3.5 rounded-full bg-page hover:bg-line text-ink text-sm font-bold border border-line transition flex items-center gap-1.5 cursor-pointer"
                    title="Launch app directly in new browser tab"
                  >
                    <span>Open on Web</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={handleFavoriteClick}
                  className="p-3.5 rounded-full bg-page hover:bg-line text-ink border border-line transition cursor-pointer"
                  title={favorite ? 'Remove from Library' : 'Save to Library'}
                  aria-label="Save to Library"
                >
                  <Bookmark
                    className={`w-4 h-4 ${favorite ? 'fill-[#E52B32] text-[#E52B32]' : ''}`}
                  />
                </button>

                <button
                  onClick={handleShareClick}
                  className="p-3.5 rounded-full bg-page hover:bg-line text-ink border border-line transition cursor-pointer"
                  title="Share App"
                  aria-label="Share App"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowQrDialog(true)}
                  className="p-3.5 rounded-full bg-page hover:bg-line text-ink border border-line transition cursor-pointer"
                  title="Share via QR code"
                  aria-label="Share via QR code"
                >
                  <QrCodeIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Verified Android APK Distribution Specs */}
              {hasApk && (
                <div className="pt-2">
                  <div className="p-3 rounded-2xl bg-[#16A765]/10 border border-[#16A765]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#16A765] shrink-0" />
                      <div>
                        <span className="font-extrabold text-ink">
                          Verified Android APK Package
                        </span>
                        {app.apk?.packageId && (
                          <span className="text-mut ml-2 font-mono text-[11px]">
                            {app.apk.packageId}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-mut">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-[#16A765]/30 text-[#16A765]">
                        v{app.version}{app.apk?.versionCode ? ` (${app.apk.versionCode})` : ''}
                      </span>
                      <span>•</span>
                      <span>
                        {app.apk?.fileSizeBytes
                          ? `${(app.apk.fileSizeBytes / 1024).toFixed(0)} KB`
                          : app.size || 'Size not published'}
                      </span>
                      <span>•</span>
                      {app.apk?.sha256 && (
                        <span className="text-[#16A765] font-bold">Signed &amp; Verified</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 2. SCREENSHOTS GALLERY + optional looped preview media */}
        {(validScreenshots.length > 0 || app.previewMedia) && (
          <section className="bg-card border border-line rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-ink">Screenshots &amp; Preview</h2>
              <span className="text-xs text-mut font-semibold">
                Tap image to view full screen
              </span>
            </div>

            {/* Optional looped muted preview video/GIF (Phase 11) — falls back
                to its poster/screenshot if the media fails to load */}
            {app.previewMedia && (
              <div className="max-w-[320px] sm:max-w-[420px]">
                <AppMediaPreview app={app} />
              </div>
            )}

            {/* Mobile horizontal carousel / Desktop scroll rail */}
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
              {validScreenshots.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedScreenshotIndex(idx)}
                  className="shrink-0 snap-start rounded-2xl overflow-hidden border border-line bg-inkbg shadow-2xs hover:shadow-md hover:border-ink/40 transition-all cursor-pointer group relative max-w-[320px] sm:max-w-[420px]"
                >
                  <img
                    src={url}
                    alt={`${app.name} preview ${idx + 1}`}
                    className="w-full h-56 sm:h-64 object-contain group-hover:scale-102 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="p-2 rounded-full bg-white/90 text-ink shadow-md">
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
          <section className="lg:col-span-8 bg-card border border-line rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-xl font-black text-ink mb-3">About this app</h2>
              <p className="text-sm sm:text-base text-ink/85 leading-relaxed whitespace-pre-line">
                {app.description}
              </p>
            </div>

            {/* Features Checklist */}
            {app.features && app.features.length > 0 && (
              <div className="border-t border-line pt-6">
                <h3 className="text-base font-black text-ink mb-3">Key Features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {app.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-3 rounded-2xl bg-page/70 border border-line"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#16A765] shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm font-semibold text-ink">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What's New / Release Notes */}
            {app.releaseNotes && app.releaseNotes.length > 0 && (
              <div className="border-t border-line pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-black text-ink">
                    What’s New in Version {app.version}
                  </h3>
                  <span className="text-xs font-semibold text-mut">
                    {app.lastUpdated || app.releaseDate}
                  </span>
                </div>
                <ul className="space-y-2 text-xs sm:text-sm text-ink/85">
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
            <div className="bg-card border border-line rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
              <h2 className="text-base font-black text-ink border-b border-line pb-3">
                App Information
              </h2>

              <dl className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Developer</dt>
                  <dd className="font-semibold text-ink text-right flex items-center justify-end gap-1">
                    {resolveDeveloper(app).slug ? (
                      <Link
                        href={`/publisher/${resolveDeveloper(app).slug}`}
                        className="hover:text-[#1976F3] transition underline decoration-transparent hover:decoration-current underline-offset-2"
                      >
                        {resolveDeveloper(app).name}
                      </Link>
                    ) : (
                      <span>{resolveDeveloper(app).name}</span>
                    )}
                    {resolveDeveloper(app).verified && <VerifiedBadge size="xs" />}
                  </dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Category</dt>
                  <dd className="font-semibold text-ink">{app.category}</dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Latest Version</dt>
                  <dd className="font-mono font-bold text-ink">v{app.version}</dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Platform</dt>
                  <dd className="font-semibold text-ink">
                    {app.type === 'Android APK' ? 'Android Device' : 'Web & Desktop'}
                  </dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Installation</dt>
                  <dd className="font-semibold text-[#16A765]">
                    {app.type === 'Android APK'
                      ? 'Android Package (.apk)'
                      : app.type === 'PWA'
                      ? 'Direct PWA Install'
                      : 'Browser Runtime'}
                  </dd>
                </div>

                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Last Updated</dt>
                  <dd className="font-semibold text-ink">{app.lastUpdated || app.releaseDate}</dd>
                </div>

                {app.apk?.sha256 && (
                  <div className="pt-1">
                    <dt className="text-mut font-bold mb-1">SHA-256 Checksum</dt>
                    <dd className="flex items-center gap-1.5">
                      <code className="font-mono text-[10px] leading-tight break-all bg-page border border-line rounded-lg px-2 py-1.5 text-ink flex-1">
                        {app.apk.sha256}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(app.apk!.sha256!);
                          toast('SHA-256 checksum copied', 'success');
                        }}
                        aria-label="Copy SHA-256 checksum"
                        className="shrink-0 px-2 py-1.5 rounded-lg bg-inkbg text-white text-[10px] font-bold hover:bg-[#E52B32] transition cursor-pointer"
                      >
                        Copy
                      </button>
                    </dd>
                  </div>
                )}

                {hasApk && app.apk?.versionCode ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-mut font-bold">Version Code</dt>
                    <dd className="font-mono font-semibold text-ink">{app.apk.versionCode}</dd>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <dt className="text-mut font-bold">Privacy &amp; Data</dt>
                  <dd className="font-semibold text-[#16A765]">No Cloud Tracking</dd>
                </div>
              </dl>

              {/* Technical Lifecycle Notice */}
              <div className="p-3.5 rounded-2xl bg-page border border-line text-[11px] text-mut leading-relaxed">
                <p className="font-bold text-ink mb-1">Application Lifecycle</p>
                Updates to installed applications are delivered directly by the application itself via browser service worker cache refresh upon launch.
              </div>
            </div>

            {/* APK Installation Instructions (truthful, static guidance) */}
            {app.apk?.enabled && (
              <div className="w-full p-4 rounded-2xl bg-card border border-line shadow-2xs">
                <h4 className="text-xs font-bold text-ink mb-2 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-[#1976F3]" />
                  How to install this APK on Android
                </h4>
                <ol className="text-[11px] text-mut leading-relaxed list-decimal list-inside space-y-1">
                  <li>Tap <strong className="text-ink">Get App / Download APK</strong> — your browser downloads the file directly from the official GitHub release.</li>
                  <li>When the download finishes, open it from the notification or your Downloads folder.</li>
                  <li>If asked, allow installs from this source (Android: <em>Settings → Apps → Special access → Install unknown apps</em>).</li>
                  <li>Confirm the install and open the app. The package is signed; you can verify it against the SHA-256 checksum listed above.</li>
                </ol>
              </div>
            )}

            {/* PWA Direct Installation Helper Button */}
            {app.type === 'PWA' && (
              <button
                onClick={() => setShowPwaInstallGuide(true)}
                className="w-full p-4 rounded-2xl bg-card hover:bg-white border border-line text-left transition flex items-center justify-between group shadow-2xs cursor-pointer"
              >
                <div>
                  <h4 className="text-xs font-bold text-ink group-hover:text-[#1976F3] transition-colors">
                    How to install this app?
                  </h4>
                  <p className="text-[11px] text-mut">
                    Step-by-step for Chrome, Edge &amp; Safari
                  </p>
                </div>
                <HelpCircle className="w-5 h-5 text-mut group-hover:text-[#1976F3] transition-colors" />
              </button>
            )}

            {/* Phase 11: evidence-based Privacy & Technology scorecard */}
            <PrivacyTechCard app={app} />

            {/* Phase 11: browser-side APK integrity verification */}
            {hasApk && <ApkHashVerifier app={app} />}
          </section>
        </div>

        {/* 4. MORE APPS IN CATEGORY */}
        {relatedApps.length > 0 && (
          <section className="space-y-4 pt-4">
            <h2 className="text-xl font-black text-ink">
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
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-line p-3 sm:hidden shadow-lg flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppIcon
            src={app.icon}
            name={app.name}
            size="sm"
            themeColor={app.themeColor}
            category={app.category}
          />
          <div className="min-w-0">
            <h4 className="font-bold text-xs text-ink truncate">{app.name}</h4>
            <p className="text-[10px] text-mut truncate">v{app.version} • {app.category}</p>
          </div>
        </div>

        <button
          onClick={handleGetApp}
          className="btn-cta px-6 py-2.5 rounded-full text-white text-xs font-black shrink-0 cursor-pointer"
        >
          {getPrimaryCtaText()}
        </button>
      </div>

      {/* 6. FULLSCREEN SCREENSHOT LIGHTBOX */}
      {showQrDialog && (
        <QrCodeDialog app={app} onClose={() => setShowQrDialog(false)} toast={toast} />
      )}

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
            className="bg-card border border-line rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 space-y-5"
          >
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div className="flex items-center gap-3">
                <AppIcon
                  src={app.icon}
                  name={app.name}
                  size="md"
                  themeColor={app.themeColor}
                  category={app.category}
                />
                <div>
                  <h3 className="font-black text-lg text-ink">
                    Install {app.name}
                  </h3>
                  <p className="text-xs text-mut">
                    Add directly to your device home screen or desktop
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPwaInstallGuide(false)}
                className="p-1 rounded-full hover:bg-page text-mut hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#1976F3]/10 border border-[#1976F3]/25 space-y-1">
                <p className="font-bold text-[#1976F3] flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" /> Chrome / Edge (Desktop &amp; Android)
                </p>
                <p className="text-ink/80 leading-relaxed">
                  In the opened tab, look for the <strong>Install (⊕)</strong> icon on the right side of the address bar, or tap the browser menu (<strong>⋮</strong>) &rarr; <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#E52B32]/10 border border-[#E52B32]/25 space-y-1">
                <p className="font-bold text-[#E52B32] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Safari (iPhone &amp; iPad)
                </p>
                <p className="text-ink/80 leading-relaxed">
                  Tap the <strong>Share</strong> button (box with upward arrow <span className="font-mono">↑</span>) in Safari&apos;s bottom toolbar, scroll down, and select <strong>&quot;Add to Home Screen&quot;</strong> (⊞).
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-page border border-line text-[11px] text-mut leading-relaxed">
                <strong>Authentic Cross-Origin PWA:</strong> The installed application runs under its genuine domain (<code className="text-ink font-mono">{app.url}</code>) with its official manifest, icons, and offline storage. AppMintly does not wrap or alter the application.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
              <button
                onClick={() => setShowPwaInstallGuide(false)}
                className="px-5 py-2.5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition cursor-pointer"
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
