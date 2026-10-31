import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import CompareClient from './CompareClient';

/* Comparison is a personal, client-side view built from a local selection.
   It carries no indexable content of its own, so it is explicitly noindex and
   stays out of the sitemap (which is generated from the static route list). */
export const metadata: Metadata = {
  title: 'Compare Apps | AppMintly',
  description:
    'Compare up to three AppMintly apps side by side using their published catalog fields: category, format, platform support, version, APK size, network requirement and features.',
  alternates: { canonical: `${SITE_URL}compare${CANONICAL_TRAILING_SLASH}` },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <CompareClient />;
}
