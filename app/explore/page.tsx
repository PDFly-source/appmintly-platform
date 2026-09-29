import type { Metadata } from 'next';
import { SITE_URL } from '@/app/layout';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import ExploreClient from '@/components/ExploreClient';

/* Server wrapper so the main browse surface can export metadata.
   /explore renders many query-string variants (?q=, ?category=,
   ?featured=, ?format=); the canonical consolidates all of them onto
   the one indexable explore URL. Category-filtered views have their
   own dedicated /category/[slug] routes with full metadata. */
export const metadata: Metadata = {
  title: 'Explore Apps — Browse the Full Catalog | AppMintly',
  description:
    'Browse every published app in the AppMintly catalog. Filter by category, featured picks, and Android APK, PWA or web app format.',
  alternates: { canonical: `${SITE_URL}explore${CANONICAL_TRAILING_SLASH}` },
};

export default function Page() {
  return <ExploreClient />;
}
