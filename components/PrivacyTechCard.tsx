'use client';

/**
 * Phase 11 — Evidence-based Privacy & Tech scorecard.
 *
 * Renders ONLY what the canonical record's `privacyTech` block supports.
 * Missing/unverified values display "Not specified" / "Not verified" —
 * this card NEVER invents facts and computes no fake numeric privacy score.
 */

import React from 'react';
import { ShieldCheck, Globe, Wifi, WifiOff, HardDrive, Smartphone, Package, LinkIcon, Lock } from 'lucide-react';
import { AppItem } from '@/data/apps';

const NOT_SPECIFIED = 'Not specified';

function Fact({
  icon,
  label,
  value,
  verified = true,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined | null;
  verified?: boolean;
}) {
  const display =
    value && typeof value === 'string' && value.trim().length > 0 ? value : NOT_SPECIFIED;
  const isUnknown = display === NOT_SPECIFIED;
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-t border-line first:border-t-0">
      <span className="mt-0.5 shrink-0 text-mut" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-mut">{label}</p>
        <p
          className={`text-xs font-semibold mt-0.5 leading-relaxed ${
            isUnknown ? 'text-mut italic' : 'text-ink'
          }`}
        >
          {isUnknown ? 'Not verified' : display}
          {verified && !isUnknown && (
            <Lock className="inline w-3 h-3 ml-1.5 text-[#16A765]" aria-label="Verified from release evidence" />
          )}
        </p>
      </div>
    </div>
  );
}

export function PrivacyTechCard({ app }: { app: AppItem }) {
  const facts = app.privacyTech;

  // Permissions come from the signed APK manifest when available
  const permissions = facts?.permissions && facts.permissions.length > 0
    ? facts.permissions.map((p) => p.replace('android.permission.', '')).join(', ')
    : undefined;

  return (
    <section aria-labelledby="privacy-tech-heading" className="rounded-2xl bg-card border border-line overflow-hidden shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none">
      <div className="flex items-center gap-2 px-4 py-3.5 bg-page border-b border-line">
        <ShieldCheck className="w-4 h-4 text-[#16A765]" aria-hidden />
        <h3 id="privacy-tech-heading" className="text-sm font-bold text-ink">
          Privacy &amp; Technology
        </h3>
        <span className="ml-auto text-[9px] font-black uppercase tracking-wider text-mut border border-line rounded-full px-2 py-0.5">
          Evidence-based
        </span>
      </div>

      <div>
        <Fact
          icon={<Package className="w-3.5 h-3.5" />}
          label="Android permissions"
          value={permissions ? `APK requests: ${permissions}` : undefined}
          verified={facts?.permissionsSource === 'apk-manifest'}
        />
        <Fact
          icon={<Lock className="w-3.5 h-3.5" />}
          label="Data collection"
          value={facts?.dataCollection}
        />
        <Fact
          icon={<Globe className="w-3.5 h-3.5" />}
          label="Tracking"
          value={facts?.tracking}
        />
        <Fact
          icon={facts?.networkRequirement === 'offline-capable' ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
          label="Network requirement"
          value={
            facts?.networkRequirement === 'online-only'
              ? 'Internet connection required'
              : facts?.networkRequirement === 'offline-capable'
                ? facts.offlineSupport || 'Works offline after first load'
                : undefined
          }
        />
        <Fact
          icon={<Smartphone className="w-3.5 h-3.5" />}
          label="PWA support"
          value={
            facts?.pwaSupport === 'verified-installable'
              ? 'Installable — verified web app manifest & service worker'
              : facts?.pwaSupport === 'not-installable'
                ? 'Not installable as a web app'
                : undefined
          }
        />
        <Fact
          icon={<HardDrive className="w-3.5 h-3.5" />}
          label="Storage"
          value={facts?.storage}
        />
        <Fact
          icon={<LinkIcon className="w-3.5 h-3.5" />}
          label="Installation type"
          value={facts?.installationType}
        />
        <Fact
          icon={<Globe className="w-3.5 h-3.5" />}
          label="External services"
          value={
            facts?.externalServices && facts.externalServices.length > 0
              ? facts.externalServices.join(', ')
              : undefined
          }
        />
      </div>

      {!facts || Object.values(facts).every((v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0)) ? (
        <p className="px-4 py-3 text-[11px] text-mut border-t border-line">
          The publisher has not published verified technical or privacy details for this app yet.
        </p>
      ) : null}
    </section>
  );
}
