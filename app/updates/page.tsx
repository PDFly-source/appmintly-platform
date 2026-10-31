import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { UpdateCenter } from '@/components/updates/UpdateCenter';

/**
 * Item 6 — Smart App Update Center. Static route; every version, date and
 * release note rendered here comes from the published catalog record.
 */
export const metadata: Metadata = {
  title: 'Update Center | AppMintly',
  description:
    'See the latest published version of the apps you downloaded, compare it with the version this browser recorded, and read the release notes the publisher actually shipped.',
  alternates: { canonical: `${SITE_URL}updates${CANONICAL_TRAILING_SLASH}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <UpdateCenter />;
}
