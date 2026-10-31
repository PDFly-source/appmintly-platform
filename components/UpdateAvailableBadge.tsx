'use client';

/**
 * Phase 1A — "Update Available" badge (AppCard variant).
 *
 * Renders ONLY when this browser has a recorded downloaded/verified
 * version AND the catalog carries a strictly newer release. It never
 * claims the device's installed APK version — the label says an update
 * is available for an app this browser downloaded/verified, per the
 * local version history.
 */

import React from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { useInstallRecord, computeUpdateInfo } from '@/lib/app-installs';
import { releaseVersionOf } from '@/lib/notifications/engine';
import type { AppItem } from '@/data/apps';

export function UpdateAvailableBadge({ app }: { app: AppItem }) {
  const rec = useInstallRecord(app.id);
  if (!rec) return null;

  const latest = releaseVersionOf(app as unknown as Record<string, unknown>);
  const info = computeUpdateInfo(rec, latest);
  if (!info.available) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-forge-yellow/15 border border-forge-yellow/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-warning-text">
      <ArrowUpCircle className="w-3 h-3" aria-hidden />
      Update Available
    </span>
  );
}
