/**
 * AppMintly 2.0 — app comparison engine (pure, testable, no React, no I/O).
 *
 * Two apps are comparable only when both are published catalog records. Every
 * row is derived from fields that actually exist in data/apps.json; a missing
 * field renders "Not specified" instead of a plausible-looking invention, and
 * no rating, popularity, performance or security score exists anywhere here.
 *
 * Storage is versioned (KEY + version) and injected, so the same code can be
 * unit-tested with an in-memory store and still run in the browser.
 */
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import {
  availabilityOf,
  platformOf,
  webUrlOf,
  type CatalogLikeApp,
} from '@/lib/catalog/explore-filters';

export const MAX_COMPARE = 3;
export const COMPARE_STORAGE_KEY = 'appmintly.compare.v1';
export const COMPARE_STORAGE_VERSION = 1;
export const NOT_SPECIFIED = 'Not specified';

export interface ComparableApp extends CatalogLikeApp {
  icon?: string;
  version?: string;
  shortDescription?: string;
  description?: string;
  features?: string[];
  privacyTech?: {
    networkRequirement?: string;
    dataCollection?: string;
    tracking?: string;
    storage?: string;
    installationType?: string;
    pwaSupport?: string;
  } | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SelectionResult {
  ids: string[];
  /** Saved ids that no longer resolve to a published app. */
  removed: string[];
  /** Duplicates and overflow dropped while normalising. */
  duplicates: string[];
}

const isPublished = (app: ComparableApp | undefined | null): app is ComparableApp =>
  Boolean(app && app.published);

/**
 * Normalise any saved/typed selection: published-only, de-duplicated,
 * capped at MAX_COMPARE, order preserved.
 */
export function sanitizeSelection(
  candidate: unknown,
  apps: ComparableApp[],
  max: number = MAX_COMPARE
): SelectionResult {
  const raw = Array.isArray(candidate)
    ? candidate.filter((v): v is string => typeof v === 'string')
    : [];
  const byId = new Map(apps.filter(isPublished).map((a) => [a.id ?? a.slug, a]));
  const ids: string[] = [];
  const removed: string[] = [];
  const duplicates: string[] = [];

  for (const id of raw) {
    if (!byId.has(id)) {
      removed.push(id);
      continue;
    }
    if (ids.includes(id)) {
      duplicates.push(id);
      continue;
    }
    if (ids.length >= max) {
      duplicates.push(id);
      continue;
    }
    ids.push(id);
  }
  // An id that appears twice but resolved fine is only a duplicate, never a removal.
  return { ids, removed, duplicates };
}

export type ToggleAction = 'added' | 'removed' | 'limit' | 'invalid';

export function toggleSelection(
  current: string[],
  id: string,
  apps: ComparableApp[],
  max: number = MAX_COMPARE
): { ids: string[]; action: ToggleAction } {
  const { ids } = sanitizeSelection(current, apps, max);
  const exists = apps.some((a) => isPublished(a) && (a.id ?? a.slug) === id);
  if (!exists) return { ids, action: 'invalid' };
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), action: 'removed' };
  if (ids.length >= max) return { ids, action: 'limit' };
  return { ids: [...ids, id], action: 'added' };
}

export function remainingSlots(ids: string[], max: number = MAX_COMPARE): number {
  return Math.max(0, max - ids.length);
}

export function isReadyToCompare(ids: string[]): boolean {
  return ids.length >= 2 && ids.length <= MAX_COMPARE;
}

/* ------------------------------------------------------------------ storage */

export function serializeSelection(ids: string[]): string {
  return JSON.stringify({ version: COMPARE_STORAGE_VERSION, ids });
}

/** Tolerates older payloads, raw arrays, corrupt JSON and future versions. */
export function parseStoredSelection(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ids)) {
      return parsed.ids.filter((v: unknown): v is string => typeof v === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export function loadSelection(
  storage: StorageLike | null | undefined,
  apps: ComparableApp[]
): SelectionResult {
  if (!storage) return { ids: [], removed: [], duplicates: [] };
  let raw: string | null = null;
  try {
    raw = storage.getItem(COMPARE_STORAGE_KEY);
  } catch {
    return { ids: [], removed: [], duplicates: [] };
  }
  const parsed = parseStoredSelection(raw);
  const result = sanitizeSelection(parsed, apps);
  // Self-heal: drop stale/unpublished ids so the tray never shows ghosts.
  if (result.removed.length > 0 || result.duplicates.length > 0) {
    saveSelection(storage, result.ids);
  }
  return result;
}

export function saveSelection(storage: StorageLike | null | undefined, ids: string[]): void {
  if (!storage) return;
  try {
    storage.setItem(COMPARE_STORAGE_KEY, serializeSelection(ids));
  } catch {
    /* storage full or blocked: comparison simply does not persist */
  }
}

/* ------------------------------------------------------------------- values */

export function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return NOT_SPECIFIED;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

const PLATFORM_LABEL: Record<string, string> = {
  android: 'Android APK',
  web: 'Web app',
  both: 'Android APK + Web app',
  none: NOT_SPECIFIED,
};

const AVAILABILITY_LABEL: Record<string, string> = {
  offline: 'Works offline',
  online: 'Needs internet',
  unknown: NOT_SPECIFIED,
};

const present = (value: unknown): string => {
  if (typeof value === 'string') return value.trim() ? value.trim() : NOT_SPECIFIED;
  if (Array.isArray(value)) return value.length ? value.join(' · ') : NOT_SPECIFIED;
  return NOT_SPECIFIED;
};

function featureSummary(app: ComparableApp): string {
  const features = (app.features || []).filter((f) => typeof f === 'string' && f.trim());
  if (features.length === 0) return NOT_SPECIFIED;
  const shown = features.slice(0, 3).map((f) => f.split(' — ')[0].trim());
  const rest = features.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} (+${rest} more)` : shown.join(' · ');
}

const apkRow = (app: ComparableApp): string => {
  if (!hasAuthoritativeApkRelease(app as never)) return 'Not available';
  const version = app.apk && 'versionName' in app.apk ? (app.apk as { versionName?: string }).versionName : undefined;
  const size = formatBytes(app.apk?.fileSizeBytes);
  const bits = [version ? `v${version}` : null, size !== NOT_SPECIFIED ? size : null].filter(Boolean);
  return bits.length ? `Available (${bits.join(', ')})` : 'Available';
};

export interface CompareRow {
  key: string;
  label: string;
  /** appId → display value, always populated (NOT_SPECIFIED when unknown). */
  values: Record<string, string>;
}

/**
 * Build the comparison table. `ids` is sanitised first, so callers cannot
 * render an unpublished or removed app by passing a stale id.
 */
export function buildComparison(
  apps: ComparableApp[],
  ids: string[]
): {
  apps: ComparableApp[];
  rows: CompareRow[];
  removed: string[];
  ready: boolean;
} {
  const selection = sanitizeSelection(ids, apps);
  const byId = new Map(apps.filter(isPublished).map((a) => [a.id ?? a.slug, a]));
  const selected = selection.ids.map((id) => byId.get(id)!).filter(Boolean);

  const definitions: { key: string; label: string; value: (app: ComparableApp) => string }[] = [
    { key: 'category', label: 'Category', value: (a) => present(a.category) },
    { key: 'type', label: 'Application type', value: (a) => present(a.type) },
    {
      key: 'platforms',
      label: 'Supported platforms',
      value: (a) => PLATFORM_LABEL[platformOf(a)] ?? NOT_SPECIFIED,
    },
    { key: 'version', label: 'Current version', value: (a) => (a.version ? `v${a.version}` : NOT_SPECIFIED) },
    { key: 'size', label: 'APK file size', value: (a) => formatBytes(a.apk?.fileSizeBytes) },
    { key: 'download', label: 'Download availability', value: (a) => apkRow(a) },
    {
      key: 'web',
      label: 'Open on web',
      value: (a) => (webUrlOf(a) ? 'Available' : 'Not available'),
    },
    {
      key: 'network',
      label: 'Network requirement',
      value: (a) => AVAILABILITY_LABEL[availabilityOf(a)] ?? NOT_SPECIFIED,
    },
    {
      key: 'privacy',
      label: 'Privacy technology',
      value: (a) => present(a.privacyTech?.dataCollection),
    },
    { key: 'features', label: 'Features', value: (a) => featureSummary(a) },
  ];

  const rows: CompareRow[] = definitions.map((definition) => {
    const values: Record<string, string> = {};
    for (const app of selected) values[app.id ?? app.slug] = definition.value(app);
    return { key: definition.key, label: definition.label, values };
  });

  return {
    apps: selected,
    rows,
    removed: selection.removed,
    ready: isReadyToCompare(selection.ids),
  };
}
