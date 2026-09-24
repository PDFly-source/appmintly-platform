'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  X,
  Filter,
  SlidersHorizontal,
  Sparkles,
  Smartphone,
  Globe,
  Gamepad2,
  Wrench,
  Layers,
  ArrowUpDown,
  Tag
} from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';
import { AppItem, AppType } from '@/data/apps';
import { CATEGORIES } from '@/data/categories';
import { PUBLISHERS } from '@/data/publishers';
import { AppCard } from '@/components/AppCard';

function ExploreContent() {
  const { publishedApps } = useCatalog();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'all';
  const initialType = searchParams.get('type') || 'all';
  const initialFilter = searchParams.get('filter') || 'all';
  const initialSort = searchParams.get('sort') || 'newest';
  const initialPublisher = searchParams.get('publisher') || 'all';

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedType, setSelectedType] = useState(initialType);
  const [filterOriginals, setFilterOriginals] = useState(initialFilter === 'originals');
  const [selectedPublisher, setSelectedPublisher] = useState(initialPublisher);
  const [sortBy, setSortBy] = useState<'newest' | 'updated' | 'name' | 'type'>(
    initialSort === 'name' ? 'name' : initialSort === 'updated' ? 'updated' : initialSort === 'type' ? 'type' : 'newest'
  );
  const router = useRouter();

  // Keep the address bar in sync so filtered views are shareable.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedType !== 'all') params.set('type', selectedType);
    if (filterOriginals) params.set('filter', 'originals');
    if (selectedPublisher !== 'all') params.set('publisher', selectedPublisher);
    if (sortBy !== 'newest') params.set('sort', sortBy);
    const qs = params.toString();
    router.replace(qs ? `/explore?${qs}` : '/explore', { scroll: false });
  }, [query, selectedCategory, selectedType, filterOriginals, selectedPublisher, sortBy, router]);

  const appTypes: { label: string; value: string; icon: any }[] = [
    { label: 'All Formats', value: 'all', icon: Layers },
    { label: 'Web App', value: 'Web App', icon: Globe },
    { label: 'PWA', value: 'PWA', icon: Globe },
    { label: 'Android APK', value: 'Android APK', icon: Smartphone },
    { label: 'Game', value: 'Game', icon: Gamepad2 },
    { label: 'Tool', value: 'Tool', icon: Wrench },
    { label: 'Website', value: 'Website', icon: Globe },
  ];

  // Filtering & Search strictly across canonical publishedApps
  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();

    return publishedApps.filter((app) => {
      // Originals filter
      if (filterOriginals && !app.original) return false;

      // Publisher filter
      if (selectedPublisher !== 'all' && (app.developerSlug || '').toLowerCase() !== selectedPublisher.toLowerCase()) return false;

      // Category filter
      if (selectedCategory !== 'all') {
        const catObj = CATEGORIES.find(
          (c) =>
            c.slug.toLowerCase() === selectedCategory.toLowerCase() ||
            c.name.toLowerCase() === selectedCategory.toLowerCase()
        );
        const catNameLower = catObj ? catObj.name.toLowerCase() : selectedCategory.toLowerCase();
        const appCatLower = (app.category || '').toLowerCase();

        const match =
          appCatLower === selectedCategory.toLowerCase() ||
          appCatLower === catNameLower ||
          appCatLower.replace(/\s+/g, '-') === selectedCategory.toLowerCase();

        if (!match) return false;
      }

      // Type filter
      if (selectedType !== 'all') {
        const appTypeLower = (app.type || '').toLowerCase().trim();
        const selTypeLower = selectedType.toLowerCase().trim();

        if (appTypeLower !== selTypeLower) {
          if (
            selTypeLower === 'web app' &&
            (appTypeLower === 'web app' || appTypeLower === 'pwa' || appTypeLower === 'web_app')
          ) {
            // matches web app family
          } else if (selTypeLower === 'game' && (appTypeLower === 'web game' || appTypeLower === 'game')) {
            // matches game family
          } else {
            return false;
          }
        }
      }

      // Search query filter (matches name, shortName, description, shortDescription, developer, category, tags, features, type)
      if (q) {
        const inName = app.name.toLowerCase().includes(q);
        const inShortName = app.shortName ? app.shortName.toLowerCase().includes(q) : false;
        const inDesc = app.description ? app.description.toLowerCase().includes(q) : false;
        const inShort = app.shortDescription ? app.shortDescription.toLowerCase().includes(q) : false;
        const inDev = app.developer ? app.developer.toLowerCase().includes(q) : false;
        const inCat = app.category ? app.category.toLowerCase().includes(q) : false;
        const inType = app.type ? app.type.toLowerCase().includes(q) : false;
        const inTags = Array.isArray(app.tags) && app.tags.some((t) => t.toLowerCase().includes(q));
        const inFeatures = Array.isArray(app.features) && app.features.some((f) => f.toLowerCase().includes(q));

        if (!inName && !inShortName && !inDesc && !inShort && !inDev && !inCat && !inType && !inTags && !inFeatures) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'updated') {
        const dateA = new Date(a.lastUpdated || a.updatedAt || 0).getTime();
        const dateB = new Date(b.lastUpdated || b.updatedAt || 0).getTime();
        return dateB - dateA;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'type') {
        return a.type.localeCompare(b.type);
      }
      // Default: newest
      const dateA = new Date(a.lastUpdated || a.updatedAt || a.releaseDate || 0).getTime();
      const dateB = new Date(b.lastUpdated || b.updatedAt || b.releaseDate || 0).getTime();
      return dateB - dateA;
    });
  }, [publishedApps, query, selectedCategory, selectedType, filterOriginals, selectedPublisher, sortBy]);

  // Quick suggestions for popular tags
  const popularTags = ['education', 'tools', 'study', 'pdf', 'assam', 'productivity', 'privacy', 'offline'];

  const clearAllFilters = () => {
    setQuery('');
    setSelectedCategory('all');
    setSelectedType('all');
    setFilterOriginals(false);
    setSortBy('newest');
  };

  const hasActiveFilters =
    query.trim() !== '' ||
    selectedCategory !== 'all' ||
    selectedType !== 'all' ||
    filterOriginals;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-4xl font-black text-[#17191C] tracking-tight">
          Explore App Catalog
        </h1>
        <p className="text-xs sm:text-sm text-[#6F6F6F] mt-1 max-w-xl">
          Search and filter verified Android APKs, web applications, educational portals, and utilities.
        </p>
      </div>

      {/* Global Search Bar */}
      <div className="mb-6 space-y-3">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-[#6F6F6F] absolute left-4 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, description, tags, features, or developer..."
            className="w-full rounded-2xl bg-[#FFFDF8] border border-[#E8DED0] focus:border-[#1976F3] focus:ring-1 focus:ring-[#1976F3] pl-12 pr-12 py-3.5 text-sm sm:text-base text-[#17191C] placeholder-[#6F6F6F] shadow-2xs transition focus:outline-hidden"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 p-1.5 rounded-full text-[#6F6F6F] hover:text-[#17191C] hover:bg-[#F8F2E7] transition cursor-pointer"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Suggestion Tags */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#6F6F6F]">
          <span className="font-semibold text-[#17191C]">Suggested:</span>
          {popularTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setQuery(tag)}
              className="px-2.5 py-1 rounded-full bg-[#FFFDF8] border border-[#E8DED0] hover:border-[#17191C]/40 text-[#17191C] transition cursor-pointer"
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Controls Bar: Types, Category, Originals, Sort */}
      <div className="bg-[#FFFDF8] border border-[#E8DED0] rounded-2xl p-4 mb-8 shadow-2xs space-y-4">
        {/* Row 1: App Formats / Types */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
          <span className="text-xs font-black uppercase text-[#6F6F6F] shrink-0 mr-1">
            Format:
          </span>
          {appTypes.map((t) => {
            const Icon = t.icon;
            const active = selectedType === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setSelectedType(t.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition cursor-pointer ${
                  active
                    ? 'bg-[#17191C] text-white shadow-2xs'
                    : 'bg-[#F8F2E7] text-[#17191C] hover:bg-[#E8DED0]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Category Filter & Sort Dropdown & Originals Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E8DED0]/60">
          <div className="flex flex-wrap items-center gap-3">
            {/* Category select */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-[#6F6F6F]">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-[#F8F2E7] border border-[#E8DED0] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Publisher select */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-[#6F6F6F]">Publisher:</span>
              <select
                value={selectedPublisher}
                onChange={(e) => setSelectedPublisher(e.target.value)}
                aria-label="Filter by publisher"
                className="bg-[#F8F2E7] border border-[#E8DED0] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
              >
                <option value="all">All Publishers</option>
                {PUBLISHERS.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}{p.verified ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Originals Toggle */}
            <button
              onClick={() => setFilterOriginals(!filterOriginals)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                filterOriginals
                  ? 'bg-[#F7B928]/20 border-[#F7B928] text-[#8C6000]'
                  : 'bg-[#F8F2E7] border-[#E8DED0] text-[#17191C] hover:bg-[#E8DED0]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F7B928]" />
              <span>Originals Only</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Sort order */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-[#6F6F6F]">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-[#F8F2E7] border border-[#E8DED0] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#17191C] focus:outline-hidden focus:ring-1 focus:ring-[#1976F3]"
              >
                <option value="newest">Latest Release</option>
                <option value="updated">Recently Updated</option>
                <option value="name">App Name (A-Z)</option>
                <option value="type">Format / Type</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-bold text-[#E52B32] hover:underline transition cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs sm:text-sm font-semibold text-[#6F6F6F]">
          Showing <span className="text-[#17191C] font-black">{filteredApps.length}</span>{' '}
          {filteredApps.length === 1 ? 'application' : 'applications'}
        </p>
      </div>

      {/* Grid or Empty State */}
      {filteredApps.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredApps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-16 sm:py-24 px-4 bg-[#FFFDF8] rounded-3xl border border-[#E8DED0]">
          <div className="w-16 h-16 rounded-2xl bg-[#E52B32]/10 text-[#E52B32] flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-lg sm:text-xl font-black text-[#17191C] tracking-tight">
            No apps found
          </h3>
          <p className="text-xs sm:text-sm text-[#6F6F6F] mt-1 max-w-sm mx-auto">
            Try another search or clear your filters to explore the entire catalog.
          </p>
          <button
            onClick={clearAllFilters}
            className="mt-5 px-5 py-2.5 rounded-full bg-[#17191C] hover:bg-[#E52B32] text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-6 py-12 text-sm text-[#6F6F6F]">Loading catalog...</div>}>
      <ExploreContent />
    </Suspense>
  );
}
