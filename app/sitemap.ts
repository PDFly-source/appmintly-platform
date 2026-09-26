import type { MetadataRoute } from 'next';

// Required for the static GitHub Pages export.
export const dynamic = 'force-static';

import { SITE_URL } from '@/app/layout';
import { APPS } from '@/data/apps';
import { PUBLISHERS } from '@/data/publishers';
import { CATEGORIES } from '@/data/categories';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';

/**
 * sitemap.xml — static catalog routes only (truthful content):
 * the marketplace homepage, browse surfaces, and one route per
 * published application and category.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}explore${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}categories${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}library${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}about${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}privacy${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}terms${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}cookies${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}contact${CANONICAL_TRAILING_SLASH}`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Public publisher profile pages (one per repository-verified identity).
  const publisherRoutes: MetadataRoute.Sitemap = PUBLISHERS.map((p) => ({
    url: `${SITE_URL}publisher/${p.slug}${CANONICAL_TRAILING_SLASH}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const appRoutes: MetadataRoute.Sitemap = APPS.filter((a) => a.published).map((a) => ({
    url: `${SITE_URL}app/${a.slug}${CANONICAL_TRAILING_SLASH}`,
    lastModified: a.updatedAt || a.lastUpdated || now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}category/${c.slug}${CANONICAL_TRAILING_SLASH}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...appRoutes, ...categoryRoutes, ...publisherRoutes];
}
