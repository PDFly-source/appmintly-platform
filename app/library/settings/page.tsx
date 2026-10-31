import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import LibrarySettingsClient from '@/components/LibrarySettingsClient';

export const metadata: Metadata = {
  title: 'Personalization settings | AppMintly',
  description:
    'Manage the categories you follow, the recommendation and recently viewed switches, and clear on-device personalization data. Everything stays in your browser.',
  alternates: { canonical: `${SITE_URL}/library/settings/` },
  robots: { index: false, follow: false },
};

export default function LibrarySettingsPage() {
  return <LibrarySettingsClient />;
}
