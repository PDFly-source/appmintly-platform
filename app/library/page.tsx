import type { Metadata } from 'next';
import { SITE_URL } from '@/app/layout';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import LibraryClient from '@/components/LibraryClient';

/* Server wrapper so the Library route can export metadata. Saved
   apps are stored locally on this device (honest, per the persistence
   policy) — the description states exactly that. */
export const metadata: Metadata = {
  title: 'Your Library — Saved Apps | AppMintly',
  description:
    'Apps you saved on this device, stored locally in your browser. Browse the AppMintly catalog to add more.',
  alternates: { canonical: `${SITE_URL}library${CANONICAL_TRAILING_SLASH}` },
};

export default function Page() {
  return <LibraryClient />;
}
