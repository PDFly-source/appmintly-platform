/**
 * Canonical brand artwork resolution.
 *
 * CineFlow ships a full brand lockup (film-strip C/play symbol + "Cineflow"
 * wordmark + "PRIVATE · CINEMA · CONTROL" tagline). The owner designated the
 * supplied lockup as the authoritative, permanent brand reference, so every
 * public marketplace surface that presents CineFlow as a brand must show all
 * three elements together — never the symbol-only launcher icon.
 *
 * The artwork is composed on a white canvas and is nearly square (944x950),
 * so the only lever for the tagline's rendered size is how wide the surface
 * gives it. Surfaces therefore render it full-width, contained, at its own
 * aspect ratio (see components/AppArtwork.tsx) rather than inside a square.
 *
 * `icon` remains the technical asset (Android adaptive launcher, and compact
 * affordances such as the nav/search avatar). It must never replace the
 * lockup where CineFlow is being presented as a brand.
 */

export interface BrandableApp {
  name?: string;
  icon?: string;
  brandLockup?: string;
  brandLockupWidth?: number;
  brandLockupHeight?: number;
  brandTagline?: string;
}

export interface BrandArtwork {
  /** true when the app declares a full lockup */
  isLockup: boolean;
  /** repository-relative path to render (lockup when present, else icon) */
  src?: string;
  /** intrinsic aspect ratio (width / height) for the lockup canvas */
  aspect: number;
  /** full brand accessible name, tagline included, for the rendered image */
  alt: string;
}

export const CINEFLOW_BRAND = {
  name: 'CineFlow',
  wordmark: 'Cineflow',
  tagline: 'PRIVATE · CINEMA · CONTROL',
  /** canonical lockup canvas (see public/brand/cineflow-lockup-v2.webp) */
  lockup: {
    path: '/brand/cineflow-lockup-v2.webp',
    width: 944,
    height: 950,
  },
} as const;

const DEFAULT_ASPECT = CINEFLOW_BRAND.lockup.width / CINEFLOW_BRAND.lockup.height;

export function resolveBrandArtwork(app: BrandableApp | null | undefined, fallbackName?: string): BrandArtwork {
  const name = app?.name || fallbackName || 'App';
  const tagline = app?.brandTagline;

  if (app?.brandLockup) {
    const width = app.brandLockupWidth || CINEFLOW_BRAND.lockup.width;
    const height = app.brandLockupHeight || CINEFLOW_BRAND.lockup.height;
    const aspect = width > 0 && height > 0 ? width / height : DEFAULT_ASPECT;
    return {
      isLockup: true,
      src: app.brandLockup,
      aspect,
      // The tagline is part of the brand identity, so it belongs in the
      // accessible name: screen readers must hear it even though it is
      // rendered as artwork rather than text.
      alt: tagline ? `${name} logo — ${tagline}` : `${name} logo`,
    };
  }

  return {
    isLockup: false,
    src: app?.icon,
    aspect: 1,
    alt: `${name} icon`,
  };
}
