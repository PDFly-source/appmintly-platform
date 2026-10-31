import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Layers, ShieldCheck } from 'lucide-react';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { APPS } from '@/data/apps';
import curated from '@/data/collections.json';
import {
  buildCollections,
  collectionContentDate,
  collectionPlatformSplit,
  collectionSlug,
  findCollectionBySlug,
  type Collection,
} from '@/lib/catalog/collections';
import { AppCard } from '@/components/AppCard';

/* Individual collection pages (AppMintly 2.0, Item 4).
   Routes are generated from buildCollections() - the same function the hub
   uses - so a slug can never exist here without a real collection behind it. */

export const dynamicParams = false;

function allCollections(): Collection[] {
  return buildCollections(APPS, curated as never).collections;
}

export function generateStaticParams() {
  return allCollections().map((collection) => ({ slug: collectionSlug(collection.id) }));
}

function metaDescription(collection: Collection): string {
  const count = collection.apps.length;
  const names = collection.apps
    .slice(0, 3)
    .map((a) => a.name)
    .join(', ');
  const extra = collection.apps.length > 3 ? ' and more' : '';
  return `${collection.description} ${count} published ${count === 1 ? 'app' : 'apps'}: ${names}${extra}.`.slice(
    0,
    158
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = findCollectionBySlug(allCollections(), slug);
  if (!collection) return { title: 'Collection not found - AppMintly' };

  const title = `${collection.title} — App Collection | AppMintly`;
  const description = metaDescription(collection);
  const url = `${SITE_URL}collections/${collectionSlug(collection.id)}${CANONICAL_TRAILING_SLASH}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, siteName: 'AppMintly', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = findCollectionBySlug(allCollections(), slug);
  // Unknown slug, or a collection that lost its members: a real 404, never a
  // thin placeholder page.
  if (!collection) notFound();

  const apps = collection.apps;
  const split = collectionPlatformSplit(collection);
  const updated = collectionContentDate(collection);
  const url = `${SITE_URL}collections/${collectionSlug(collection.id)}${CANONICAL_TRAILING_SLASH}`;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Collections',
        item: `${SITE_URL}collections${CANONICAL_TRAILING_SLASH}`,
      },
      { '@type': 'ListItem', position: 3, name: collection.title, item: url },
    ],
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink/55">
        <Link href="/" className="hover:text-ink transition-colors">
          Home
        </Link>
        <ChevronRight aria-hidden="true" className="w-3 h-3" />
        <Link href="/collections" className="hover:text-ink transition-colors">
          Collections
        </Link>
        <ChevronRight aria-hidden="true" className="w-3 h-3" />
        <span aria-current="page" className="truncate font-semibold text-ink/80">
          {collection.title}
        </span>
      </nav>

      <header className="mt-4 overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-8">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-page px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink/60">
          <Layers aria-hidden="true" className="h-3 w-3" /> Collection
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-4xl">
          {collection.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70 sm:text-base">
          {collection.description}
        </p>

        <dl className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink/60">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Published apps</dt>
            <dd className="font-semibold text-ink">
              {apps.length} {apps.length === 1 ? 'app' : 'apps'}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Android releases</dt>
            <dd>{split.android} with a signed APK</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Web availability</dt>
            <dd>{split.web} open on the web</dd>
          </div>
          {updated && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Newest app update</dt>
              <dd>Newest member updated {updated.toISOString().slice(0, 10)}</dd>
            </div>
          )}
        </dl>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink/45">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Membership comes from catalogued facts on each published record. No ratings, download
          counts or popularity scores are shown because AppMintly does not track them.
        </p>
      </header>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">
          Apps in this collection
        </h2>
        <Link
          href="/collections"
          className="text-xs font-semibold text-ink/70 underline underline-offset-2 hover:text-ink"
        >
          Back to Collections
        </Link>
      </div>

      {apps.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center">
          <p className="text-sm font-semibold text-ink">No published apps in this collection yet</p>
          <p className="mt-1 text-sm text-ink/60">
            Every member app must be a live catalog record. Check back after the next release.
          </p>
          <Link
            href="/explore"
            className="mt-4 inline-flex rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Browse all apps
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <li key={app.id} className="min-w-0">
              <AppCard app={app} variant="explore" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
