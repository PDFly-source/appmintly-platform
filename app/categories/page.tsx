'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Wrench,
  Cpu,
  Gamepad2,
  Globe,
  GraduationCap,
  DollarSign,
  HeartPulse,
  ShoppingBag,
  Film,
  MessageSquare,
  Sparkles,
  Box,
  ArrowRight,
  Search,
  SearchX,
} from 'lucide-react';
import { CATEGORIES, CategoryItem } from '@/data/categories';
import { useCatalog } from '@/lib/CatalogContext';
import { isNewApp, AppItem } from '@/data/apps';

const ICON_MAP: Record<string, any> = {
  Briefcase,
  Wrench,
  Cpu,
  Gamepad2,
  Globe,
  GraduationCap,
  DollarSign,
  HeartPulse,
  ShoppingBag,
  Film,
  MessageSquare,
  Sparkles,
  Box,
};

type FilterKey = 'all' | 'popular' | 'new';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'popular', label: 'Popular' },
  { key: 'new', label: 'New' },
];

/**
 * Apps currently published inside a category.
 * Matches category by name or slug case-insensitively — the same public
 * visibility rule as the rest of the catalog (published apps only).
 */
function appsInCategory(cat: CategoryItem, publishedApps: AppItem[]): AppItem[] {
  const nameLower = cat.name.toLowerCase().trim();
  const slugLower = cat.slug.toLowerCase().trim();

  return publishedApps.filter((a) => {
    const appCat = (a.category || '').toLowerCase().trim();
    return (
      appCat === nameLower ||
      appCat === slugLower ||
      appCat.replace(/\s+/g, '-') === slugLower
    );
  });
}

export default function CategoriesPage() {
  const { publishedApps } = useCatalog();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  // Counts and memberships are derived live from the published catalog —
  // nothing is hardcoded; publishing/unpublishing updates this automatically.
  const { activeCats, comingSoonCats } = useMemo(() => {
    const active: { cat: CategoryItem; apps: AppItem[] }[] = [];
    const comingSoon: CategoryItem[] = [];

    for (const cat of CATEGORIES) {
      const apps = appsInCategory(cat, publishedApps);
      if (apps.length > 0) active.push({ cat, apps });
      else comingSoon.push(cat);
    }
    return { activeCats: active, comingSoonCats: comingSoon };
  }, [publishedApps]);

  const queryLower = query.toLowerCase().trim();

  const matchesQuery = (cat: CategoryItem) =>
    !queryLower ||
    cat.name.toLowerCase().includes(queryLower) ||
    cat.description.toLowerCase().includes(queryLower);

  // Filter chips use only real catalog signals:
  //  - Popular: the category contains a featured published app.
  //  - New: the category contains an app flagged new by the existing
  //    isNewApp() rule (publication/update recency threshold).
  const filteredActive = useMemo(() => {
    let list = activeCats.filter(({ cat }) => matchesQuery(cat));

    if (filter === 'popular') {
      list = list.filter(({ apps }) => apps.some((a) => a.featured === true));
    } else if (filter === 'new') {
      list = list.filter(({ apps }) => apps.some((a) => isNewApp(a)));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCats, queryLower, filter]);

  const filteredComingSoon = useMemo(
    () => comingSoonCats.filter((cat) => matchesQuery(cat)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comingSoonCats, queryLower]
  );

  const hasSearchText = queryLower.length > 0;
  const noResults =
    hasSearchText && filteredActive.length === 0 && filteredComingSoon.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Hero */}
      <div className="mb-6 sm:mb-8 max-w-2xl">
        <p className="text-[11px] font-black tracking-[0.2em] text-[#17805F] dark:text-[#3AC49B] mb-3">
          EXPLORE THE CATALOG
        </p>
        <h1 className="text-3xl sm:text-5xl font-black text-ink tracking-tight">
          Find what you need.
        </h1>
        <p className="text-sm sm:text-base text-mut mt-2 leading-relaxed">
          Browse apps, tools and digital experiences organized by what they help you do.
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-mut pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories..."
            aria-label="Search categories"
            className="w-full max-w-xl rounded-xl bg-card border border-line pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-mut outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 focus-visible:border-[#1976F3]/60 transition-colors"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div
        className="flex flex-wrap items-center gap-2 mb-8 sm:mb-10"
        role="group"
        aria-label="Filter categories"
      >
        {FILTERS.map(({ key, label }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 ${
                isActive
                  ? 'bg-[#0F6B4F] text-[#F5EBDD] border-[#0F6B4F]'
                  : 'bg-card text-mut border-line hover:text-ink hover:border-ink/30'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* No search results */}
      {noResults && (
        <div className="py-16 flex flex-col items-center text-center" role="status">
          <SearchX aria-hidden="true" className="w-8 h-8 text-mut mb-3" />
          <p className="text-base font-black text-ink">No categories found</p>
          <p className="text-sm text-mut mt-1">Try another search term.</p>
        </div>
      )}

      {/* No published apps at all */}
      {!noResults && publishedApps.length === 0 && (
        <div className="py-16 flex flex-col items-center text-center" role="status">
          <Box aria-hidden="true" className="w-8 h-8 text-mut mb-3" />
          <p className="text-base font-black text-ink">No apps available yet</p>
          <p className="text-sm text-mut mt-1">
            New apps will appear here as they are published.
          </p>
        </div>
      )}

      {/* Active categories */}
      {!noResults && publishedApps.length > 0 && (
        <section aria-labelledby="active-categories-heading">
          <h2
            id="active-categories-heading"
            className="text-lg font-black text-ink tracking-tight mb-4"
          >
            Active Categories
          </h2>

          {filteredActive.length === 0 ? (
            <p className="text-sm text-mut py-8 text-center" role="status">
              No categories match this filter yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredActive.map(({ cat, apps }) => {
                const Icon = ICON_MAP[cat.icon] || Box;
                const count = apps.length;
                const previewApps = apps.slice(0, 3);
                const moreCount = count - previewApps.length;

                return (
                  <Link
                    key={cat.id}
                    href={`/category/${encodeURIComponent(cat.slug)}`}
                    className="group flex flex-col justify-between p-5 rounded-2xl bg-card border border-line hover:border-ink/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976F3]/40 transition-all duration-200 motion-reduce:transition-none motion-safe:hover:-translate-y-0.5"
                  >
                    <div>
                      {/* Icon + name + dynamic count */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: cat.bgColor,
                              border: `1px solid ${cat.borderColor}`,
                              color: cat.color,
                            }}
                          >
                            <Icon aria-hidden="true" className="w-5 h-5" />
                          </div>
                          <h3 className="text-base font-black text-ink truncate">{cat.name}</h3>
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-page text-mut border border-line shrink-0">
                          {count} {count === 1 ? 'app' : 'apps'}
                        </span>
                      </div>

                      <p className="text-xs text-mut leading-relaxed line-clamp-2">
                        {cat.description}
                      </p>

                      {/* App preview (first apps in existing catalog order) */}
                      {previewApps.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {previewApps.map((app) => (
                            <li key={app.id} className="flex items-center gap-2 text-xs text-mut">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={app.icon}
                                alt=""
                                width={18}
                                height={18}
                                className="w-[18px] h-[18px] rounded-md object-cover shrink-0"
                              />
                              <span className="truncate font-semibold text-ink/90">
                                {app.name}
                              </span>
                            </li>
                          ))}
                          {moreCount > 0 && (
                            <li className="text-[11px] text-mut pl-[26px]">
                              + {moreCount} more
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-ink">
                      <span>
                        Explore {cat.name}
                        <span className="sr-only">
                          {' '}
                          — {count} {count === 1 ? 'app' : 'apps'}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="w-4 h-4 transition-transform duration-200 motion-reduce:transition-none motion-safe:group-hover:translate-x-1"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Coming soon — compact, visually secondary */}
      {!noResults && filteredComingSoon.length > 0 && (
        <section aria-labelledby="coming-soon-heading" className="mt-10 sm:mt-12">
          <h2
            id="coming-soon-heading"
            className="text-xs font-black tracking-[0.15em] text-mut uppercase mb-3"
          >
            Coming Soon
          </h2>
          <div className="flex flex-wrap gap-2">
            {filteredComingSoon.map((cat) => {
              const Icon = ICON_MAP[cat.icon] || Box;
              return (
                <div
                  key={cat.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card/60 border border-line/70 px-3 py-1.5 text-xs font-semibold text-mut"
                >
                  <Icon
                    aria-hidden="true"
                    className="w-3.5 h-3.5"
                    style={{ color: cat.color }}
                  />
                  {cat.name}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
