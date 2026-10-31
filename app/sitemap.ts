import type { MetadataRoute } from 'next';

// Required for the static GitHub Pages export.
export const dynamic = 'force-static';

import { SITE_URL } from '@/lib/site-url';
import { APPS } from '@/data/apps';
import { PUBLISHERS } from '@/data/publishers';
import { CATEGORIES } from '@/data/categories';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import curatedCollections from '@/data/collections.json';
import {
  buildCollections,
  collectionContentDate,
  collectionSlug,
} from '@/lib/catalog/collections';

/**
 * sitemap.xml — static catalog routes only (truthful content):
 * the marketplace homepage, browse surfaces, and one route per
 * published application and category.
 */
function stamp(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default function sitemap(): MetadataRoute.Sitemap {
  // lastmod is derived from real content dates, never from the build clock:
  // stamping every URL with the build time tells crawlers the whole site
  // changed on every deploy, which is untrue.
  const appDates = APPS.filter((a) => a.published)
    .map((a) => stamp(a.updatedAt || a.lastUpdated || a.publishedAt))
    .filter((d): d is Date => Boolean(d));
  const datasetDate = appDates.length
    ? new Date(Math.max(...appDates.map((d) => d.getTime())))
    : undefined;

  // Individual collection pages (Item 4). Built from the same function the
  // route uses, so the sitemap cannot list a slug that has no page, and each
  // entry carries the newest member app date instead of the build clock.
  const collectionRoutes: MetadataRoute.Sitemap = buildCollections(
    APPS,
    curatedCollections as never
  ).collections.map((collection) => ({
    url: `${SITE_URL}collections/${collectionSlug(collection.id)}${CANONICAL_TRAILING_SLASH}`,
    lastModified: collectionContentDate(collection) ?? datasetDate,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, lastModified: datasetDate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}explore${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}collections${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}categories${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}library${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}lab${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}updates${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE_URL}about${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}privacy${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}terms${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}cookies${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}contact${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}services/security${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}services/install-help${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}services/request-app${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}services/suggest-feature${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}services/report-issue${CANONICAL_TRAILING_SLASH}`, lastModified: datasetDate, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Public publisher profile pages (one per repository-verified identity).
  const publisherRoutes: MetadataRoute.Sitemap = PUBLISHERS.map((p) => ({
    url: `${SITE_URL}publisher/${p.slug}${CANONICAL_TRAILING_SLASH}`,
    lastModified:
      appDates.length
        ? new Date(
            Math.max(
              ...APPS.filter((a) => a.published && a.developerSlug === p.slug)
                .map((a) => stamp(a.updatedAt || a.lastUpdated || a.publishedAt)?.getTime() || 0),
              0
            )
          )
        : datasetDate,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const appRoutes: MetadataRoute.Sitemap = APPS.filter((a) => a.published).map((a) => ({
    url: `${SITE_URL}app/${a.slug}${CANONICAL_TRAILING_SLASH}`,
    lastModified: stamp(a.updatedAt || a.lastUpdated) || stamp(a.publishedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}category/${c.slug}${CANONICAL_TRAILING_SLASH}`,
    // A category changed when its newest member changed, not on every build.
    lastModified:
      appDates.length
        ? new Date(
            Math.max(
              ...APPS.filter((a) => a.published && a.category === c.name)
                .map((a) => stamp(a.updatedAt || a.lastUpdated || a.publishedAt)?.getTime() || 0),
              0
            )
          )
        : datasetDate,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [
    ...staticRoutes,
    ...collectionRoutes,
    ...appRoutes,
    ...categoryRoutes,
    ...publisherRoutes,
  ];
}
