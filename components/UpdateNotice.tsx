'use client';

/**
 * Phase 1A — Dismissible update notification + accessible update-details
 * view for the app detail page.
 *
 * Shows ONLY when this browser's local version history (downloaded or
 * verified version) is older than the catalog's latest release, and the
 * notice has not been dismissed for that version.
 *
 * Honesty: the notice says the update is available for a version the user
 * downloaded/verified in THIS browser. It never claims to know the
 * installed Android APK version.
 *
 * Accessibility: the notice is a polite live region; the details view is a
 * modal dialog (role=dialog, aria-modal) with Escape close, backdrop
 * close, focus on open and background-scroll lock.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bell, X, ArrowUpCircle, History, Sparkles } from 'lucide-react';
import type { AppItem } from '@/data/apps';
import { useInstallRecord, computeUpdateInfo, dismissUpdateFor } from '@/lib/app-installs';
import { releaseVersionOf } from '@/lib/notifications/engine';

export function UpdateNotice({ app }: { app: AppItem }) {
  const rec = useInstallRecord(app.id);
  const [showDetails, setShowDetails] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  const latest = releaseVersionOf(app as unknown as Record<string, unknown>);
  const info = computeUpdateInfo(rec, latest);

  // Per-version dismissal: a new release always re-shows the notice.
  const visible = info.available && !info.dismissed;

  // Escape closes the details dialog; lock background scroll while open.
  useEffect(() => {
    if (!showDetails) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDetails(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    detailsRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [showDetails]);

  if (!visible && !showDetails) return null;

  const releaseNotes = app.releaseNotes ?? [];
  const changelog = app.changelog ?? [];
  const downloaded = rec?.downloadedVersion;
  const verified = rec?.verifiedVersion;

  const handleDismiss = () => {
    if (latest) dismissUpdateFor(app.id, latest);
  };

  return (
    <>
      {visible && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-forge-yellow/45 bg-forge-yellow/10 p-3.5"
        >
          <Bell className="mt-0.5 w-4 h-4 text-[#8C6000]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">
              Update available — {app.name} v{info.latestVersion}
            </p>
            <p className="mt-0.5 text-[11px] text-mut">
              You {verified ? 'verified' : 'downloaded'} v{info.previousVersion} in this browser. A newer official
              release is available.
            </p>
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink hover:bg-page transition-colors cursor-pointer"
              aria-haspopup="dialog"
            >
              <History className="w-3.5 h-3.5" aria-hidden />
              View update details
            </button>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss update notice"
            className="shrink-0 rounded-full p-1.5 text-mut hover:text-ink hover:bg-page transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}

      {showDetails && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-details-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDetails(false);
          }}
        >
          <div className="absolute inset-0 bg-inkbg/45 backdrop-blur-sm" aria-hidden />
          <div
            ref={detailsRef}
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl bg-card border border-line shadow-2xl p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 outline-none"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 id="update-details-title" className="flex items-center gap-2 text-ink font-bold">
                <ArrowUpCircle className="w-4.5 h-4.5 text-warning-text" aria-hidden />
                Update details
              </h3>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="p-1.5 rounded-full text-mut hover:text-ink hover:bg-page transition-colors cursor-pointer"
                aria-label="Close update details"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] rounded-xl bg-page border border-line p-3">
              <div>
                <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">App</dt>
                <dd className="text-ink mt-0.5 font-bold">{app.name}</dd>
              </div>
              <div>
                <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Latest version</dt>
                <dd className="text-ink mt-0.5">v{info.latestVersion}</dd>
              </div>
              <div>
                <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Your version (this browser)</dt>
                <dd className="text-ink mt-0.5">v{info.previousVersion}</dd>
              </div>
              <div>
                <dt className="text-mut font-bold uppercase tracking-wider text-[9px]">Recorded activity</dt>
                <dd className="text-ink mt-0.5">
                  {downloaded ? `Downloaded v${downloaded}` : ''}
                  {downloaded && verified ? ' · ' : ''}
                  {verified ? `Verified v${verified}` : ''}
                </dd>
              </div>
            </dl>

            {releaseNotes.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-mut mb-1.5">
                  <Sparkles className="w-3 h-3" aria-hidden />
                  Release highlights
                </p>
                <ul className="space-y-1">
                  {releaseNotes.slice(0, 6).map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-mut">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-forge-red shrink-0" aria-hidden />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {changelog.length > 0 && (
              <p className="mt-3 text-[10px] text-mut border-t border-line pt-2">
                Changelog: {changelog.slice(0, 3).join(' · ')}
              </p>
            )}

            <p className="mt-3 text-[10px] text-mut leading-relaxed">
              This notice is based on your download/verification history in this browser. AppMintly cannot detect
              which APK version is installed on your device.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
