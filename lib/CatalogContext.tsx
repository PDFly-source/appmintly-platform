'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  AppItem,
  APPS as DEFAULT_APPS,
  getPublishedApps,
  getFeaturedApps,
  getLatestApps,
  getNewApps,
  getAppsByCategory,
  getAppsByType,
  searchPublishedApps,
  getAppBySlug as getSelectorAppBySlug,
  normalizeApp,
} from '@/data/apps';
import { APPFORGE_DEMO_MODE } from '@/lib/config';
import { BASE_PATH } from '@/lib/api-path';

/**
 * CatalogContext — PUBLIC marketplace catalog only.
 *
 * Phase 12.1 separation: all publisher/admin machinery (device drafts,
 * session edits, publish/save/delete APIs) moved to the private Publisher
 * PWA. This context is the minimal public-safe version: it loads the
 * canonical published catalog, keeps it in sync, and exposes read-only
 * selectors for Home, Explore, Categories, Search, Library and app detail
 * pages. There is no write path on the public storefront.
 */

interface CatalogContextType {
  catalog: AppItem[];
  publishedApps: AppItem[];
  featuredApps: AppItem[];
  latestApps: AppItem[];
  newApps: AppItem[];
  getCategoryApps: (category: string) => AppItem[];
  getTypeApps: (type: string) => AppItem[];
  searchApps: (query: string) => AppItem[];
  getAppBySlug: (slug: string) => AppItem | undefined;
  refreshCatalog: () => Promise<void>;
  isLoading: boolean;
  demoMode: boolean;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

const STORAGE_KEY = 'appforge_canonical_catalog';
const STATIC_CATALOG_URL = `${BASE_PATH}/data/apps.json`;

/** Fetch the canonical catalog from the static /data/apps.json snapshot. */
async function fetchCatalogItems(): Promise<AppItem[] | null> {
  try {
    const res = await fetch(STATIC_CATALOG_URL, { cache: 'no-cache' });
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) return items;
    }
  } catch {
    // fall through
  }
  return null;
}

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Always initialize with DEFAULT_APPS to ensure identical SSR & initial client render
  const [catalog, setCatalog] = useState<AppItem[]>(DEFAULT_APPS);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Re-sync with the canonical published catalog
  const refreshCatalog = useCallback(async () => {
    try {
      const items = await fetchCatalogItems();
      if (items && items.length > 0) {
        const normalized = items.map(normalizeApp);
        setCatalog(normalized);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          window.dispatchEvent(new CustomEvent('appforge_catalog_updated'));
        }
      }
    } catch (err) {
      console.error('[CatalogContext] Failed to fetch catalog:', err);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    // Fetch fresh canonical catalog asynchronously in background
    fetchCatalogItems()
      .then((items) => {
        if (isCancelled || !items) return;
        const normalized = items.map(normalizeApp);
        setCatalog(normalized);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        }
      })
      .catch((err) => {
        console.error('[CatalogContext] Failed to sync catalog:', err);
      });

    // Listen for custom catalog updates (cross-tab sync)
    const handleUpdate = () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setCatalog(parsed.map(normalizeApp));
          }
        }
      } catch (e) {
        console.error('[CatalogContext] Error syncing catalog on update event:', e);
      }
    };

    window.addEventListener('appforge_catalog_updated', handleUpdate);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handleUpdate();
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      isCancelled = true;
      window.removeEventListener('appforge_catalog_updated', handleUpdate);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // Derived selectors reading strictly from current canonical catalog
  const publishedApps = useMemo(() => getPublishedApps(catalog, APPFORGE_DEMO_MODE), [catalog]);
  const featuredApps = useMemo(() => getFeaturedApps(catalog, APPFORGE_DEMO_MODE), [catalog]);
  const latestApps = useMemo(() => getLatestApps(catalog, undefined, APPFORGE_DEMO_MODE), [catalog]);
  const newApps = useMemo(() => getNewApps(catalog, APPFORGE_DEMO_MODE), [catalog]);

  const getCategoryApps = useCallback(
    (category: string) => getAppsByCategory(category, catalog, APPFORGE_DEMO_MODE),
    [catalog]
  );

  const getTypeApps = useCallback(
    (type: string) => getAppsByType(type, catalog, APPFORGE_DEMO_MODE),
    [catalog]
  );

  const searchApps = useCallback(
    (query: string) => searchPublishedApps(query, catalog, APPFORGE_DEMO_MODE),
    [catalog]
  );

  const getAppBySlug = useCallback(
    (slug: string) => getSelectorAppBySlug(slug, catalog, APPFORGE_DEMO_MODE),
    [catalog]
  );

  const value = useMemo(
    () => ({
      catalog,
      publishedApps,
      featuredApps,
      latestApps,
      newApps,
      getCategoryApps,
      getTypeApps,
      searchApps,
      getAppBySlug,
      refreshCatalog,
      isLoading,
      demoMode: APPFORGE_DEMO_MODE,
    }),
    [
      catalog,
      publishedApps,
      featuredApps,
      latestApps,
      newApps,
      getCategoryApps,
      getTypeApps,
      searchApps,
      getAppBySlug,
      refreshCatalog,
      isLoading,
    ]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) {
    // Graceful fallback for non-wrapped components or SSR
    return {
      catalog: DEFAULT_APPS,
      publishedApps: getPublishedApps(DEFAULT_APPS, APPFORGE_DEMO_MODE),
      featuredApps: getFeaturedApps(DEFAULT_APPS, APPFORGE_DEMO_MODE),
      latestApps: getLatestApps(DEFAULT_APPS, undefined, APPFORGE_DEMO_MODE),
      newApps: getNewApps(DEFAULT_APPS, APPFORGE_DEMO_MODE),
      getCategoryApps: (cat: string) => getAppsByCategory(cat, DEFAULT_APPS, APPFORGE_DEMO_MODE),
      getTypeApps: (type: string) => getAppsByType(type, DEFAULT_APPS, APPFORGE_DEMO_MODE),
      searchApps: (q: string) => searchPublishedApps(q, DEFAULT_APPS, APPFORGE_DEMO_MODE),
      getAppBySlug: (s: string) => getSelectorAppBySlug(s, DEFAULT_APPS, APPFORGE_DEMO_MODE),
      refreshCatalog: async () => {},
      isLoading: false,
      demoMode: APPFORGE_DEMO_MODE,
    };
  }
  return context;
}
