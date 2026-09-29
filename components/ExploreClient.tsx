'use client';

import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  SearchX,
  X,
  SlidersHorizontal,
  FilterX,
  Sparkles,
  Star,
  Flame,
  Wrench,
  ChevronDown,
} from 'lucide-react';
import { useCatalog } from '@/lib/CatalogContext';

import { CATEGORIES } from '@/data/categories';
import { PUBLISHERS } from '@/data/publishers';
import { AppCard } from '@/components/AppCard';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

type SortBy = 'newest' | 'updated' | 'name' | 'type';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: 'Latest Release' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'name', label: 'App Name (A-Z)' },
  { value: 'type', label: 'Format / Type' },
];

// Desktop format dropdown (compact, replaces the old chip row that clipped
// on small screens). The mobile bottom sheet uses a shorter subset.
const FORMAT_OPTIONS = [
  { label: 'All Formats', value: 'all' },
  { label: 'Web App', value: 'Web App' },
  { label: 'PWA', value: 'PWA' },
  { label: 'Android APK', value: 'Android APK' },
  { label: 'Game', value: 'Game' },
  { label: 'Tool', value: 'Tool' },
  { label: 'Website', value: 'Website' },
];

const SHEET_FORMATS = [
  { label: 'All', value: 'all' },
  { label: 'Android', value: 'Android APK' },
  { label: 'Web', value: 'Web App' },
  { label: 'PWA', value: 'PWA' },
];

// Popular searches — compact, data-relevant, never more than five.
const SUGGESTED_SEARCHES = ['Education', 'Tools', 'Study', 'PDF'];

function ExploreContent() {
  const { publishedApps, isLoading } = useCatalog();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'all';
  const initialType = searchParams.get('type') || 'all';
  const initialFilter = searchParams.get('filter') || 'all';
  const initialSort = searchParams.get('sort') || 'newest';
  const initialPublisher = searchParams.get('publisher') || 'all';
  const initialFeatured = searchParams.get('featured') === 'true';

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedType, setSelectedType] = useState(initialType);
  const [filterOriginals, setFilterOriginals] = useState(initialFilter === 'originals');
  const [featuredOnly, setFeaturedOnly] = useState(initialFeatured);
  const [selectedPublisher, setSelectedPublisher] = useState(initialPublisher);
  const [sortBy, setSortBy] = useState<SortBy>(
    initialSort === 'name' ? 'name' : initialSort === 'updated' ? 'updated' : initialSort === 'type' ? 'type' : 'newest'
  );
  const router = useRouter();

  // Mobile filter bottom sheet: draft state is applied only on confirm.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<{
    category: string;
    type: string;
    publisher: string;
    originals: boolean;
    sort: SortBy;
  }>({ category: 'all', type: 'all', publisher: 'all', originals: false, sort: 'newest' });

  const searchRef = useRef<HTMLInputElement>(null);
  const sheetApplyRef = useRef<HTMLButtonElement>(null);

  // Keyboard shortcut: "/" focuses the smart search (desktop hint shown
  // inside the field). Never hijacks typing inside another control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Bottom sheet: Escape closes, body scroll locks, focus moves inside.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    sheetApplyRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  // Keep the address bar in sync so filtered views are shareable.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedType !== 'all') params.set('type', selectedType);
    if (filterOriginals) params.set('filter', 'originals');
    if (featuredOnly) params.set('featured', 'true');
    if (selectedPublisher !== 'all') params.set('publisher', selectedPublisher);
    if (sortBy !== 'newest') params.set('sort', sortBy);
    const qs = params.toString();
    router.replace(qs ? `/explore?${qs}` : '/explore', { scroll: false });
  }, [query, selectedCategory, selectedType, filterOriginals, featuredOnly, selectedPublisher, sortBy, router]);

  // Filtering & Search strictly across canonical publishedApps.
  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();

    return publishedApps.filter((app) => {
      // Featured filter (data-driven from the canonical record)
      if (featuredOnly && !app.featured) return false;

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
          } else if (
            selTypeLower === 'android apk' &&
            hasAuthoritativeApkRelease(app) &&
            typeof app.apk?.fileSizeBytes === 'number' &&
            app.apk.fileSizeBytes > 0
          ) {
            // Format filter matches canonical authoritative APK release
            // evidence (enabled + verified + sha256 + real size + downloadable
            // release asset), independent of the record's web-app type.
            // Generic for any future app; never matches fabricated listings.
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
  }, [publishedApps, query, selectedCategory, selectedType, filterOriginals, featuredOnly, selectedPublisher, sortBy]);

  const hasQuery = query.trim() !== '';
  const hasActiveFilters =
    hasQuery ||
    selectedCategory !== 'all' ||
    selectedType !== 'all' ||
    filterOriginals ||
    featuredOnly ||
    selectedPublisher !== 'all';

  /* Categories that actually have published apps — used to turn an empty
     filter result into a guided next step instead of a dead end. Computed
     from the real catalog, never hardcoded. */
  const categoriesWithResults = useMemo(
    () => [...new Set(publishedApps.map((a) => a.category).filter(Boolean))] as string[],
    [publishedApps]
  );

const clearAllFilters = () => {
    setQuery('');
    setSelectedCategory('all');
    setSelectedType('all');
    setFilterOriginals(false);
    setFeaturedOnly(false);
    setSelectedPublisher('all');
    setSortBy('newest');
  };

  const clearSheetDraft = () =>
    setDraft({ category: 'all', type: 'all', publisher: 'all', originals: false, sort: 'newest' });

  const openSheet = () => {
    setDraft({
      category: selectedCategory,
      type: selectedType,
      publisher: selectedPublisher,
      originals: filterOriginals,
      sort: sortBy,
    });
    setSheetOpen(true);
  };

  const applyDraft = () => {
    setSelectedCategory(draft.category);
    setSelectedType(draft.type);
    setSelectedPublisher(draft.publisher);
    setFilterOriginals(draft.originals);
    setSortBy(draft.sort);
    setSheetOpen(false);
  };

  // Active filter chips (removable, accessible)
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (hasQuery) activeChips.push({ key: 'q', label: `“${query.trim()}”`, onRemove: () => setQuery('') });
  if (selectedCategory !== 'all') {
    const cat = CATEGORIES.find(
      (c) => c.slug === selectedCategory || c.name.toLowerCase() === selectedCategory.toLowerCase()
    );
    activeChips.push({
      key: 'category',
      label: cat ? cat.name : selectedCategory,
      onRemove: () => setSelectedCategory('all'),
    });
  }
  if (selectedType !== 'all') {
    const fmt = FORMAT_OPTIONS.find((f) => f.value === selectedType);
    activeChips.push({
      key: 'type',
      label: fmt ? fmt.label : selectedType,
      onRemove: () => setSelectedType('all'),
    });
  }
  if (selectedPublisher !== 'all') {
    const pub = PUBLISHERS.find((p) => p.slug === selectedPublisher);
    activeChips.push({
      key: 'publisher',
      label: pub ? pub.name : selectedPublisher,
      onRemove: () => setSelectedPublisher('all'),
    });
  }
  if (filterOriginals) activeChips.push({ key: 'originals', label: 'Original', onRemove: () => setFilterOriginals(false) });
  if (featuredOnly) activeChips.push({ key: 'featured', label: 'Featured', onRemove: () => setFeaturedOnly(false) });

  const selectClasses =
    'appearance-none h-11 pl-3 pr-9 rounded-xl bg-page border border-line text-xs font-bold text-ink cursor-pointer focus:outline-hidden focus:border-cta focus:ring-2 focus:ring-cta/25 transition-colors duration-200';

  const desktopSelectClasses =
    'appearance-none h-10 pl-3 pr-9 rounded-xl bg-page border border-line text-xs font-bold text-ink cursor-pointer focus:outline-hidden focus:border-cta focus:ring-2 focus:ring-cta/25 transition-colors duration-200';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-8">
      {/* ---------- Compact editorial hero ---------- */}
      <div className="max-w-2xl mb-6 sm:mb-8">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-mut mb-2.5">
          <span aria-hidden="true" className="w-6 h-px bg-cta" />
          Discover the Catalog
        </p>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight leading-tight">
          Explore the AppMintly Catalog
        </h1>
        <p className="text-sm text-mut mt-2 leading-relaxed">
          Find useful apps, PWAs, tools and utilities — all in one place.
        </p>
      </div>

      {/* ---------- Dominant smart search ---------- */}
      <div className="relative mb-3.5">
        <Search
          className="w-5 h-5 text-mut absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the AppMintly catalog"
          placeholder="Search apps, tools, PWAs, games…"
          className="w-full h-14 sm:h-16 rounded-2xl bg-card border border-line focus:border-cta focus:ring-[3px] focus:ring-cta/20 pl-12 pr-12 text-sm sm:text-base text-ink placeholder-mut shadow-2xs transition-[border-color,box-shadow] duration-200 focus:outline-hidden [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full text-mut hover:text-ink hover:bg-page transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
            aria-label="Clear search query"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="hidden md:inline-flex absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-page border border-line text-[11px] font-bold text-mut pointer-events-none"
          >
            /
          </kbd>
        )}
      </div>

      {/* ---------- Suggested searches (real catalog topics, max 5) ---------- */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3.5">
        <span className="text-xs font-bold text-mut mr-0.5">Try:</span>
        {SUGGESTED_SEARCHES.map((term) => (
          <button
            key={term}
            onClick={() => setQuery(term)}
            className="px-3 py-1.5 rounded-full bg-card border border-line text-xs font-semibold text-mut hover:text-ink hover:border-ink/25 transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
          >
            {term}
          </button>
        ))}
      </div>

      {/* ---------- Quick discovery shortcuts ---------- */}
      <div className="flex items-center gap-1.5 flex-wrap mb-5">
        <button
          onClick={() => setFeaturedOnly((v) => !v)}
          aria-pressed={featuredOnly}
          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-xs font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
            featuredOnly
              ? 'bg-[#F7B928]/15 border-[#F7B928]/40 text-[#8C6000] dark:text-[#F7B928]'
              : 'bg-card border-line text-mut hover:text-ink hover:border-ink/25'
          }`}
        >
          <Star className="w-3.5 h-3.5" aria-hidden="true" />
          Featured
        </button>
        <button
          onClick={() => setSortBy('newest')}
          aria-pressed={sortBy === 'newest'}
          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-xs font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
            sortBy === 'newest'
              ? 'bg-cta/12 border-cta/40 text-cta'
              : 'bg-card border-line text-mut hover:text-ink hover:border-ink/25'
          }`}
        >
          <Flame className="w-3.5 h-3.5" aria-hidden="true" />
          New
        </button>
        <button
          onClick={() => setFilterOriginals((v) => !v)}
          aria-pressed={filterOriginals}
          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-xs font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
            filterOriginals
              ? 'bg-cta/12 border-cta/40 text-cta'
              : 'bg-card border-line text-mut hover:text-ink hover:border-ink/25'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Originals
        </button>
        <button
          onClick={() => setSelectedCategory(selectedCategory === 'tools' ? 'all' : 'tools')}
          aria-pressed={selectedCategory === 'tools'}
          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-xs font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
            selectedCategory === 'tools'
              ? 'bg-cta/12 border-cta/40 text-cta'
              : 'bg-card border-line text-mut hover:text-ink hover:border-ink/25'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
          Tools
        </button>
      </div>

      {/* ---------- Mobile compact toolbar (replaces the old large filter panel) ---------- */}
      <div className="md:hidden flex items-center gap-2 mb-4">
        <button
          onClick={openSheet}
          className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-card border border-line text-sm font-bold text-ink active:scale-[0.98] transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal className="w-4 h-4 text-cta" aria-hidden="true" />
          Filters
          {activeChips.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-cta text-[10px] font-bold text-white">
              {activeChips.length}
            </span>
          )}
        </button>
        <div className="relative shrink-0">
          <select
            aria-label="Sort apps"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={selectClasses}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
        <span className="h-11 px-3 inline-flex items-center rounded-xl bg-cta/10 text-cta text-sm font-bold shrink-0" aria-live="polite">
          {filteredApps.length} {filteredApps.length === 1 ? 'app' : 'apps'}
        </span>
      </div>

      {/* ---------- Desktop compact filter toolbar ---------- */}
      <div className="hidden md:flex items-center gap-2 flex-wrap bg-card border border-line rounded-2xl p-2.5 shadow-2xs mb-4">
        <div className="relative">
          <select
            aria-label="Filter by format"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className={desktopSelectClasses}
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
        <div className="relative">
          <select
            aria-label="Filter by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={desktopSelectClasses}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
        <div className="relative">
          <select
            aria-label="Filter by publisher"
            value={selectedPublisher}
            onChange={(e) => setSelectedPublisher(e.target.value)}
            className={desktopSelectClasses}
          >
            <option value="all">All Publishers</option>
            {PUBLISHERS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}{p.verified ? ' ✓' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
        <button
          onClick={() => setFilterOriginals((v) => !v)}
          aria-pressed={filterOriginals}
          className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border text-xs font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
            filterOriginals
              ? 'bg-cta/12 border-cta/40 text-cta'
              : 'bg-page border-line text-ink hover:border-ink/25'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#F7B928]" aria-hidden="true" />
          Originals
        </button>
        <div className="relative ml-auto">
          <select
            aria-label="Sort apps"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={desktopSelectClasses}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* ---------- Active filter chips ---------- */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-xs font-bold text-mut mr-0.5">Filters:</span>
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-cta/30 bg-cta/10 pl-3 py-1 text-xs font-bold text-ink"
            >
              <span className="max-w-40 truncate">{chip.label}</span>
              <button
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-mut hover:text-ink hover:bg-page transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-1 text-xs font-bold text-mut hover:text-cta underline underline-offset-2 decoration-line hover:decoration-cta transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 rounded"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ---------- Result header (dynamic count) ---------- */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
        <p className="text-sm text-mut">
          <span className="hidden sm:inline">
            <span className="font-black text-ink">{filteredApps.length}</span>{' '}
            {filteredApps.length === 1 ? 'app' : 'apps'} ·{' '}
          </span>
          Curated from the AppMintly catalog
        </p>
      </div>

      {/* ---------- Results grid / skeleton / empty states ---------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5" aria-label="Loading catalog">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 sm:p-5 rounded-2xl bg-card border border-line animate-pulse" aria-hidden="true">
              <div className="flex items-center justify-between min-h-11 mb-3">
                <div className="h-4 w-16 rounded bg-line/60" />
                <div className="h-6 w-6 rounded-full bg-line/60" />
              </div>
              <div className="flex gap-4 mb-3">
                <div className="w-20 h-20 rounded-2xl bg-line/60 shrink-0" />
                <div className="flex-1 pt-2 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-line/60" />
                  <div className="h-3 w-1/2 rounded bg-line/60" />
                  <div className="h-3 w-1/3 rounded bg-line/60" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-line/40 mb-3" />
              <div className="pt-3 border-t border-line/60 flex items-center justify-between">
                <div className="h-3 w-24 rounded bg-line/60" />
                <div className="h-9 w-24 rounded-full bg-line/60" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredApps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {filteredApps.map((app) => (
            <AppCard key={app.id} app={app} variant="explore" />
          ))}
        </div>
      ) : hasQuery ? (
        /* Empty search state */
        <div className="text-center py-16 sm:py-24 px-4 bg-card rounded-2xl border border-line">
          <div className="w-14 h-14 rounded-2xl border border-line bg-page text-mut flex items-center justify-center mx-auto mb-4">
            <SearchX className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">No apps found</h2>
          <p className="text-xs sm:text-sm text-mut mt-1.5 max-w-sm mx-auto">
            Try another search or browse categories.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2.5 flex-wrap">
            <button
              onClick={() => setQuery('')}
              className="btn-cta h-11 px-6 rounded-full text-xs font-bold cursor-pointer"
            >
              Clear Search
            </button>
            <Link
              href="/categories"
              className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-line bg-card text-ink text-xs font-bold hover:border-ink/25 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
            >
              Browse Categories
            </Link>
          </div>
        </div>
      ) : (
        /* Empty filter state */
        <div className="text-center py-16 sm:py-24 px-4 bg-card rounded-2xl border border-line">
          <div className="w-14 h-14 rounded-2xl border border-line bg-page text-mut flex items-center justify-center mx-auto mb-4">
            <FilterX className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">No matching apps</h2>
          <p className="text-xs sm:text-sm text-mut mt-1.5 max-w-sm mx-auto">
            Try removing a filter{categoriesWithResults.length > 0 ? ' or browse a category with apps.' : '.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={clearAllFilters}
              className="btn-cta h-11 px-6 rounded-full text-xs font-bold cursor-pointer"
            >
              Clear Filters
            </button>
            {categoriesWithResults
              .filter((c) => c.toLowerCase() !== selectedCategory.toLowerCase())
              .slice(0, 4)
              .map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    /* Use the lowercase slug so the quick-discovery chip and
                       desktop category select reflect the pressed state. */
                    setSelectedCategory(c.toLowerCase());
                    setFeaturedOnly(false);
                    setFilterOriginals(false);
                  }}
                  className="inline-flex items-center justify-center h-11 px-5 rounded-full border border-line bg-card text-ink text-xs font-bold hover:border-cta/50 hover:text-cta transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 cursor-pointer"
                >
                  {c}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ---------- Mobile filter bottom sheet ---------- */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filter apps">
          <button
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-inkbg/60 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 cursor-default"
          />
          <div className="absolute inset-x-0 bottom-0 bg-card border-t border-line rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:duration-300">
            {/* Sheet header */}
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-base font-bold text-ink">Filters</h2>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="h-11 w-11 flex items-center justify-center rounded-full text-mut hover:text-ink hover:bg-page transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* FORMAT */}
            <fieldset className="mb-5">
              <legend className="text-[11px] font-bold uppercase tracking-wider text-mut mb-2.5">Format</legend>
              <div className="flex flex-wrap gap-1.5">
                {SHEET_FORMATS.map((f) => {
                  const active = draft.type === f.value;
                  return (
                    <button
                      key={f.value}
                      onClick={() => setDraft((d) => ({ ...d, type: f.value }))}
                      aria-pressed={active}
                      className={`h-11 px-4 rounded-xl border text-sm font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
                        active
                          ? 'bg-cta/12 border-cta/45 text-cta'
                          : 'bg-page border-line text-ink hover:border-ink/25'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* CATEGORY */}
            <div className="mb-5">
              <label htmlFor="sheet-category" className="block text-[11px] font-bold uppercase tracking-wider text-mut mb-2.5">
                Category
              </label>
              <div className="relative">
                <select
                  id="sheet-category"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className={`${selectClasses} w-full`}
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            {/* PUBLISHER */}
            <div className="mb-5">
              <label htmlFor="sheet-publisher" className="block text-[11px] font-bold uppercase tracking-wider text-mut mb-2.5">
                Publisher
              </label>
              <div className="relative">
                <select
                  id="sheet-publisher"
                  value={draft.publisher}
                  onChange={(e) => setDraft((d) => ({ ...d, publisher: e.target.value }))}
                  className={`${selectClasses} w-full`}
                >
                  <option value="all">All Publishers</option>
                  {PUBLISHERS.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}{p.verified ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-mut absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            {/* OPTION: Originals Only */}
            <div className="mb-5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-mut mb-2.5">Option</span>
              <button
                onClick={() => setDraft((d) => ({ ...d, originals: !d.originals }))}
                aria-pressed={draft.originals}
                className="w-full flex items-center justify-between gap-3 min-h-11 px-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 rounded-xl"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Sparkles className="w-4 h-4 text-[#F7B928]" aria-hidden="true" />
                  Originals Only
                </span>
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 shrink-0 ${
                    draft.originals ? 'bg-cta' : 'bg-line'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-2xs transition-all duration-200 ${
                      draft.originals ? 'left-[1.375rem]' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* SORT */}
            <fieldset className="mb-6">
              <legend className="text-[11px] font-bold uppercase tracking-wider text-mut mb-2.5">Sort</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {SORT_OPTIONS.map((o) => {
                  const active = draft.sort === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => setDraft((d) => ({ ...d, sort: o.value }))}
                      aria-pressed={active}
                      className={`h-11 px-3 rounded-xl border text-xs font-bold transition-colors duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50 ${
                        active
                          ? 'bg-cta/12 border-cta/45 text-cta'
                          : 'bg-page border-line text-ink hover:border-ink/25'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Sheet actions */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={clearSheetDraft}
                className="flex-1 h-12 rounded-full border border-line bg-page text-ink text-sm font-bold hover:border-ink/25 transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cta/50"
              >
                Reset
              </button>
              <button
                ref={sheetApplyRef}
                onClick={applyDraft}
                className="flex-1 h-12 rounded-full btn-cta text-sm font-bold cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-6 py-12 text-sm text-mut">Loading catalog...</div>}>
      <ExploreContent />
    </Suspense>
  );
}
