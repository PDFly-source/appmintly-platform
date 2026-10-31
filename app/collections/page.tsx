import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site-url';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';
import { APPS } from '@/data/apps';
import curated from '@/data/collections.json';
import { buildCollections } from '@/lib/catalog/collections';
import { AppIcon } from '@/components/AppIcon';

/* Collections hub (AppMintly 2.0, Phase 2).
   Every card lists real published catalog apps only — buildCollections drops
   ids that are not in the catalog, so a stale data file can never publish a
   phantom app. */
export const metadata: Metadata = {
  title: 'App Collections — Curated Picks from the Catalog | AppMintly',
  description:
    'Curated collections of published AppMintly apps: private and local-first tools, verified Android releases and installable PWAs. Every entry is a real catalog record.',
  alternates: { canonical: `${SITE_URL}collections${CANONICAL_TRAILING_SLASH}` },
  openGraph: {
    title: 'App Collections | AppMintly',
    description: 'Curated collections built only from published AppMintly catalog records.',
    url: `${SITE_URL}collections${CANONICAL_TRAILING_SLASH}`,
    siteName: 'AppMintly',
    type: 'website',
  },
};

export default function CollectionsPage() {
  const { collections } = buildCollections(APPS, curated as never);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">Collections</p>
        <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Curated app collections</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
          Groups built from catalogued facts, not marketing copy. Every app below is a live,
          published listing; a collection with fewer than two real members is never shown.
        </p>
      </header>

      {collections.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="text-sm font-semibold text-ink">No collections available yet</p>
          <p className="mt-1 text-sm text-ink/60">
            Collections appear once the catalog has enough published apps sharing a trait.
          </p>
          <Link
            href="/explore"
            className="mt-4 inline-flex rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Browse all apps
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {collections.map((collection) => (
            <section
              key={collection.id}
              className="rounded-2xl border border-line bg-card p-5 sm:p-6"
              aria-labelledby={`collection-${collection.id}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`collection-${collection.id}`} className="text-lg font-bold text-ink">
                  {collection.title}
                </h2>
                <span className="text-xs font-medium text-ink/50">
                  {collection.apps.length} {collection.apps.length === 1 ? 'app' : 'apps'}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink/70">{collection.description}</p>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {collection.apps.map((app) => (
                  <li key={app.id}>
                    <Link
                      href={`/app/${app.slug}`}
                      className="flex items-center gap-3 rounded-xl border border-line/60 bg-surface p-3 transition-colors hover:border-ink/25"
                    >
                      <AppIcon src={app.icon} name={app.name} size="md" category={app.category} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{app.name}</span>
                        <span className="block truncate text-xs text-ink/60">
                          {app.category} · {app.type}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
