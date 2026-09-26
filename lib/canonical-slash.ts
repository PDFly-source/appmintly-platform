/**
 * Canonical URL trailing-slash helper.
 *
 * Static-export builds (NEXT_OUTPUT=export, deployed to GitHub Pages) use
 * `trailingSlash: true` in next.config.ts — see the root-cause note there.
 * Their URL space is slash-terminated (/explore/, /app/appmintly/), so
 * canonical URLs, JSON-LD identifiers, and sitemap entries must match that
 * shape to stay consistent with the address bar. Server/standalone builds
 * (local dev + the marketplace build embedded in APKs) keep the default
 * slash-less URLs and are unaffected.
 */
export const CANONICAL_TRAILING_SLASH: string = process.env.NEXT_OUTPUT === 'export' ? '/' : '';
