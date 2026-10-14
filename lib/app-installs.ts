'use client';

/**
 * Phase 1A — Smart version tracking (per-browser, local only).
 *
 * Stores what THIS browser actually knows about an app's version:
 *  - downloadedVersion — the version whose APK the user downloaded from
 *    the AppMintly release page in this browser
 *  - verifiedVersion   — a version whose APK bytes were SHA-256 verified
 *    in this browser
 *  - dismissedForVersion — the latest version an "Update Available" notice
 *    was dismissed for (one dismissal per version, never permanent)
 *
 * HONESTY RULES:
 *  - This store NEVER records an "installed" Android version. A web page
 *    cannot know which APK version is installed on the device; claiming so
 *    would be fabrication. The UI says "downloaded"/"verified", not
 *    "installed".
 *  - Version comparison reuses the production numeric comparator from the
 *    notification engine (compareVersions) — no duplicated logic.
 *  - The catalog (data/apps.json via lib/notifications/engine.releaseVersionOf)
 *    is the ONLY source of the latest version. No hardcoded versions here.
 *
 * Storage: localStorage, versioned schema with safe parsing. Corrupt,
 * malformed or future-version data is discarded (never crash, never guessed).
 */

import { useSyncExternalStore } from 'react';
import { compareVersions, releaseVersionOf } from '@/lib/notifications/engine';

const STORAGE_KEY = 'appmintly_installs_v1';
const UPDATE_EVENT = 'appmintly_installs_updated';

/** Schema version — bump + migrate on any breaking change. */
export const INSTALLS_SCHEMA_VERSION = 1;

export interface InstallRecord {
  /** Version whose APK was downloaded in this browser. */
  downloadedVersion?: string;
  downloadedAt?: number;
  /** Version whose APK bytes passed SHA-256 verification in this browser. */
  verifiedVersion?: string;
  verifiedSha256?: string;
  verifiedAt?: number;
  /** Latest catalog version the user dismissed an update notice for. */
  dismissedForVersion?: string;
  dismissedAt?: number;
}

export interface InstallStore {
  schemaVersion: number;
  apps: Record<string, InstallRecord>;
}

function emptyStore(): InstallStore {
  return { schemaVersion: INSTALLS_SCHEMA_VERSION, apps: {} };
}

function isRecord(v: unknown): v is InstallRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (r.downloadedVersion === undefined || typeof r.downloadedVersion === 'string') &&
    (r.verifiedVersion === undefined || typeof r.verifiedVersion === 'string') &&
    (r.dismissedForVersion === undefined || typeof r.dismissedForVersion === 'string')
  );
}

/**
 * Safe parse: returns an empty store for ANY malformed input (corrupt JSON,
 * wrong shape, unknown/future schema) instead of throwing or guessing.
 */
export function parseStore(raw: string | null): InstallStore {
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyStore();
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion !== INSTALLS_SCHEMA_VERSION) {
      return emptyStore();
    }
    if (typeof obj.apps !== 'object' || obj.apps === null) return emptyStore();
    const apps: Record<string, InstallRecord> = {};
    for (const [id, rec] of Object.entries(obj.apps)) {
      if (typeof id === 'string' && isRecord(rec)) apps[id] = rec;
    }
    return { schemaVersion: INSTALLS_SCHEMA_VERSION, apps };
  } catch {
    return emptyStore();
  }
}

/**
 * Snapshot cache for useSyncExternalStore: React REQUIRES getSnapshot to
 * return the SAME object reference while the store is unchanged — a fresh
 * JSON.parse on every call creates a new reference each time and drives
 * React into a maximum-update-depth crash (minified error #185). The cache
 * is keyed by the raw storage string, so any external write (another tab's
 * 'storage' event or direct localStorage.setItem) is still detected.
 */
let storeSnapshotCache: InstallStore | null = null;
let storeSnapshotRaw: string | null = null;

function readStore(): InstallStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (storeSnapshotCache !== null && raw === storeSnapshotRaw) return storeSnapshotCache;
    const parsed = parseStore(raw);
    storeSnapshotCache = parsed;
    storeSnapshotRaw = raw;
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: InstallStore): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(store);
    window.localStorage.setItem(STORAGE_KEY, raw);
    // Keep the snapshot cache in lockstep so subscribers immediately see
    // (and stably hold) the new store — same reference across reads.
    storeSnapshotCache = store;
    storeSnapshotRaw = raw;
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch (err) {
    console.error('app-installs: could not persist install record', err);
  }
}

/** Read a single app's record (null when this browser has none). */
export function getInstallRecord(appId: string): InstallRecord | null {
  return readStore().apps[appId] ?? null;
}

function mutate(appId: string, patch: (rec: InstallRecord) => InstallRecord): void {
  const store = readStore();
  const existing = store.apps[appId] ?? {};
  store.apps[appId] = patch({ ...existing });
  writeStore(store);
}

/**
 * Record that the APK of `version` was downloaded in THIS browser.
 * The catalog version is authoritative — the caller passes the release
 * version from the catalog record, never a hardcoded value.
 */
export function recordDownloadedVersion(appId: string, version: string): void {
  if (!appId || !version) return;
  mutate(appId, (rec) => ({
    ...rec,
    downloadedVersion: version,
    downloadedAt: Date.now(),
  }));
}

/** Record that the APK bytes of `version` were SHA-256 verified in this browser. */
export function recordVerifiedVersion(appId: string, version: string, sha256: string): void {
  if (!appId || !version || !sha256) return;
  mutate(appId, (rec) => ({
    ...rec,
    verifiedVersion: version,
    verifiedSha256: sha256,
    verifiedAt: Date.now(),
  }));
}

/** Dismiss the "Update Available" notice for the given latest version. */
export function dismissUpdateFor(appId: string, latestVersion: string): void {
  if (!appId || !latestVersion) return;
  mutate(appId, (rec) => ({
    ...rec,
    dismissedForVersion: latestVersion,
    dismissedAt: Date.now(),
  }));
}

/** Best known version of the app in this browser (verified > downloaded). */
export function knownLocalVersion(rec: InstallRecord | null): string {
  if (!rec) return '';
  return rec.verifiedVersion || rec.downloadedVersion || '';
}

export interface UpdateInfo {
  /** True when the catalog version is newer than what this browser knows. */
  available: boolean;
  /** Previous version known to this browser (may be ''). */
  previousVersion: string;
  /** Latest version from the catalog. */
  latestVersion: string;
  /** True when the notice for `latestVersion` was dismissed. */
  dismissed: boolean;
}

/**
 * Compare the locally known version with the catalog's release version.
 * Pure: no storage access, fully testable.
 */
export function computeUpdateInfo(
  rec: InstallRecord | null,
  latestVersion: string
): UpdateInfo {
  const previousVersion = knownLocalVersion(rec);
  const available = Boolean(previousVersion) && Boolean(latestVersion) && compareVersions(latestVersion, previousVersion) > 0;
  const dismissed = Boolean(rec?.dismissedForVersion) && rec!.dismissedForVersion === latestVersion;
  return { available, previousVersion, latestVersion, dismissed };
}

/** Convenience wrapper: latest version straight from a catalog record. */
export function updateInfoForApp(rec: InstallRecord | null, app: Record<string, unknown>): UpdateInfo {
  return computeUpdateInfo(rec, releaseVersionOf(app));
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(UPDATE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** React hook: live install record without hydration mismatch. */
export function useInstallRecord(appId: string): InstallRecord | null {
  const subscribe1 = useSyncExternalStore(
    subscribe,
    () => getInstallRecord(appId),
    () => null
  );
  return subscribe1;
}
