import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import CategoriesClient from '@/components/CategoriesClient';

/* Server wrapper for the category hub so it can export metadata. */
export const metadata: Metadata = {
  title: 'Categories — Browse App Types | AppMintly',
  description:
    'Every app category in the AppMintly marketplace, from tools and education to games and utilities. Each category page lists only real published apps.',
  alternates: { canonical: `${SITE_URL}categories${CANONICAL_TRAILING_SLASH}` },
};

export default function Page() {
  return <CategoriesClient />;
}
