/**
 * Canonical host definition.
 *
 * The production marketplace is served from two hosts:
 *   - https://appmintly.pages.dev/           (canonical Cloudflare Pages host)
 *   - https://pdfly-source.github.io/appmintly-platform/  (GitHub Pages mirror,
 *     served under the NEXT_PUBLIC_BASE_PATH sub-path)
 *
 * All canonical URLs (metadata alternates, JSON-LD identifiers, shared links)
 * point at the CANONICAL host regardless of which mirror a visitor is on, so
 * shared links always open on the primary domain. This constant is the single
 * source of truth for that host — metadata generation (app/[slug]/page.tsx)
 * and the shared Share System (lib/share.ts) both derive from it.
 */
export const CANONICAL_SITE_URL = 'https://appmintly.pages.dev/';
