import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { APPS } from '@/data/apps';
import { getDeveloperIdentity } from '@/data/publishers';
import PkdProfileClient from './PkdProfileClient';

const SITE_URL = 'https://appmintly.pages.dev/';
const CANONICAL = `${SITE_URL}publisher/pkd${CANONICAL_TRAILING_SLASH}`;

// Static (build-time) app list for truthful JSON-LD, matching published apps.
const publisherApps = APPS.filter((a) => a.published && a.developerSlug === 'pkd');

export const metadata: Metadata = {
  title: 'PKD — Verified Developer & Publisher | AppMintly',
  description: `Verified developer & publisher profile for PKD on AppMintly — ${publisherApps.length} published ${publisherApps.length === 1 ? 'application' : 'applications'}: private, fast, local-first apps.`,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'PKD — Verified Developer & Publisher',
    description: 'Verified developer & publisher profile for PKD on AppMintly.',
    url: CANONICAL,
    siteName: 'AppMintly',
    type: 'profile',
  },
  twitter: {
    card: 'summary',
    title: 'PKD — Verified Developer & Publisher | AppMintly',
    description: 'Verified developer & publisher profile for PKD on AppMintly.',
  },
};

/**
 * Dedicated PKD publisher profile route.
 *
 * PKD is AppMintly's verified flagship publisher and ships a complete 3D
 * profile experience (the supplied PKD design, integrated verbatim with the
 * live catalog). All other publishers use the standard profile route at
 * app/publisher/[slug]. This static segment takes precedence over the
 * dynamic route, and [slug]'s generateStaticParams excludes 'pkd' so the
 * static export never emits a conflicting page.
 */
export default function PkdPublisherPage() {
  const identity = getDeveloperIdentity('pkd');

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PKD',
    url: CANONICAL,
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
    ...(identity?.website ? { sameAs: [identity.website] } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PkdProfileClient />
    </>
  );
}
