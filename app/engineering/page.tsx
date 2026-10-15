import type { Metadata } from 'next';

/**
 * Phase 3.2 — AppMintly Engineering Dashboard (unlisted engineering page).
 *
 * Renders the version-controlled engineering status data shipped with the
 * platform (data/engineering-status.json, data/lab-apps.json,
 * data/engineering-events.json). This page is NOT part of the public
 * navigation: the Publisher Console embeds it as a secure iframe, and it
 * is excluded from search indexes.
 *
 * Every displayed value comes from the fetched data files — the page
 * never fabricates statuses, checks, or dates.
 */
export const metadata: Metadata = {
  title: 'AppMintly Engineering Dashboard',
  robots: { index: false, follow: false },
};

import EngineeringDashboardClient from '@/components/EngineeringDashboardClient';

export default function EngineeringPage() {
  return <EngineeringDashboardClient />;
}
