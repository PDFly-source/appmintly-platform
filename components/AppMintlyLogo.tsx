import React from 'react';

/**
 * Official AppMintly brand mark.
 *
 * Renders the exact supplied AppMintly logo artwork (public/brand/*.png).
 * The artwork itself is never redrawn, recolored, or recreated — only
 * technical crops/resizes of the same official asset are used:
 *   - appmintly-icon*.png     -> the complete official artwork (whole-image
 *     derivatives; Phase 4 mandate: no symbol-only crops anywhere)
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
const MARK_SRC = `${BASE_PATH}/brand/appmintly-icon-512.png`;
const MARK_SRC_COMPACT = `${BASE_PATH}/brand/appmintly-icon-192.png`;
const MARK_SRC_HERO = `${BASE_PATH}/brand/appmintly-icon-1024.png`;
const FULL_SRC = `${BASE_PATH}/brand/appmintly-logo-full.png`;

/**
 * Phase 17 — the AppMintly brand wordmark, one shared component used
 * everywhere (navbar, hero, footer brand column, footer closing block).
 * Brand treatment: exact letter-by-letter brand colors, replacing the
 * earlier two-tone system. Fixed brand colors in all placements and both
 * themes (logotype treatment); the logo/icon artwork images themselves
 * are never recolored.
 *   Phase 4 artwork wordmark: A p p = #028B3E (green)
 *   M i n t l y = #0047B7 (blue) — sampled from the official master.
 */
const WORDMARK = 'AppMintly';
// Phase 4 — colors sampled per letter from the official artwork wordmark
// (pixel medians of the letter runs): "App" green #028B3E, "Mintly" blue
// #0047B7. This is a UI label only; the logo artwork itself is never redrawn.
const WORDMARK_LETTER_COLORS = [
  '#028B3E', // A — artwork "App" green
  '#028B3E', // p — artwork "App" green
  '#028B3E', // p — artwork "App" green
  '#0047B7', // M — artwork "Mintly" blue
  '#0047B7', // i — artwork "Mintly" blue
  '#0047B7', // n — artwork "Mintly" blue
  '#0047B7', // t — artwork "Mintly" blue
  '#0047B7', // l — artwork "Mintly" blue
  '#0047B7', // y — artwork "Mintly" blue
];

interface AppMintlyWordmarkTextProps {
  className?: string;
  style?: React.CSSProperties;
}

export const AppMintlyWordmarkText: React.FC<AppMintlyWordmarkTextProps> = ({
  className = '',
  style,
}) => (
  <span className={className} style={style} aria-label="AppMintly">
    <span aria-hidden="true">
      {WORDMARK.split('').map((letter, i) => (
        <span key={i} style={{ color: WORDMARK_LETTER_COLORS[i] }}>
          {letter}
        </span>
      ))}
    </span>
  </span>
);

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
      <AppMintlyWordmarkText
        className="font-black tracking-tight"
        style={{ fontSize: current.text }}
      />
      {showTagline && (
        <span
          className={`text-[11px] font-medium tracking-wide mt-0.5 ${
            isDark ? 'text-white/70' : 'text-mut'
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

