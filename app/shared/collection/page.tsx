import type { Metadata } from 'next';
import SharedCollectionClient from '@/components/SharedCollectionClient';

export const metadata: Metadata = {
  title: 'Shared collection | AppMintly',
  description:
    'A read-only AppMintly collection shared by link. Only currently published catalog apps are shown.',
  robots: { index: false, follow: false },
};

export default function SharedCollectionPage() {
  return <SharedCollectionClient />;
}
