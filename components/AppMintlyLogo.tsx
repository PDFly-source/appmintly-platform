import React from 'react';

/**
 * Official AppMintly brand mark.
 *
 * Renders the exact supplied AppMintly logo artwork (public/brand/*.png).
 * The artwork itself is never redrawn, recolored, or recreated in HTML/CSS —
 * only technical crops/arrangements of the same official master asset are
 * used, each containing the exact multicolor wordmark and gold tagline
 * artwork wherever the wordmark appears:
 *   - appmintly-logo-full.png    -> the complete supplied vertical lockup
 *                                   (symbol + wordmark + gold lines +
 *                                   DISCOVER • INSTALL • EXPERIENCE),
 *                                   used for hero, about, footer signature
 *                                   and OG/Twitter branding.
 *   - appmintly-logo-compact.png -> the same official artwork segments
 *                                   arranged horizontally (symbol left,
 *                                   exact wordmark + gold tagline block
 *                                   right), used for compact horizontal
 *                                   placements (navbar, footer brand
 *                                   column, hero badge) where the square
 *                                   lockup does not fit.
 *   - appmintly-icon*.png        -> the official symbol-only crop, used
 *                                   strictly for icon-only contexts
 *                                   (favicon, PWA icons, app icon,
 *                                   compact mobile/icon-only placements).
 *
 * No CSS/text reconstruction of the wordmark or tagline exists anywhere in
 * this component — every visible logo rendering is the approved artwork.
 */
interface AppMintlyLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'horizontal' | 'mark' | 'dark';
  /** Kept for API compatibility; the tagline is part of the lockup artwork. */
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
const MARK_SRC = `${BASE_PATH}/brand/appmintly-icon-512.png`;
const MARK_SRC_COMPACT = `${BASE_PATH}/brand/appmintly-icon-192.png`;
const FULL_SRC = `${BASE_PATH}/brand/appmintly-logo-full.png`;
const COMPACT_SRC = `${BASE_PATH}/brand/appmintly-logo-compact.png`;

export const AppMintlyLogo: React.FC<AppMintlyLogoProps> = ({
  size = 'md',
  variant = 'horizontal',
  className = '',
}) => {
  const scaleMap = {
    // mark: square symbol edge; horizontal: compact lockup height;
    // full: complete vertical lockup edge.
    xs: { mark: 26, horizontal: 24, full: 96 },
    sm: { mark: 34, horizontal: 32, full: 128 },
    md: { mark: 42, horizontal: 40, full: 160 },
    lg: { mark: 58, horizontal: 52, full: 220 },
    xl: { mark: 84, horizontal: 72, full: 320 },
  };
  const current = scaleMap[size];

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

  // 'horizontal' (and legacy 'dark'): the complete official lockup artwork —
  // exact multicolor wordmark + gold DISCOVER • INSTALL • EXPERIENCE tagline —
  // arranged compactly for horizontal placements. Rendered as one image asset.
  return (
    <div className={`inline-flex items-center ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={COMPACT_SRC}
        alt="AppMintly — Discover. Install. Experience."
        height={current.horizontal}
        className="shrink-0 rounded-md object-contain"
        style={{ height: current.horizontal, width: 'auto' }}
      />
    </div>
  );
};
