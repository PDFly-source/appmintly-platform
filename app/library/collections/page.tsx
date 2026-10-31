import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import CollectionDetailClient from '@/components/CollectionDetailClient';

export const metadata: Metadata = {
  title: 'Your collections | AppMintly',
  description:
    'Collections you created on this device. Private to your browser, never uploaded, and separate from AppMintly’s public catalog-derived collections.',
  alternates: { canonical: `${SITE_URL}/library/collections/` },
  robots: { index: false, follow: false },
};

export default function LibraryCollectionsPage() {
  return <CollectionDetailClient />;
}
