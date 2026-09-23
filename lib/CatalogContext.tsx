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
  publishApp: (app: Partial<AppItem>) => Promise<{ success: boolean; app?: AppItem; message?: string }>;
  saveCatalog: (newCatalog: AppItem[]) => Promise<boolean>;
  deleteApp: (id: string) => Promise<boolean>;
  isLoading: boolean;
  demoMode: boolean;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

const STORAGE_KEY = 'appforge_canonical_catalog';

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Always initialize with DEFAULT_APPS to ensure identical SSR & initial client render
  const [catalog, setCatalog] = useState<AppItem[]>(DEFAULT_APPS);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync with /api/catalog
  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data && Array.isArray(data.apps) ? data.apps : null);
        if (items && items.length > 0) {
          const normalized = items.map(normalizeApp);
          setCatalog(normalized);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            window.dispatchEvent(new CustomEvent('appforge_catalog_updated'));
          }
        }
      }
    } catch (err) {
      console.error('[CatalogContext] Failed to fetch catalog from server:', err);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    // Fetch fresh canonical catalog asynchronously in background
    fetch('/api/catalog')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled || !data) return;
        const items = Array.isArray(data) ? data : (data && Array.isArray(data.apps) ? data.apps : null);
        if (items && items.length > 0) {
          const normalized = items.map(normalizeApp);
          setCatalog(normalized);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          }
        }
      })
      .catch((err) => {
        console.error('[CatalogContext] Failed to sync catalog:', err);
      });

    // Listen for custom catalog updates (e.g. from publisher or other components)
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

  // Publish or update an application
  const publishApp = useCallback(
    async (appData: Partial<AppItem>) => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appData),
        });

        const data = await res.json();

        if (res.ok && data.success && data.app) {
          const updatedApp = normalizeApp(data.app);

          setCatalog((prev) => {
            const next = [...prev];
            const idx = next.findIndex(
              (a) =>
                a.id.toLowerCase() === updatedApp.id.toLowerCase() ||
                a.slug.toLowerCase() === updatedApp.slug.toLowerCase()
            );
            if (idx >= 0) {
              next[idx] = updatedApp;
            } else {
              next.unshift(updatedApp);
            }
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              window.dispatchEvent(new CustomEvent('appforge_catalog_updated'));
            }
            return next;
          });

          return { success: true, app: updatedApp, message: data.message };
        } else {
          return { success: false, message: data.error || 'Failed to publish application' };
        }
      } catch (err: any) {
        console.error('[CatalogContext] Publish error:', err);
        return { success: false, message: err?.message || 'Network error publishing app' };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Replace/save the entire catalog
  const saveCatalog = useCallback(async (newCatalog: AppItem[]) => {
    setIsLoading(true);
    try {
      const normalized = newCatalog.map(normalizeApp);
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apps: normalized }),
      });

      if (res.ok) {
        setCatalog(normalized);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          window.dispatchEvent(new CustomEvent('appforge_catalog_updated'));
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[CatalogContext] Save catalog error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteApp = useCallback(
    async (id: string): Promise<boolean> => {
      const updated = catalog.filter((a) => a.id !== id && a.slug !== id);
      return await saveCatalog(updated);
    },
    [catalog, saveCatalog]
  );

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
      publishApp,
      saveCatalog,
      deleteApp,
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
      publishApp,
      saveCatalog,
      deleteApp,
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
      publishApp: async () => ({ success: false, message: 'CatalogProvider not mounted' }),
      saveCatalog: async () => false,
      deleteApp: async () => false,
      isLoading: false,
      demoMode: APPFORGE_DEMO_MODE,
    };
  }
  return context;
}
