import type { MetadataRoute } from 'next';

// Required for the static GitHub Pages export.
export const dynamic = 'force-static';

import { SITE_URL } from '@/lib/site-url';

/**
 * robots.txt — allows all crawlers, points at the sitemap under the
 * GitHub Pages base path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}sitemap.xml`,
  };
}
