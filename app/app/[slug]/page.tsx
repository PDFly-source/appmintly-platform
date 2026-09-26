import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { APPS } from '@/data/apps';
import { resolveDeveloper } from '@/data/publishers';
import AppDetailClient from './AppDetailClient';

// Static export (GitHub Pages) requires every dynamic route to be known at
// build time. The marketplace is a static catalog, so all published slugs
// are pre-rendered.
export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

const SITE_URL = 'https://pdfly-source.github.io/appmintly-platform/';

/** Resolve a catalog icon path (possibly base-path-relative) to an absolute URL. */
function absoluteIcon(icon: string): string {
  if (icon.startsWith('http')) return icon;
  return `${SITE_URL}${icon.replace(/^\//, '')}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = APPS.find((a) => a.slug === slug && a.published);
  if (!app) {
    return { title: 'App not found - AppMintly' };
  }

  const canonicalUrl = `${SITE_URL}app/${app.slug}${CANONICAL_TRAILING_SLASH}`;
  const description = app.shortDescription || app.description;
  const image = absoluteIcon(app.icon);

  return {
    title: `${app.name} - ${app.category} App by ${app.developer} | AppMintly`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${app.name} on AppMintly`,
      description,
      url: canonicalUrl,
      siteName: 'AppMintly',
      type: 'website',
      images: [{ url: image, width: 384, height: 384, alt: `${app.name} icon` }],
    },
    twitter: {
      card: 'summary',
      title: `${app.name} on AppMintly`,
      description,
      images: [image],
    },
  };
}

export default async function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = APPS.find((a) => a.slug === slug && a.published);
  const developer = app ? resolveDeveloper(app) : null;

  // Truthful structured data: only emitted for real catalog entries.
  const jsonLd = app
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: app.name,
          applicationCategory: app.category,
          operatingSystem: app.apk?.enabled ? 'Android' : 'Web',
          softwareVersion: app.version,
          datePublished: app.publishedAt || app.releaseDate,
          dateModified: app.updatedAt || app.lastUpdated || app.releaseDate,
          description: app.shortDescription || app.description,
          image: absoluteIcon(app.icon),
          screenshot: app.screenshots?.filter((s) => s.startsWith('http')),
          author: {
            '@type': 'Organization',
            name: developer?.name || app.developer,
          },
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'AppMintly', item: SITE_URL },
            {
              '@type': 'ListItem',
              position: 2,
              name: `${app.category} Apps`,
              item: `${SITE_URL}category/${app.category.toLowerCase()}${CANONICAL_TRAILING_SLASH}`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: app.name,
              item: `${SITE_URL}app/${app.slug}${CANONICAL_TRAILING_SLASH}`,
            },
          ],
        },
      ]
    : [];

  return (
    <>
      {jsonLd.map((entry, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
      <AppDetailClient />
    </>
  );
}
