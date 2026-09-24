import { APPS } from '@/data/apps';
import AppDetailClient from './AppDetailClient';

// Static export (GitHub Pages) requires every dynamic route to be known at
// build time. The marketplace is a static catalog, so all published slugs
// are pre-rendered.
export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

export default function AppDetailPage() {
  return <AppDetailClient />;
}
