import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import HomePageClient from '@/components/HomePageClient';

/* Server wrapper for the homepage so the route can export metadata.
   The homepage previously could not emit a canonical URL (it was a
   client component), leaving the two live hosts — the canonical
   appmintly.pages.dev and the GitHub Pages fallback — as duplicate
   content with no preferred source. Detail pages already declare
   their canonical; this closes the gap for the most-linked page.
   Rendering and behavior are unchanged. */
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

export default function Page() {
  return <HomePageClient />;
}
