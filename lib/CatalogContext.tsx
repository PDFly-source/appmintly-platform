'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  AppItem,
  APPS as DEFAULT_APPS,
  getPublishedApps,
  isValidPublicApp,
  getFeaturedApps,
  getLatestApps,
  getNewApps,
  getAppsByCategory,
  getAppsByType,
  searchPublishedApps,
  getAppBySlug as getSelectorAppBySlug,
  normalizeApp,
  normalizeStatus,
} from '@/data/apps';
import { APPFORGE_DEMO_MODE } from '@/lib/config';
import { isHttpsOrRepoAsset, PROTECTED_APP_FIELDS } from '@/lib/catalog-validation';

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
  /** Discard all device-local session edits and re-sync the canonical catalog. */
  clearSessionEdits: () => Promise<void>;
  /** True when device-local session edits exist (previews on this device). */
  hasSessionEdits: boolean;
  publishApp: (
    app: Partial<AppItem>
  ) => Promise<{ success: boolean; app?: AppItem; message?: string; persisted?: 'server' | 'session' }>;
  saveCatalog: (newCatalog: AppItem[]) => Promise<boolean>;
  deleteApp: (id: string) => Promise<boolean>;
  isLoading: boolean;
  demoMode: boolean;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

const STORAGE_KEY = 'appforge_canonical_catalog';
// Device-local session edits overlay (honest-save). Full app records keyed
// by lowercase slug, merged over the canonical catalog at load so a session
// save survives a page refresh on this device. Never a production publish.
const SESSION_EDITS_KEY = 'appmintly_session_edits_v1';

function readSessionEdits(): Record<string, Partial<AppItem>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SESSION_EDITS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}


// Phase 10.5: protected release fields — the released `apk` object and its
// top-level mirrors (version, previousVersion, size, apkUrl) — are
// production infrastructure. A listing/session edit must NEVER carry them:
// the authoritative catalog record is the only source of release truth.
// Returns a shallow copy of `edit` with those keys removed.
function stripProtectedReleaseFields<T extends Record<string, unknown>>(edit: T): Partial<T> {
  const rest: Record<string, unknown> = { ...edit };
  delete rest.apk;
  for (const f of PROTECTED_APP_FIELDS) delete rest[f];
  return rest as Partial<T>;
}

function writeSessionEdit(app: AppItem, baseline?: AppItem | null) {
  if (typeof window === 'undefined') return;
  const edits = readSessionEdits();
  let record: Record<string, unknown> = app as unknown as Record<string, unknown>;
  // Phase 10.4: a data:/blob: icon must NEVER be persisted into a session
  // edit (it would be re-applied over every fresh catalog load). Drop the
  // icon key from the edit so the canonical catalog icon survives the merge.
  if (typeof record.icon === 'string' && !isHttpsOrRepoAsset(record.icon)) {
    const { icon, ...rest } = record;
    record = rest;
  }
  // Phase 10.5: when the app has a released APK (authoritative baseline),
  // the session edit must never carry protected release fields. A stale
  // draft apk object (e.g. a pre-release placeholder with a wrong
  // fileSizeBytes) stored here would override the authoritative release
  // metadata on every merge and turn every subsequent publish into a
  // protected-field conflict. The edit keeps ONLY editable listing fields;
  // release metadata always comes from the canonical catalog.
  if (baseline?.apk?.enabled && baseline.apk.verified) {
    record = stripProtectedReleaseFields(record);
  }
  edits[(app.slug || app.id).toLowerCase()] = record as Partial<AppItem>;
  window.localStorage.setItem(SESSION_EDITS_KEY, JSON.stringify(edits));
}

/** Merge the device-local session edits overlay on top of a catalog array. */
function mergeSessionEdits(items: AppItem[]): AppItem[] {
  if (typeof window === 'undefined') return items;
  const edits = readSessionEdits();
  if (Object.keys(edits).length === 0) return items;
  return items.map((a) => {
    const edit = edits[(a.slug || a.id).toLowerCase()] as unknown as Record<string, unknown> | undefined;
    if (!edit) return a;
    // Phase 10.4: an edit carrying a data:/blob:/invalid icon would
    // reintroduce the old base64 value over the fixed canonical catalog.
    // Invalid icon values in edits are dropped so the catalog's canonical
    // icon is preserved. (writeSessionEdit no longer produces these; this
    // also cleans legacy edits already stored on devices.)
    let overlay: Record<string, unknown> = edit;
    if (typeof overlay.icon === 'string' && !isHttpsOrRepoAsset(overlay.icon)) {
      const { icon, ...rest } = overlay;
      overlay = rest;
    }
    // Phase 10.5: legacy edits may carry a stale `apk` object (e.g. saved
    // from a pre-release draft with wrong fileSizeBytes/sha) that would
    // silently override the AUTHORITATIVE release metadata on every load
    // and block publishing with "protected APK field cannot be changed".
    // Protected release fields are dropped from the overlay so the
    // canonical catalog values always win — a reload can never
    // reintroduce the stale values.
    if (a.apk?.enabled && a.apk.verified) {
      overlay = stripProtectedReleaseFields(overlay) as Record<string, unknown>;
    }
    return { ...a, ...overlay };
  });
}

import { BASE_PATH, apiUrl } from '@/lib/api-path';

const API_CATALOG_URL = apiUrl('/api/catalog');
const STATIC_CATALOG_URL = `${BASE_PATH}/data/apps.json`;

/**
 * Fetch the canonical catalog. Prefers the live API (server deployments);
 * falls back to the static /data/apps.json snapshot shipped with the
 * static GitHub Pages build.
 */
async function fetchCatalogItems(): Promise<AppItem[] | null> {
  try {
    // cache: 'no-cache' always revalidates against the origin (ETag/304)
    // so the Publisher Console reflects the ACTUAL canonical catalog, not a
    // stale HTTP-cache entry that can survive a fresh production deploy.
    const res = await fetch(API_CATALOG_URL, { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data) ? data : data && Array.isArray(data.apps) ? data.apps : null;
      if (items && items.length > 0) return items;
    }
  } catch {
    // API unavailable (static hosting) — fall through to static snapshot
  }
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
  const [hasSessionEdits, setHasSessionEdits] = useState<boolean>(false);

  // Sync with /api/catalog
  const refreshCatalog = useCallback(async () => {
    try {
      const items = await fetchCatalogItems();
      if (items && items.length > 0) {
        const normalized = items.map(normalizeApp);
        // Session edits (device-local preview) survive a refresh; they are
        // merged over the canonical catalog and are never a production publish.
        const merged = mergeSessionEdits(normalized);
        setHasSessionEdits(typeof window !== 'undefined' && Object.keys(readSessionEdits()).length > 0);
        setCatalog(merged);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          window.dispatchEvent(new CustomEvent('appforge_catalog_updated'));
        }
      }
    } catch (err) {
      console.error('[CatalogContext] Failed to fetch catalog:', err);
    }
  }, []);

  /** Discard all device-local session edits and re-sync the canonical catalog. */
  const clearSessionEdits = useCallback(async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_EDITS_KEY);
    }
    setHasSessionEdits(false);
    await refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    let isCancelled = false;

    // Fetch fresh canonical catalog asynchronously in background
    fetchCatalogItems()
      .then((items) => {
        if (isCancelled || !items) return;
        const normalized = items.map(normalizeApp);
        const merged = mergeSessionEdits(normalized);
        setHasSessionEdits(Object.keys(readSessionEdits()).length > 0);
        setCatalog(merged);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
            setCatalog(mergeSessionEdits(parsed.map(normalizeApp)));
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
  /**
   * Static-hosting fallback for the publish API.
   *
   * AppMintly production runs on GitHub Pages static export, where no
   * server exists to write data/apps.json. In that case the edit is
   * applied to the browser's working-session catalog (localStorage +
   * in-memory state) so the change previews truthfully across Home,
   * Explore, Categories and Search — but it is NOT a permanent
   * production publish. The caller is told this via
   * `persisted: 'session'` so the UI can present the real state.
   * No credentials are ever exposed to the browser.
   */
  const applySessionPublish = useCallback(
    async (appData: Partial<AppItem>, reason: string): Promise<{ success: boolean; app?: AppItem; message?: string; persisted?: 'server' | 'session' }> => {
      try {
        const updatedApp = normalizeApp({ ...appData } as AppItem);

        // Validate the resulting record before applying it anywhere
        if (!isValidPublicApp(updatedApp, APPFORGE_DEMO_MODE) && normalizeStatus(updatedApp) !== 'draft') {
          return { success: false, message: 'Validation failed: app record is incomplete' };
        }

        setCatalog((prev) => {
          const next = [...prev];
          const idx = next.findIndex(
            (a) =>
              a.id.toLowerCase() === updatedApp.id.toLowerCase() ||
              a.slug.toLowerCase() === updatedApp.slug.toLowerCase()
          );
          // Phase 10.4: a non-canonical icon (data:/blob:) never replaces
          // the canonical icon of the working-session record — the icon key
          // is dropped from the update so the previous canonical value stays.
          const iconValid = isHttpsOrRepoAsset(updatedApp.icon);
          const updatePayload: Partial<AppItem> = iconValid
            ? updatedApp
            : (() => {
                const { icon, ...rest } = updatedApp as AppItem;
                return rest as Partial<AppItem>;
              })();
          // Phase 10.5: capture the pre-update AUTHORITATIVE record — the
          // baseline that decides whether the session edit may carry
          // protected release fields (it never may, for a released APK).
          const baseline = idx >= 0 ? (next[idx] as AppItem) : null;
          if (idx >= 0) {
            next[idx] = { ...next[idx], ...updatePayload } as AppItem;
          } else {
            next.unshift(updatedApp);
          }
          if (typeof window !== 'undefined') {
            writeSessionEdit(updatedApp, baseline);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            window.dispatchEvent(new CustomEvent('appforge_catalog_updated'));
          }
          return next;
        });

        setHasSessionEdits(true);
        return {
          success: true,
          app: updatedApp,
          persisted: 'session',
          message: `${reason} — applied to your working session only`,
        };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to apply changes' };
      }
    },
    []
  );

  const publishApp = useCallback(
    async (appData: Partial<AppItem>) => {
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl('/api/publish'), {
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
          return await applySessionPublish(appData, data.error || 'Failed to publish application');
        }
      } catch (err: any) {
        console.warn('[CatalogContext] Publish API unavailable (static hosting), applying to working session:', err?.message);
        return await applySessionPublish(appData, 'Publish API unavailable');
      } finally {
        setIsLoading(false);
      }
    },
    [applySessionPublish]
  );

  // Replace/save the entire catalog
  const saveCatalog = useCallback(async (newCatalog: AppItem[]) => {
    setIsLoading(true);
    try {
      const normalized = newCatalog.map(normalizeApp);
      const res = await fetch(API_CATALOG_URL, {
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
      clearSessionEdits,
      hasSessionEdits,
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
      clearSessionEdits,
      hasSessionEdits,
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
      clearSessionEdits: async () => {},
      hasSessionEdits: false,
      publishApp: async () => ({
        success: false,
        message: 'CatalogProvider not mounted',
        persisted: undefined as 'server' | 'session' | undefined,
      }),
      saveCatalog: async () => false,
      deleteApp: async () => false,
      isLoading: false,
      demoMode: APPFORGE_DEMO_MODE,
    };
  }
  return context;
}
