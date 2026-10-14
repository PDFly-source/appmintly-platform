import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import LabClient from '@/components/LabClient';

/* Phase 1B — AppMintly Lab: the public upcoming-apps roadmap.
   Static, catalog-data-driven (data/upcoming-apps.json), no backend. */
export const metadata: Metadata = {
  title: 'AppMintly Lab — Upcoming Apps & Public Roadmap | AppMintly',
  description:
    'See what AppMintly is building next. Upcoming apps with their purpose, intended users, proposed features, planned capabilities and roadmap status. Vote for the ones you want.',
  alternates: { canonical: `${SITE_URL}lab${CANONICAL_TRAILING_SLASH}` },
};

export default function Page() {
  return <LabClient />;
}
