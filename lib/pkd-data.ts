/**
 * PKD publisher-profile catalog adapter.
 *
 * Derives every value shown on the PKD 3D profile page from the live
 * AppMintly catalog — no hardcoded app records, counts, versions or
 * update entries. Rules mirror the marketplace publication rules:
 * published apps only, canonical-slug dedup, catalog ordering,
 * real version/date metadata, neutral fallbacks for missing fields.
 */

export interface PkdShowcaseApp {
  /** App name */
  n: string;
  /** Icon URL (catalog icon, or neutral monogram fallback) */
  i: string;
  /** 3D glow accent color (from the app's own themeColor, numeric) */
  g: number;
  /** Description */
  d: string;
  /** Version + size label, e.g. "v2.1.0 • 274 KB" */
  v: string;
  /** Category + platform label, e.g. "Health • Installable App" */
  t: string;
  /** Type chip: "App" | "APK" */
  ty: string;
  /** Official destination (AppMintly app detail page) */
  u: string;
  /** Whether the app qualifies as New by the marketplace rule */
  nw: boolean;
}

export interface PkdUpdateItem {
  icon: string;
  name: string;
  category: string;
  /** e.g. "v2.1.0" */
  version: string;
  /** e.g. "2026-09-30" or "—" when no reliable date exists */
  date: string;
  /** Sort key (ms epoch, 0 = unknown) — newest first, unknown last */
  sortKey: number;
}

export interface PkdStats {
  total: number;
  published: number;
  categories: number;
  /** Latest version label of the most recently updated app, e.g. "v2.1.0" */
  latest: string;
}

export interface PkdCatalogData {
  apps: PkdShowcaseApp[];
  stats: PkdStats;
  updates: PkdUpdateItem[];
}

const PKD_DEVELOPER_SLUG = 'pkd';
const DEFAULT_ACCENT = 0x4c8dff;
const MISSING = '\u2014'; // em dash neutral fallback

/** Structural shape of the catalog fields this adapter consumes. */
export interface PkdAppSource {
  slug?: string;
  name?: string;
  icon?: string;
  themeColor?: string;
  shortDescription?: string;
  description?: string;
  version?: string;
  size?: string;
  category?: string;
  type?: string;
  developerSlug?: string;
  published?: boolean;
  publishedAt?: string;
  releaseDate?: string;
  lastUpdated?: string;
  updatedAt?: string;
  /** Marketplace "new" flag (30-day publication window). */
  isNew?: boolean;
}

/** Date-field precedence used across the marketplace for update recency. */
function updateDateMs(a: PkdAppSource): number {
  const s = a.lastUpdated || a.updatedAt || a.releaseDate || a.publishedAt || '';
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function updateDateLabel(a: PkdAppSource): string {
  const s = a.lastUpdated || a.updatedAt || a.releaseDate || a.publishedAt || '';
  const t = s ? Date.parse(s) : NaN;
  if (!Number.isFinite(t)) return MISSING;
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function accentColor(a: PkdAppSource): number {
  const s = (a.themeColor || '').trim();
  if (!s) return DEFAULT_ACCENT;
  const hex = s.startsWith('#') ? s.slice(1) : s;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return DEFAULT_ACCENT;
  return parseInt(hex, 16);
}

/** Neutral monogram fallback for an app without an icon asset. */
function monogramIcon(name: string): string {
  const initial = (name.trim()[0] || 'A').toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">` +
    `<rect width="256" height="256" rx="56" fill="#1d2538"/>` +
    `<text x="128" y="168" font-family="Inter,Arial,sans-serif" font-size="120" ` +
    `font-weight="700" text-anchor="middle" fill="#EEF2FA">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function iconUrl(a: PkdAppSource, basePath: string): string {
  const ic = (a.icon || '').trim();
  if (!ic) return monogramIcon(a.name || 'A');
  // External absolute URLs pass through untouched; only site-relative
  // paths (e.g. /brand/x.png) get the host's basePath prefix.
  if (/^https?:\/\//i.test(ic) || ic.startsWith('data:')) return ic;
  if (ic.startsWith('/')) return `${basePath}${ic}`;
  return ic;
}

function platformLabel(a: PkdAppSource): string {
  return `${a.category || 'App'} \u2022 ${a.type === 'Android APK' ? 'APK Package' : 'Installable App'}`;
}

function typeChip(a: PkdAppSource): string {
  return a.type === 'Android APK' ? 'APK' : 'App';
}

function versionLabel(a: PkdAppSource): string {
  // Append the size only when the field actually holds a size value —
  // some catalog records carry a platform label there instead.
  const size = /^[0-9]+(\.[0-9]+)?\s*(B|KB|MB|GB)$/i.test((a.size || '').trim()) ? a.size!.trim() : '';
  if (!a.version) return size || MISSING;
  return size ? `v${a.version} \u2022 ${size}` : `v${a.version}`;
}

function descriptionLabel(a: PkdAppSource): string {
  if (a.shortDescription) return a.shortDescription;
  const d = a.description || '';
  if (d.length <= 220) return d;
  const cut = d.slice(0, 220);
  const sp = cut.lastIndexOf(' ');
  return (sp > 140 ? cut.slice(0, sp) : cut) + '\u2026';
}

/** Is the app "New" per the marketplace 30-day publication rule. */
function isNewLike(a: PkdAppSource): boolean {
  if (typeof a.isNew === 'boolean') return a.isNew;
  const s = a.publishedAt || a.releaseDate || a.lastUpdated || a.updatedAt || '';
  const t = s ? Date.parse(s) : NaN;
  if (!Number.isFinite(t)) return false;
  const diffDays = Math.abs(Date.now() - t) / 86400000;
  return diffDays <= 30;
}

/**
 * Build all PKD profile data from the published catalog.
 * `apps` must already satisfy the marketplace publication rules (the public
 * CatalogContext's publishedApps); this adapter defensively re-checks the
 * published flag and dedupes by canonical slug.
 */
export function buildPkdData(publishedApps: PkdAppSource[], basePath: string): PkdCatalogData {
  const seen = new Set<string>();
  const apps: PkdAppSource[] = [];
  for (const a of publishedApps) {
    if (!a || a.published === false) continue;
    if ((a.developerSlug || '').toLowerCase() !== PKD_DEVELOPER_SLUG) continue;
    const key = (a.slug || a.name || '').toLowerCase();
    if (!key || seen.has(key)) continue; // dedupe by canonical slug/identity
    seen.add(key);
    apps.push(a);
  }

  const categories = new Set(
    apps.map((a) => (a.category || '').trim()).filter(Boolean)
  ).size;

  // Latest = most recently updated app (stable on ties: catalog order wins).
  let latestApp: PkdAppSource | null = null;
  let latestKey = -1;
  for (const a of apps) {
    const k = updateDateMs(a);
    if (k > latestKey) {
      latestKey = k;
      latestApp = a;
    }
  }

  const showcase: PkdShowcaseApp[] = apps.map((a) => ({
    n: a.name || 'App',
    i: iconUrl(a, basePath),
    g: accentColor(a),
    d: descriptionLabel(a),
    v: versionLabel(a),
    t: platformLabel(a),
    ty: typeChip(a),
    u: `${basePath}/app/${(a.slug || '').toLowerCase()}/`,
    nw: isNewLike(a),
  }));

  // Newest-first; equal or missing dates keep catalog order (stable sort).
  const updates: PkdUpdateItem[] = apps
    .map((a) => ({
      icon: iconUrl(a, basePath),
      name: a.name || 'App',
      category: a.category || '',
      version: a.version ? `v${a.version}` : MISSING,
      date: updateDateLabel(a),
      sortKey: updateDateMs(a),
    }))
    .sort((x, y) => y.sortKey - x.sortKey);

  return {
    apps: showcase,
    stats: {
      total: apps.length,
      published: apps.length,
      categories,
      latest: latestApp && latestApp.version ? `v${latestApp.version}` : MISSING,
    },
    updates,
  };
}
