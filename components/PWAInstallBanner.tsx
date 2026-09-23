'use client';

import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share2, X, Smartphone } from 'lucide-react';
import { AppForgeLogo } from './AppForgeLogo';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || dismissed) {
    return null;
  }

  // Show if installable or on iOS
  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-[#17191C] via-[#23272C] to-[#17191C] text-white px-4 py-2.5 shadow-md border-b border-white/10 relative z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <AppForgeLogo variant="mark" size="xs" />
            <div className="truncate">
              <span className="font-bold text-white">Install APPFORGE App</span>
              <span className="hidden sm:inline text-white/70 ml-2">Fast offline access & native experience</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isInstallable && (
              <button
                id="pwa-install-banner-btn"
                onClick={install}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E52B32] hover:bg-[#b81f25] text-white font-medium text-xs shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
            )}

            {isIOS && (
              <button
                id="pwa-ios-guide-btn"
                onClick={() => setShowIOSGuide(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/20 transition"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Install on iOS</span>
              </button>
            )}

            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-white/50 hover:text-white rounded-full transition"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[#FFFDF8] p-6 shadow-2xl border border-[#E8DED0] text-[#17191C]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8DED0]">
              <div className="flex items-center gap-2">
                <AppForgeLogo variant="mark" size="xs" />
                <h3 className="font-bold text-base">Install on iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-[#6F6F6F] hover:text-[#17191C] p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-[#17191C]/80">
              <div className="flex items-start gap-3 bg-white p-3 rounded-xl border border-[#E8DED0]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1976F3] text-xs font-bold text-white">
                  1
                </span>
                <p>
                  Tap the <Share2 className="w-4 h-4 inline mx-1 text-[#1976F3]" /> <strong>Share</strong> icon in the bottom Safari toolbar.
                </p>
              </div>

              <div className="flex items-start gap-3 bg-white p-3 rounded-xl border border-[#E8DED0]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#16A765] text-xs font-bold text-white">
                  2
                </span>
                <p>
                  Scroll down and select <strong>Add to Home Screen</strong>.
                </p>
              </div>

              <div className="flex items-start gap-3 bg-white p-3 rounded-xl border border-[#E8DED0]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E52B32] text-xs font-bold text-white">
                  3
                </span>
                <p>
                  Tap <strong>Add</strong> in the top-right corner to finish.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-[#E52B32] py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b81f25] transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
