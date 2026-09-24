import { CATEGORIES } from '@/data/categories';
import CategoryDetailClient from './CategoryDetailClient';

// Pre-render all category pages for the static GitHub Pages build.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export default function CategoryDetailPage() {
  return <CategoryDetailClient />;
}
