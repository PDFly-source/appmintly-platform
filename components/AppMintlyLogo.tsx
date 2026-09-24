import React from 'react';

/**
 * Official AppMintly brand mark.
 *
 * Renders the exact supplied AppMintly logo artwork (public/brand/*.png).
 * The artwork itself is never redrawn, recolored, or recreated — only
 * technical crops/resizes of the same official asset are used:
 *   - appmintly-icon.png     -> square emblem-only crop (mark/icon contexts)
 *   - appmintly-logo-full.png -> the complete supplied lockup (hero/about/OG)
 *
 * For compact horizontal placements (navbar, footer) where the full square
 * artwork does not fit well, the emblem crop is paired with a plain-text
 * wordmark in the app's own UI font — this is a UI label, not a recreated
 * logo/wordmark graphic.
 */
interface AppMintlyLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'horizontal' | 'mark' | 'dark';
  showTagline?: boolean;
  className?: string;
}

// Base path is '' for local/server deployments and '/appmintly-platform' for
// the static GitHub Pages build (injected at build time).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Compact sizes render at 26-42px (navbar/footer). A 192px optimized
// derivative of the official 700px mark is used for those placements so
// browsers download ~41 KB instead of ~368 KB. Large placements and the
// original artwork still use the untouched official source assets.
const MARK_SRC = `${BASE_PATH}/brand/appmintly-icon.png`;
const MARK_SRC_COMPACT = `${BASE_PATH}/brand/appmintly-icon-192.png`;
const FULL_SRC = `${BASE_PATH}/brand/appmintly-logo-full.png`;

export const AppMintlyLogo: React.FC<AppMintlyLogoProps> = ({
  size = 'md',
  variant = 'horizontal',
  showTagline = false,
  className = '',
}) => {
  const scaleMap = {
    xs: { mark: 26, text: 15, full: 96 },
    sm: { mark: 34, text: 18, full: 128 },
    md: { mark: 42, text: 21, full: 160 },
    lg: { mark: 58, text: 27, full: 220 },
    xl: { mark: 84, text: 36, full: 320 },
  };
  const current = scaleMap[size];
  const isDark = variant === 'dark';

  const Mark = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={size === 'xs' || size === 'sm' || size === 'md' ? MARK_SRC_COMPACT : MARK_SRC}
      alt="AppMintly"
      width={current.mark}
      height={current.mark}
      className="shrink-0 rounded-md object-contain"
      style={{ width: current.mark, height: current.mark }}
    />
  );

  const TextLabel = (
    <div className="flex flex-col select-none leading-none">
      <span
        className={`font-black tracking-tight ${isDark ? 'text-white' : 'text-[#17191C]'}`}
        style={{ fontSize: current.text }}
      >
        AppMintly
      </span>
      {showTagline && (
        <span
          className={`text-[11px] font-medium tracking-wide mt-0.5 ${
            isDark ? 'text-white/70' : 'text-[#6F6F6F]'
          }`}
        >
          Discover. Install. Experience.
        </span>
      )}
    </div>
  );

  if (variant === 'mark') {
    return <div className={`inline-flex items-center ${className}`}>{Mark}</div>;
  }

  if (variant === 'full') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FULL_SRC}
          alt="AppMintly — Discover. Install. Experience."
          width={current.full}
          height={current.full}
          className="object-contain"
          style={{ width: current.full, height: current.full }}
        />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {Mark}
      {TextLabel}
    </div>
  );
};

