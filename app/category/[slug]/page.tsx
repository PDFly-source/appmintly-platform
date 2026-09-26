import type { Metadata } from 'next';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { CATEGORIES } from '@/data/categories';
import CategoryDetailClient from './CategoryDetailClient';

// Pre-render all category pages for the static GitHub Pages build.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

const SITE_URL = 'https://pdfly-source.github.io/appmintly-platform/';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.slug === slug);
  if (!category) {
    return { title: 'Category not found - AppMintly' };
  }

  const canonicalUrl = `${SITE_URL}category/${category.slug}${CANONICAL_TRAILING_SLASH}`;
  const title = `${category.name} Apps & Games - AppMintly`;
  const description = `Browse ${category.name.toLowerCase()} apps and games on AppMintly. Discover, install and experience curated ${category.name.toLowerCase()} applications.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'AppMintly',
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.slug === slug);

  const jsonLd = category
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AppMintly', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Categories',
            item: `${SITE_URL}categories${CANONICAL_TRAILING_SLASH}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: category.name,
            item: `${SITE_URL}category/${category.slug}${CANONICAL_TRAILING_SLASH}`,
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <CategoryDetailClient />
    </>
  );
}
