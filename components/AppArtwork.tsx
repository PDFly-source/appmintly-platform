'use client';

import React from 'react';
import { AppIcon } from '@/components/AppIcon';
import { sizeForSlot, type ArtworkSlot } from '@/lib/artwork-tokens';

/**
 * The ONLY way a marketplace surface renders app artwork.
 *
 * It takes a SLOT NAME, never a width, ratio, or app identifier, and it always
 * renders the app's square mark through AppIcon at the token size for that
 * slot. Consequences, by construction:
 *
 *   - no app can enlarge its artwork;
 *   - featured status cannot bypass the slot;
 *   - publisher/catalogue metadata cannot inject a size;
 *   - a full lockup canvas is never stretched into a square slot, which is
 *     what made CineFlow's mark look smaller than everyone else's.
 *
 * The full CineFlow lockup (symbol + wordmark + tagline) is still the brand
 * asset; it belongs on CineFlow's own surfaces, not in an icon slot.
 */

interface AppArtworkProps {
  app: { icon?: string; name?: string; themeColor?: string; category?: string };
  slot: ArtworkSlot;
  priority?: boolean;
  className?: string;
}

export const AppArtwork: React.FC<AppArtworkProps> = ({ app, slot, priority = false, className = '' }) => (
  <AppIcon
    src={app.icon}
    name={app.name || 'App'}
    size={sizeForSlot(slot)}
    themeColor={app.themeColor}
    category={app.category}
    priority={priority}
    className={className}
  />
);

export default AppArtwork;
