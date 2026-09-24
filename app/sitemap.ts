import type { MetadataRoute } from 'next';

// Required for the static GitHub Pages export.
export const dynamic = 'force-static';

import { SITE_URL } from '@/app/layout';
import { APPS } from '@/data/apps';
import { PUBLISHERS } from '@/data/publishers';
import { CATEGORIES } from '@/data/categories';

/**
 * sitemap.xml — static catalog routes only (truthful content):
 * the marketplace homepage, browse surfaces, and one route per
 * published application and category.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}explore`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}categories`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}library`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}publisher`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}about`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Public publisher profile pages (one per repository-verified identity).
  const publisherRoutes: MetadataRoute.Sitemap = PUBLISHERS.map((p) => ({
    url: `${SITE_URL}publisher/${p.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const appRoutes: MetadataRoute.Sitemap = APPS.filter((a) => a.published).map((a) => ({
    url: `${SITE_URL}app/${a.slug}`,
    lastModified: a.updatedAt || a.lastUpdated || now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}category/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...appRoutes, ...categoryRoutes, ...publisherRoutes];
}
