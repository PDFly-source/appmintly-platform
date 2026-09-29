import type { Metadata } from 'next';
import { SITE_URL } from '@/app/layout';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import SearchClient from '@/components/SearchClient';

/* Server wrapper. /search is a friendly alias that forwards to the
   canonical catalog search at /explore — the declared canonical makes
   that consolidation explicit for crawlers. */
export const metadata: Metadata = {
  title: 'Search Apps | AppMintly',
  description: 'Search the AppMintly catalog of verified apps, web apps, PWAs, games and tools.',
  alternates: { canonical: `${SITE_URL}explore${CANONICAL_TRAILING_SLASH}` },
};

export default function Page() {
  return <SearchClient />;
}
