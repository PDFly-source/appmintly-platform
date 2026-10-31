/**
 * AppMintly 2.0 — collections built ONLY from real, published catalog records.
 *
 * Why this module exists: data/collections.json previously referenced apps that
 * do not exist anywhere in the catalog (lifesync, pixelforge-studio,
 * vaultguard-apk, retroblast-84, codenova-ide, zenith-finance, mindflow-notes,
 * chronopulse-apk). Rendering it as-is would have published phantom apps, so
 * collections were never surfaced. Everything here is derived from the live
 * catalog and any unknown id is dropped rather than displayed.
 */
import type { AppItem } from '@/data/apps';

export interface Collection {
  id: string;
  title: string;
  description: string;
  /** Real published apps only, in catalog order. */
  apps: AppItem[];
  /** 'derived' collections come from catalog facts; 'curated' from the data file. */
  source: 'derived' | 'curated';
}

type AnyApp = AppItem & {
  tags?: string[];
  privacyTech?: { networkRequirement?: string; pwaSupport?: string; storage?: string };
  featured?: boolean;
};

const published = (apps: AnyApp[]): AnyApp[] => apps.filter((a) => Boolean(a.published));

const hasTag = (app: AnyApp, ...tags: string[]) =>
  (app.tags || []).some((t) => tags.includes(t.toLowerCase()));

/** Catalog facts that make an app "local-first" without guessing. */
export function isLocalFirst(app: AnyApp): boolean {
  const p = app.privacyTech || {};
  return (
    p.networkRequirement === 'offline-capable' ||
    hasTag(app, 'local-first', 'offline', 'privacy', 'no-account') ||
    /indexeddb|local ?storage|on your device|never transmitted/i.test(p.storage || '')
  );
}

export function isInstallablePwa(app: AnyApp): boolean {
  return (app.privacyTech || {}).pwaSupport === 'verified-installable';
}

export function hasAndroidRelease(app: AnyApp): boolean {
  const apk = (app as AnyApp & { apk?: { enabled?: boolean } }).apk;
  return Boolean(apk?.enabled) || app.type === 'Android APK';
}

/**
 * Derive collections from catalog facts. Ordering follows the catalog so the
 * surface is stable between builds.
 */
export function deriveCollections(apps: AppItem[]): Collection[] {
  const list = published(apps as AnyApp[]);
  const rules: Array<Omit<Collection, 'apps' | 'source'>> = [
    {
      id: 'local-first',
      title: 'Private & Local-First',
      description:
        'Apps whose catalogued privacy record shows on-device storage and offline capability. Nothing here claims an audit that did not happen.',
    },
    {
      id: 'installable-pwas',
      title: 'Installable Apps (PWA)',
      description: 'Verified-installable web apps that run from your launcher, not a browser tab.',
    },
    {
      id: 'android-releases',
      title: 'Verified Android Releases',
      description: 'Apps distributed as signed APKs with a published release record.',
    },
  ];
  const filters: Record<string, (a: AnyApp) => boolean> = {
    'local-first': isLocalFirst,
    'installable-pwas': isInstallablePwa,
    'android-releases': hasAndroidRelease,
  };
  const out = rules.map((rule) => ({
    ...rule,
    apps: list.filter(filters[rule.id]) as unknown as AppItem[],
    source: 'derived' as const,
  }));
  // One-app "collections" are not collections; hide them rather than pad them.
  return out.filter((c) => c.apps.length >= 2);
}

/**
 * Merge curated collections from data/collections.json with derived ones,
 * dropping any id missing from the published catalog.
 */
export function buildCollections(
  apps: AppItem[],
  curated: Array<{ id: string; title: string; description: string; appIds: string[] }> = []
): { collections: Collection[]; droppedIds: string[] } {
  const list = published(apps as AnyApp[]);
  const byId = new Map(list.map((a) => [a.id, a as unknown as AppItem]));
  const droppedIds: string[] = [];

  const curatedCollections: Collection[] = curated
    .map((c) => {
      const real = c.appIds.filter((id) => {
        const ok = byId.has(id);
        if (!ok) droppedIds.push(id);
        return ok;
      });
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        apps: Array.from(new Set(real)).map((id) => byId.get(id)!) as AppItem[],
        source: 'curated' as const,
      };
    })
    .filter((c) => c.apps.length >= 2);

  const derived = deriveCollections(apps).filter(
    (d) => !curatedCollections.some((c) => c.id === d.id)
  );

  return { collections: [...curatedCollections, ...derived], droppedIds };
}

/* ---------------------------------------------------------------------------
 * Route helpers (Item 4 — individual collection pages).
 *
 * Slugs are derived from the existing collection ids, so no route is
 * hardcoded and no second source of truth is introduced.
 * ------------------------------------------------------------------------- */

/** Stable, URL-safe slug for a collection id. */
export function collectionSlug(id: string): string {
  return String(id)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function findCollectionBySlug(
  collections: Collection[],
  slug: string
): Collection | undefined {
  const target = collectionSlug(slug);
  return collections.find((c) => collectionSlug(c.id) === target);
}

/**
 * Real content date for a collection: the newest member app date. Never the
 * build clock — a collection did not change just because the site rebuilt.
 */
export function collectionContentDate(collection: Collection): Date | undefined {
  const times = collection.apps
    .map((app) => {
      const loose = app as unknown as { updatedAt?: string; lastUpdated?: string; publishedAt?: string };
      const raw = loose.updatedAt || loose.lastUpdated || loose.publishedAt;
      if (!raw) return NaN;
      return new Date(raw).getTime();
    })
    .filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)) : undefined;
}

/** Platform split for the collection hero, from authoritative evidence only. */
export function collectionPlatformSplit(collection: Collection): { android: number; web: number; both: number } {
  let android = 0;
  let web = 0;
  let both = 0;
  for (const app of collection.apps) {
    const loose = app as unknown as {
      apk?: { enabled?: boolean; verified?: boolean; sha256?: string; apkUrl?: string };
      apkUrl?: string;
      launchUrl?: string;
      pwaUrl?: string;
      url?: string;
    };
    const apk = loose.apk;
    const hasApk = Boolean(
      apk && apk.enabled === true && apk.verified === true && (apk.sha256 || '').length > 0 && (apk.apkUrl || loose.apkUrl)
    );
    const webTarget = loose.launchUrl || loose.pwaUrl || loose.url;
    const hasWeb = typeof webTarget === 'string' && /^https?:\/\//.test(webTarget);
    if (hasApk) android += 1;
    if (hasWeb) web += 1;
    if (hasApk && hasWeb) both += 1;
  }
  return { android, web, both };
}
