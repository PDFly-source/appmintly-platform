'use client';

/**
 * Storefront rails — Phase A of the premium storefront upgrade.
 *
 * Honest-data rails derived ONLY from the published catalog:
 *  - AppMintly Originals   (catalog flag: original === true)
 *
 * The Web Apps/PWA and Android APK sections already exist on the homepage
 * (aria-labels "Web apps and PWAs" / "Direct Android APK downloads") and
 * are NOT duplicated here.
 *
 * Each rail hides itself when empty (no filler, no invented entries).
 * Reuses the existing AppCard so card behavior (favorite, install sheet,
 * QR dialog) stays identical to every other section of the marketplace.
 */
import React from 'react';
import { Award } from 'lucide-react';
import { AppCard } from '@/components/AppCard';
import type { AppItem } from '@/data/apps';

function railBadge(
  icon: React.ReactNode,
  label: string,
  classes: string
) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md mb-1.5 border ${classes}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function HorizontalRail({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory"
      style={{ scrollbarWidth: 'thin' }}
    >
      {children}
    </div>
  );
}

function railCardShell(child: React.ReactNode, key: string) {
  return (
    <div key={key} className="snap-start shrink-0 w-[78vw] sm:w-[340px]">
      {child}
    </div>
  );
}

export function OriginalsRail({ apps }: { apps: AppItem[] }) {
  const originals = apps.filter((a) => a.published && a.original === true);
  if (originals.length === 0) return null;
  return (
    <section className="px-4 sm:px-6 max-w-7xl mx-auto mb-14" aria-label="AppMintly Originals">
      <div className="mb-5">
        {railBadge(
          <Award className="w-3.5 h-3.5" aria-hidden="true" />,
          'Made on AppMintly',
          'text-warning-text bg-forge-gold/10 border-forge-gold/25'
        )}
        <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
          AppMintly Originals
        </h2>
        <p className="text-xs sm:text-sm text-mut mt-1">
          First-party applications built and published on the AppMintly platform.
        </p>
      </div>
      <HorizontalRail ariaLabel="AppMintly Originals applications">
        {originals.map((app) =>
          railCardShell(<AppCard app={app} variant="compact" />, app.id)
        )}
      </HorizontalRail>
    </section>
  );
}
