import type { Metadata } from 'next';
import { APPS } from '@/data/apps';
import { PUBLISHERS, getDeveloperIdentity } from '@/data/publishers';
import PublisherPublicClient from './PublisherPublicClient';

const SITE_URL = 'https://pdfly-source.github.io/appmintly-platform/';

// Static export (GitHub Pages) requires all publisher slugs at build time.
export function generateStaticParams() {
  return PUBLISHERS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const identity = getDeveloperIdentity(slug);
  if (!identity) {
    return { title: 'Publisher not found - AppMintly' };
  }

  const canonicalUrl = `${SITE_URL}publisher/${identity.slug}`;
  const appCount = APPS.filter((a) => a.published && a.developerSlug === identity.slug).length;
  const description = `Apps by ${identity.name} on AppMintly${appCount > 0 ? ` — ${appCount} published ${appCount === 1 ? 'application' : 'applications'}` : ''}.${identity.bio ? ' ' + identity.bio : ''}`;

  return {
    title: `${identity.name} — Verified Publisher | AppMintly`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${identity.name} on AppMintly`,
      description,
      url: canonicalUrl,
      siteName: 'AppMintly',
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title: `${identity.name} on AppMintly`,
      description,
    },
  };
}

export default async function PublisherPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const identity = getDeveloperIdentity(slug);

  // Static (build-time) app list for truthful JSON-LD, matching published apps.
  const publisherApps = APPS.filter(
    (a) => a.published && a.developerSlug === identity?.slug
  );

  const jsonLd: Record<string, unknown> | null = identity
    ? {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: identity.name,
        url: `${SITE_URL}publisher/${identity.slug}`,
        ...(identity.website ? { sameAs: [identity.website] } : {}),
        ...(publisherApps.length > 0
          ? {
              makesOffer: publisherApps.map((a) => ({
                '@type': 'Offer',
                itemOffered: {
                  '@type': 'SoftwareApplication',
                  name: a.name,
                  applicationCategory: a.category,
                  operatingSystem: a.type === 'Android APK' ? 'Android' : 'Any',
                  url: `${SITE_URL}app/${a.slug}`,
                },
              })),
            }
          : {}),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <PublisherPublicClient slug={slug} />
    </>
  );
}
