import type { Metadata } from 'next';
import { PUBLISHERS } from '@/data/publishers';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return PUBLISHERS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const identity = PUBLISHERS.find((p) => p.slug === slug);
  return {
    title: `Publisher Dashboard - ${identity?.name || slug} - AppMintly`,
    description: 'Production publisher dashboard for the AppMintly marketplace.',
    robots: { index: false, follow: false },
  };
}

export default function PublisherDashboardPage() {
  return <DashboardClient />;
}
