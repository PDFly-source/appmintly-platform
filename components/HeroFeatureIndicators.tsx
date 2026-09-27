import React from 'react';
import { ShieldCheck, Zap, EyeOff, MonitorSmartphone } from 'lucide-react';

/**
 * Phase 18 — Hero feature indicators (Phase 19: added optional `dark`
 * variant for use inside the always-dark premium hero card, without
 * touching the default light/dark-theme-following styling used
 * elsewhere).
 *
 * Truthful, product-level labels only — "Verified & Safe" describes
 * AppMintly's own release-verification practice (SHA-256 evidence, official
 * release links — see the trust strip below), not a third-party security
 * certification. No claim here is unsupported by the current catalog data.
 */
const INDICATORS = [
  { Icon: ShieldCheck, color: '#16A765', label: 'Verified & Safe', sub: 'Checked releases' },
  { Icon: Zap, color: '#F4B400', label: 'Lightweight & Fast', sub: 'No bloat' },
  { Icon: EyeOff, color: '#1565E8', label: 'No Tracking Bloat', sub: 'Straight to install' },
  { Icon: MonitorSmartphone, color: '#E31E24', label: 'Works on Any Device', sub: 'APK, PWA & web' },
];

export const HeroFeatureIndicators: React.FC<{ className?: string; dark?: boolean }> = ({
  className = '',
  dark = false,
}) => (
  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 ${className}`}>
    {INDICATORS.map(({ Icon, color, label, sub }) => (
      <div
        key={label}
        className={
          dark
            ? 'flex items-center gap-2 rounded-xl bg-white/8 border border-white/12 px-2.5 py-2'
            : 'flex items-center gap-2 rounded-xl bg-card border border-line px-2.5 py-2 shadow-xs'
        }
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
          style={{ backgroundColor: dark ? `${color}33` : `${color}1F` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: dark ? color : color }} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className={`block text-[11px] font-bold leading-tight ${dark ? 'text-white' : 'text-ink'}`}>
            {label}
          </span>
          <span className={`block text-[10px] leading-tight ${dark ? 'text-white/55' : 'text-mut'}`}>{sub}</span>
        </span>
      </div>
    ))}
  </div>
);
