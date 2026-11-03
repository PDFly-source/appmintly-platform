'use client';

import React, { useState } from 'react';
import { BASE_PATH } from '@/lib/api-path';
import { AppIcon } from '@/components/AppIcon';
import { resolveBrandArtwork, type BrandableApp } from '@/lib/brand-artwork';

/**
 * Standard app-card artwork.
 *
 * DESIGN RULE (permanent, all apps): every marketplace card shows its artwork
 * in the SAME square slot — the size classes, radius, border, shadow and
 * background below are AppIcon's own tokens, unchanged. An app that supplies a
 * full lockup (symbol + wordmark + tagline) renders that artwork *inside* that
 * square with `object-contain`, so it is never cropped, stretched, squared off
 * or promoted to a full-width banner. No app gets an oversized image
 * exception; new catalogue entries inherit this automatically by passing the
 * same component.
 *
 * `hero` is the one deliberate exception, reserved for the dedicated app
 * detail page, which owns its own larger presentation.
 */

interface AppArtworkProps {
  app: BrandableApp;
  /** 'icon' = standard card slot (default). 'hero' = detail page only. */
  layout?: 'icon' | 'hero';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  priority?: boolean;
  className?: string;
}

/** Identical to AppIcon's size classes so cards stay pixel-consistent. */
const sizeClasses: Record<string, string> = {
  xs: 'w-6 h-6',
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-14 h-14 sm:w-16 sm:h-16',
  xl: 'w-20 h-20 sm:w-24 sm:h-24',
  '2xl': 'w-28 h-28 sm:w-32 sm:h-32',
};

export const AppArtwork: React.FC<AppArtworkProps> = ({
  app,
  layout = 'icon',
  size = 'lg',
  priority = false,
  className = '',
}) => {
  const artwork = resolveBrandArtwork(app);
  const [failed, setFailed] = useState(false);

  const src = artwork.src;
  const resolvedSrc = src && src.startsWith('/') ? `${BASE_PATH}${src}` : src;

  // Non-lockup apps, and any artwork that fails to load, take the untouched
  // AppIcon path: their cards must not change in any way.
  if (!artwork.isLockup || failed || !resolvedSrc) {
    return (
      <AppIcon
        src={app.icon}
        name={app.name || 'App'}
        size={size}
        themeColor={(app as { themeColor?: string }).themeColor}
        category={(app as { category?: string }).category}
        priority={priority}
        className={className}
      />
    );
  }

  const img = (
    <img
      src={resolvedSrc}
      alt={artwork.alt}
      className="block w-full h-full object-contain select-none"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );

  if (layout === 'hero') {
    // Dedicated detail-page presentation; the caller owns the width and the
    // aspect box, so the whole lockup stays visible at its own ratio.
    return (
      <div className={`relative w-full ${className}`} style={{ aspectRatio: String(artwork.aspect) }}>
        {img}
      </div>
    );
  }

  // Standard square slot, exactly as every other app card renders it.
  return (
    <div
      className={`relative shrink-0 overflow-hidden shadow-2xs border border-ink/10 bg-card ${sizeClasses[size] || sizeClasses.lg} rounded-2xl ${className}`}
    >
      {img}
    </div>
  );
};

export default AppArtwork;
