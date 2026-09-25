import rawApps from './apps.json';
import { APPFORGE_DEMO_MODE, NEW_APP_THRESHOLD_DAYS } from '@/lib/config';

export type AppType =
  | 'PWA'
  | 'Web App'
  | 'Website'
  | 'Android APK'
  | 'Web Game'
  | 'Tool'
  | string;

export interface PwaMetadata {
  detected: boolean;
  installable: boolean | null;
  manifestDetected: boolean;
  serviceWorkerDetected: boolean | null;
  statusSummary?: 'PWA Ready' | 'PWA Metadata Found' | 'Web App Only' | 'Unable to Verify';
}

export interface ApkMetadata {
  enabled: boolean;
  buildMode: 'twa' | 'webview';
  packageId: string;
  versionName: string;
  versionCode: number;
  fileName?: string;
  apkUrl: string;
  sha256: string;
  fileSizeBytes: number;
  generatedAt: string;
  buildStatus?: string;
  buildId?: string;
  authorized?: boolean;
  // Production release-pipeline attributes. These describe the verified
  // production release and are NEVER editable from the publisher console.
  releaseTag?: string;
  releaseDate?: string;
  platform?: string;
  architecture?: string;
  downloadAvailable?: boolean;
  verified?: boolean;
}

export interface AppItem {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  developer: string;
  developerSlug?: string;
  type: AppType;
  category: string;
  description: string;
  shortDescription: string;
  icon: string;
  screenshots: string[];
  banner?: string;
  url?: string;
  launchUrl?: string;
  webUrl?: string;
  pwaUrl?: string;
  apkUrl?: string;
  playStoreUrl?: string;
  appStoreUrl?: string;
  version: string;
  previousVersion?: string;
  releaseDate: string;
  publishedAt?: string;
  lastUpdated?: string;
  updatedAt?: string;
  themeColor?: string;
  backgroundColor?: string;
  manifestUrl?: string;
  startUrl?: string;
  scope?: string;
  pwa?: PwaMetadata;
  features: string[];
  tags: string[];
  releaseNotes?: string[];
  changelog: string[];
  featured: boolean;
  original: boolean;
  published: boolean;
  isDemo?: boolean;
  size?: string;
  platform?: string[];
  apk?: ApkMetadata;
  status?: 'published' | 'draft' | 'archived' | 'Published' | 'Draft' | 'Archived';
  downloadCount?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
}

/**
 * Normalizes app status into lower-case 'published' | 'draft' | 'archived'
 */
export function normalizeStatus(app: Partial<AppItem>): 'published' | 'draft' | 'archived' {
  if (app.status) {
    const s = String(app.status).toLowerCase();
    if (s === 'published') return 'published';
    if (s === 'archived') return 'archived';
    return 'draft';
  }
  if (app.published === true) return 'published';
  return 'draft';
}

/**
 * Validates whether an app record is complete and eligible for public display.
 * Invalid or incomplete records will be skipped with a developer log.
 */
export function isValidPublicApp(app: AppItem, allowDemo: boolean = APPFORGE_DEMO_MODE): boolean {
  if (!app) return false;

  const name = typeof app.name === 'string' ? app.name.trim() : '';
  const slug = typeof app.slug === 'string' ? app.slug.trim() : '';
  const launchUrl =
    (app.launchUrl && typeof app.launchUrl === 'string' && app.launchUrl.trim()) ||
    (app.url && typeof app.url === 'string' && app.url.trim()) ||
    (app.webUrl && typeof app.webUrl === 'string' && app.webUrl.trim()) ||
    (app.pwaUrl && typeof app.pwaUrl === 'string' && app.pwaUrl.trim()) ||
    (app.apkUrl && typeof app.apkUrl === 'string' && app.apkUrl.trim());
  const category = typeof app.category === 'string' ? app.category.trim() : '';
  const status = normalizeStatus(app);

  if (!name) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AppMintly Catalog] Validation failed: app missing name', app.id);
    }
    return false;
  }

  if (!slug) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AppMintly Catalog] Validation failed: app missing slug', app.name);
    }
    return false;
  }

  if (!launchUrl) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AppMintly Catalog] Validation failed: app missing valid launch URL', app.name);
    }
    return false;
  }

  if (!category) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AppMintly Catalog] Validation failed: app missing category', app.name);
    }
    return false;
  }

  if (status !== 'published') {
    return false;
  }

  // Filter out demo applications unless demo mode is explicitly enabled
  if (!allowDemo && app.isDemo === true) {
    return false;
  }

  return true;
}

/**
 * Derives whether an app is "New" based on publication date or release date.
 */
export function isNewApp(app: AppItem): boolean {
  const dateStr = app.publishedAt || app.releaseDate || app.lastUpdated || app.updatedAt;
  if (!dateStr) return false;

  const pubDate = new Date(dateStr);
  if (isNaN(pubDate.getTime())) return false;

  const now = new Date();
  const diffTime = Math.abs(now.getTime() - pubDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays <= NEW_APP_THRESHOLD_DAYS;
}

/**
 * Normalizes an app item to ensure all fields are consistently shaped
 */
export function normalizeApp(raw: any): AppItem {
  const normStatus = normalizeStatus(raw);
  return {
    ...raw,
    id: raw.id || raw.slug,
    slug: raw.slug || raw.id,
    status: normStatus === 'published' ? 'Published' : normStatus === 'archived' ? 'Archived' : 'Draft',
    published: normStatus === 'published',
    url: raw.url || raw.launchUrl || raw.webUrl || raw.pwaUrl || '',
    launchUrl: raw.launchUrl || raw.url || raw.webUrl || raw.pwaUrl || '',
    webUrl: raw.webUrl || raw.url || raw.launchUrl || '',
    platform: raw.platform || (raw.type === 'Android APK' ? ['Android'] : ['Web Browser', 'Desktop', 'Mobile']),
    features: Array.isArray(raw.features) ? raw.features : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots : [],
    changelog: Array.isArray(raw.changelog) ? raw.changelog : [],
  };
}

// Authoritative base catalog loaded directly from version-controlled apps.json
export const APPS: AppItem[] = (rawApps as unknown as any[]).map(normalizeApp);

/**
 * Get all published apps that pass public validation
 */
export function getPublishedApps(catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  const source = catalog && catalog.length > 0 ? catalog : APPS;
  return source.filter((app) => isValidPublicApp(app, allowDemo));
}

/**
 * Get featured apps.
 * If no explicitly featured apps are present, falls back to published apps sorted by updatedAt DESC.
 */
export function getFeaturedApps(catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  // Phase 10.6 (permanent Featured fix): Featured is EXCLUSIVELY data-driven.
  // A record enters the Featured carousel only when it is published AND
  // featured === true in the canonical catalog. There is NO fallback to
  // "latest published apps" — a previously-featured app must never appear
  // just because nothing is featured. When no app is featured the result is
  // an empty list and the UI shows its explicit empty state.
  const published = getPublishedApps(catalog, allowDemo);
  return published
    .filter((a) => a.featured === true)
    .sort((a, b) => {
      // Deterministic order: most recently updated first, then by name —
      // identical catalog input always produces an identical carousel.
      const dateA = new Date(a.lastUpdated || a.updatedAt || a.releaseDate || 0).getTime();
      const dateB = new Date(b.lastUpdated || b.updatedAt || b.releaseDate || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Get latest published applications sorted by publication / update date descending
 */
export function getLatestApps(catalog?: AppItem[], limit?: number, allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  const published = getPublishedApps(catalog, allowDemo);
  const sorted = [...published].sort((a, b) => {
    const dateA = new Date(a.lastUpdated || a.updatedAt || a.releaseDate || 0).getTime();
    const dateB = new Date(b.lastUpdated || b.updatedAt || b.releaseDate || 0).getTime();
    return dateB - dateA;
  });

  return typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
}

/**
 * Get apps marked or derived as New
 */
export function getNewApps(catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  return getPublishedApps(catalog, allowDemo).filter((a) => isNewApp(a));
}

/**
 * Get published apps by category (matches category name or slug case-insensitively)
 */
export function getAppsByCategory(category: string, catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  if (!category || category === 'all') return getPublishedApps(catalog, allowDemo);
  const catLower = category.toLowerCase().trim();

  return getPublishedApps(catalog, allowDemo).filter((a) => {
    return (
      a.category.toLowerCase().trim() === catLower ||
      a.category.toLowerCase().replace(/\s+/g, '-') === catLower
    );
  });
}

/**
 * Get published apps by type (e.g. 'Web App', 'PWA', 'Android APK', 'Tool', 'Web Game')
 */
export function getAppsByType(type: string, catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  if (!type || type === 'all') return getPublishedApps(catalog, allowDemo);
  const typeLower = type.toLowerCase().trim();

  return getPublishedApps(catalog, allowDemo).filter((a) => {
    const appTypeLower = a.type.toLowerCase().trim();
    if (appTypeLower === typeLower) return true;
    if (typeLower === 'web_app' && (appTypeLower === 'web app' || appTypeLower === 'pwa')) return true;
    if (typeLower === 'game' && (appTypeLower === 'web game' || appTypeLower === 'game')) return true;
    return false;
  });
}

/**
 * Search published apps by query across name, developer, shortDescription, description, category, tags, and features
 */
export function searchPublishedApps(query: string, catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  const published = getPublishedApps(catalog, allowDemo);
  const q = query.trim().toLowerCase();
  if (!q) return published;

  return published.filter((app) => {
    const inName = app.name.toLowerCase().includes(q);
    const inShortName = app.shortName ? app.shortName.toLowerCase().includes(q) : false;
    const inDesc = app.description ? app.description.toLowerCase().includes(q) : false;
    const inShortDesc = app.shortDescription ? app.shortDescription.toLowerCase().includes(q) : false;
    const inDev = app.developer ? app.developer.toLowerCase().includes(q) : false;
    const inCat = app.category ? app.category.toLowerCase().includes(q) : false;
    const inType = app.type ? app.type.toLowerCase().includes(q) : false;
    const inTags = Array.isArray(app.tags) && app.tags.some((t) => t.toLowerCase().includes(q));
    const inFeatures = Array.isArray(app.features) && app.features.some((f) => f.toLowerCase().includes(q));

    return inName || inShortName || inDesc || inShortDesc || inDev || inCat || inType || inTags || inFeatures;
  });
}

/**
 * Get app by slug or ID from published apps (or full catalog if specified)
 */
export function getAppBySlug(slug: string, catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem | undefined {
  if (!slug) return undefined;
  const s = slug.toLowerCase().trim();
  // First check in published apps
  const published = getPublishedApps(catalog, allowDemo);
  const found = published.find((a) => a.slug.toLowerCase() === s || a.id.toLowerCase() === s);
  if (found) return found;

  // Fallback to full catalog (e.g. for previewing in publisher)
  const source = catalog && catalog.length > 0 ? catalog : APPS;
  return source.find((a) => a.slug.toLowerCase() === s || a.id.toLowerCase() === s);
}

/**
 * Get total real published catalog count
 */
export function getCatalogCount(catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): number {
  return getPublishedApps(catalog, allowDemo).length;
}

export function getOriginalApps(catalog?: AppItem[], allowDemo: boolean = APPFORGE_DEMO_MODE): AppItem[] {
  return getPublishedApps(catalog, allowDemo).filter((a) => a.original);
}
