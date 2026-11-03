'use client';

import React, { useState } from 'react';
import { BASE_PATH } from '@/lib/api-path';
import { AppIcon } from '@/components/AppIcon';
import { resolveBrandArtwork, type BrandableApp } from '@/lib/brand-artwork';

interface AppArtworkProps {
  app: BrandableApp;
  /**
   * 'banner' fills the available width and shows the whole lockup (the
   * default wherever CineFlow is presented as a brand). 'icon' is the square
   * affordance for compact chrome (nav, avatars) and for apps without a
   * lockup.
   */
  layout?: 'banner' | 'icon';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  priority?: boolean;
  className?: string;
  /** fatal: fall back to the letter tile rather than a broken image */
  fallbackToIcon?: boolean;
}

/**
 * Single render path for app artwork across the public marketplace.
 *
 * For apps that declare a full lockup (CineFlow) this renders the entire
 * artwork — symbol, wordmark and tagline — at its own aspect ratio with
 * `object-contain`, so nothing is ever cropped, stretched or squared off.
 * The image is `w-full h-auto`, which lets the tagline scale with the
 * surface instead of disappearing on narrow cards.
 */
export const AppArtwork: React.FC<AppArtworkProps> = ({
  app,
  layout = 'banner',
  size = 'lg',
  priority = false,
  className = '',
  fallbackToIcon = true,
}) => {
  const artwork = resolveBrandArtwork(app);
  const [failed, setFailed] = useState(false);

  const showLockup = artwork.isLockup && layout === 'banner' && !(failed && fallbackToIcon);

  if (!showLockup) {
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

  const resolved = artwork.src && artwork.src.startsWith('/') ? `${BASE_PATH}${artwork.src}` : artwork.src;

  return (
    <div
      className={`relative w-full ${className}`}
      // The canvas ratio is enforced here and on the img, so the box never
      // collapses before the image decodes and never clips the tagline.
      style={{ aspectRatio: String(artwork.aspect) }}
    >
      <img
        src={resolved}
        alt={artwork.alt}
        className="block w-full h-full object-contain select-none"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

export default AppArtwork;
