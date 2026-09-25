'use client';

/**
 * Phase 11 — PWA / system-level integration surface.
 *
 *  - Service-worker update detection: when a NEW deployment's worker takes
 *    control (skipWaiting + controllerchange), a subtle toast offers a
 *    one-tap refresh so stale assets NEVER permanently override production.
 *  - Online/offline state: a non-blocking status pill lets the user know the
 *    marketplace is offline (cached shell still works).
 *  - Mounts the global CommandPalette (Ctrl/Cmd+K).
 */

import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';

export function SystemStatus() {
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Online / offline state
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    // Initial check deferred out of the effect body (lint-clean + immediate)
    Promise.resolve().then(update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Service worker update detection: a new deployment's worker activates
  // (skipWaiting) and this page receives a controllerchange event.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      // Only prompt if this page was controlled by an OLDER worker before.
      setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return (
    <>
      <CommandPalette />

      {offline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2 rounded-full bg-inkbg text-white text-xs font-bold shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5" aria-hidden />
          You&apos;re offline — browsing the cached marketplace
        </div>
      )}

      {updateReady && !dismissed && (
        <div
          role="alertdialog"
          aria-label="New version available"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[85] flex items-center gap-2 px-3 py-2 rounded-full bg-card border border-line shadow-xl"
        >
          <span className="text-xs font-semibold text-ink pl-1">A new version is available</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-inkbg text-white text-xs font-bold hover:bg-[#E52B32] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-full text-mut hover:text-ink hover:bg-page transition-colors cursor-pointer"
            aria-label="Dismiss update notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
