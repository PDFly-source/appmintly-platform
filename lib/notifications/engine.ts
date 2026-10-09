/**
 * AppMintly notification engine — pure, platform-independent release-event logic.
 *
 * This module has NO DOM, no browser APIs and no persistence: it takes a raw
 * published-catalog array and a previously persisted notification state, and
 * deterministically produces the set of notification events that should be
 * surfaced. The PWA (foreground checker) and the native Android update
 * checker (lib/apk-builder.ts template) both implement the same rules.
 *
 * Honesty rules encoded here:
 *  - "Published" apps only. Draft/unpublished/archived records never produce events.
 *  - Version bumps are detected by real numeric version comparison, never by
 *    timestamps or edited fields. Downgrades are never reported as updates.
 *  - Metadata-only catalog edits (icon, description, tags, screenshots, ...)
 *    do not change the catalog revision and can never produce an event.
 *  - Severity is ONLY read from an explicit, publisher-set `releaseSeverity`
 *    (or `apk.releaseSeverity`) field, enum-validated. It is never inferred
 *    from version numbers, commit messages or release-note text.
 *  - Update events fire only for apps the user explicitly tracks, together
 *    with the version they recorded as installed. The engine never invents
 *    an installed version.
 *  - Every event carries a deterministic deduplication key. A deployment
 *    retry, catalog rebuild or re-run produces the identical key and is
 *    suppressed by the delivered-key history.
 *  - First run initializes the baseline silently — existing catalog entries
 *    never appear as "new" publications.
 */

export type Severity = 'normal' | 'important' | 'security' | 'critical';

export type EventKind =
  | 'new-android-app'
  | 'new-web-app'
  | 'app-update'
  | 'important-update'
  | 'security-update';

export interface NotificationPrefs {
  master: boolean;
  updates: boolean;
  newAndroid: boolean;
  newWeb: boolean;
  important: boolean;
  security: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  master: false,
  updates: true,
  newAndroid: true,
  newWeb: true,
  important: true,
  security: true,
};

export interface TrackedApp {
  /** Catalog app id (slug). */
  appId: string;
  /** Android package id, when known from the published record. */
  packageId?: string;
  /** The version the user recorded as installed at track time. */
  version: string;
  trackedAt: number;
}

export interface BaselineAppEntry {
  version: string;
  isAndroid: boolean;
  publishedAt?: string;
  severity: Severity;
}

export interface BaselineState {
  /** FNV-1a revision hash over release-relevant fields. */
  revision: string;
  apps: Record<string, BaselineAppEntry>;
}

export interface NotificationEvent {
  /** Deterministic dedup key, e.g. "app-update:nexdrop:1.4.5". */
  key: string;
  kind: EventKind;
  appId: string;
  appName: string;
  version: string;
  title: string;
  body: string;
  /** In-app detail path (BASE_PATH-relative), e.g. "/app/nexdrop/". */
  detailPath: string;
  severity: Severity;
}

export interface CheckOutcome {
  events: NotificationEvent[];
  /** The new baseline to persist AFTER successful processing. */
  baseline: BaselineState;
  /** Keys of the events that were produced (already filtered by history). */
  deliveredKeys: string[];
  /** True when the baseline was initialized for the first time (no events). */
  initializedBaseline: boolean;
}

const SEVERITIES: Severity[] = ['normal', 'important', 'security', 'critical'];

/** Normalize an arbitrary severity-ish input into the enum. Unknown -> normal. */
export function parseSeverity(raw: unknown): Severity {
  if (typeof raw !== 'string') return 'normal';
  const s = raw.trim().toLowerCase();
  return (SEVERITIES as string[]).includes(s) ? (s as Severity) : 'normal';
}

/** Release version of a record: apk.versionName wins (real binary version), else top-level version. */
export function releaseVersionOf(app: Record<string, any>): string {
  const apkVersion =
    app && typeof app.apk === 'object' && app.apk && typeof app.apk.versionName === 'string'
      ? app.apk.versionName.trim()
      : '';
  const topVersion = typeof app.version === 'string' ? app.version.trim() : '';
  return apkVersion || topVersion;
}

/** Stable package id from the published record (empty string when absent). */
export function packageIdOf(app: Record<string, any>): string {
  const p =
    app && typeof app.apk === 'object' && app.apk && typeof app.apk.packageId === 'string'
      ? app.apk.packageId.trim()
      : '';
  return p;
}

/** Android app classification: only explicit "Android APK" type records are Android apps. */
export function isAndroidRelease(app: Record<string, any>): boolean {
  return String(app.type || '').trim().toLowerCase() === 'android apk';
}

/**
 * Numeric version comparison (dot-separated, e.g. "1.4.5").
 * Returns > 0 when a is newer than b, 0 when equal, < 0 when a is older.
 * Non-numeric tokens compare as 0 so "1.4" == "1.4.0". Returns NaN-free:
 * malformed inputs (empty) never count as upgrades.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a || '').split('.');
  const pb = String(b || '').split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] || '0', 10) || 0;
    const nb = parseInt(pb[i] || '0', 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Catalog revision: stable FNV-1a 32-bit hash over the release-relevant
 * fingerprint of every PUBLISHED app, in sorted id order. This is a change
 * detector for publication/version events, not a security checksum (APK
 * integrity keeps using real SHA-256 from the release pipeline).
 *
 * Deliberately EXCLUDED: icon, descriptions, features, tags, screenshots,
 * timestamps of edits, lastUpdated — so a metadata-only edit or an
 * untouched catalog rebuild produces the identical revision and no events.
 */
export function computeCatalogRevision(apps: Record<string, any>[]): string {
  const rows: string[] = [];
  for (const app of apps) {
    if (!isPublishedRecord(app)) continue;
    const id = String(app.id || app.slug || '').trim();
    if (!id) continue;
    rows.push(
      [
        id,
        isAndroidRelease(app) ? 'android' : 'web',
        releaseVersionOf(app),
        packageIdOf(app),
        String(app.publishedAt || ''),
      ].join('|')
    );
  }
  rows.sort();
  const canonical = rows.join('\n');
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return `r${h.toString(16).padStart(8, '0')}`;
}

/** A record is publishable-content only when explicitly published. */
export function isPublishedRecord(app: Record<string, any>): boolean {
  if (!app || typeof app !== 'object') return false;
  if (app.isDemo === true) return false;
  const status = String(app.status || '').toLowerCase();
  if (status === 'draft' || status === 'archived') return false;
  const publishedFlag = typeof app.published === 'boolean' ? app.published : status !== 'draft' && status !== 'archived';
  return publishedFlag && !!releaseVersionOf(app) && !!(app.id || app.slug);
}

/** Build a fresh baseline from the current published catalog. */
export function buildBaseline(apps: Record<string, any>[]): BaselineState {
  const revision = computeCatalogRevision(apps);
  const out: BaselineState = { revision, apps: {} };
  for (const app of apps) {
    if (!isPublishedRecord(app)) continue;
    const id = String(app.id || app.slug || '').trim();
    out.apps[id] = {
      version: releaseVersionOf(app),
      isAndroid: isAndroidRelease(app),
      publishedAt: typeof app.publishedAt === 'string' ? app.publishedAt : undefined,
      severity: parseSeverity(app.releaseSeverity ?? app.apk?.releaseSeverity),
    };
  }
  return out;
}

/** Detail path for deep links — always built from the validated slug, never from a record URL. */
export function detailPathFor(appId: string): string {
  return `/app/${String(appId).replace(/[^a-z0-9-]/g, '')}/`;
}

function isTrackedUpdateAllowed(kind: EventKind, prefs: NotificationPrefs): boolean {
  switch (kind) {
    case 'new-android-app':
      return prefs.newAndroid;
    case 'new-web-app':
      return prefs.newWeb;
    case 'app-update':
      return prefs.updates;
    case 'important-update':
      return prefs.important;
    case 'security-update':
      return prefs.security;
  }
  return false;
}

function eventCopy(kind: EventKind, appName: string, version: string, severity: Severity): { title: string; body: string } {
  switch (kind) {
    case 'new-android-app':
      return { title: 'New on AppMintly', body: `Discover ${appName}, a new Android app now available.` };
    case 'new-web-app':
      return { title: 'New Web App on AppMintly', body: `Try ${appName}'s latest web experience.` };
    case 'app-update':
      return { title: `Update available: ${appName}`, body: `Version ${version} is available. View the latest changes.` };
    case 'important-update':
      return { title: `Important update: ${appName}`, body: `Version ${version} includes an important change. Review the release details.` };
    case 'security-update':
      return {
        title: severity === 'critical' ? `Critical security update: ${appName}` : `Important security update`,
        body: `A security fix is available for ${appName}. Review the release details.`,
      };
  }
  return { title: 'AppMintly', body: '' };
}

export interface DetectOptions {
  /** Previously persisted baseline (null/missing on first run). */
  baseline: BaselineState | null;
  /** Previously delivered dedup keys -> timestamp (ms). */
  delivered: Record<string, number>;
  /** User's tracked apps. */
  tracked: TrackedApp[];
  /** User preferences. */
  prefs: NotificationPrefs;
}

/**
 * Core detection. Deterministic: same inputs -> same events.
 * A metadata-only edit, duplicate deployment or rebuild yields zero events.
 */
export function detectEvents(rawApps: unknown[], options: DetectOptions): CheckOutcome {
  const apps = Array.isArray(rawApps) ? (rawApps as Record<string, any>[]) : [];
  const nextBaseline = buildBaseline(apps);
  const { baseline, delivered, tracked, prefs } = options;

  // First run: initialize silently. Existing catalog entries must never
  // appear as new publications.
  if (!baseline || !baseline.revision || !baseline.apps) {
    return { events: [], baseline: nextBaseline, deliveredKeys: [], initializedBaseline: true };
  }

  const events: NotificationEvent[] = [];
  const deliveredKeys: string[] = [];

  const push = (event: NotificationEvent) => {
    // Never re-deliver the same logical notification.
    if (delivered[event.key] !== undefined) return;
    // Preference gates. Master off -> nothing at all.
    if (!prefs.master) return;
    if (!isTrackedUpdateAllowed(event.kind, prefs)) return;
    // Only surface an event while the catalog still reports it (recheck the
    // version metadata that was just fetched — this IS that fetch).
    if (nextBaseline.apps[event.appId] === undefined) return;
    events.push(event);
    deliveredKeys.push(event.key);
  };

  for (const app of apps) {
    if (!isPublishedRecord(app)) continue;
    const id = String(app.id || app.slug || '').trim();
    const name = String(app.name || id);
    const version = releaseVersionOf(app);
    const severity = parseSeverity(app.releaseSeverity ?? app.apk?.releaseSeverity);
    const android = isAndroidRelease(app);

    const prior = baseline.apps[id];
    if (prior === undefined) {
      // Genuinely new publication (verified against the catalog we just fetched).
      const kind: EventKind = android ? 'new-android-app' : 'new-web-app';
      const copy = eventCopy(kind, name, version, severity);
      push({
        key: `${kind}:${id}:${version}`,
        kind,
        appId: id,
        appName: name,
        version,
        title: copy.title,
        body: copy.body,
        detailPath: detailPathFor(id),
        severity: 'normal',
      });
      continue;
    }

    // Version upgrade for TRACKED apps only (user-confirmed relationship).
    const trackedEntry = tracked.find((t) => t.appId === id && typeof t.version === 'string' && t.version.trim() !== '');
    if (!trackedEntry) continue;
    const installedVersion = trackedEntry.version.trim();
    // Detect real upgrades only: strictly greater than the recorded version.
    if (compareVersions(version, installedVersion) <= 0) continue;

    let kind: EventKind;
    if (severity === 'security' || severity === 'critical') kind = 'security-update';
    else if (severity === 'important') kind = 'important-update';
    else kind = 'app-update';
    const copy = eventCopy(kind, name, version, severity);
    push({
      key: `${kind}:${id}:${version}`,
      kind,
      appId: id,
      appName: name,
      version,
      title: copy.title,
      body: copy.body,
      detailPath: detailPathFor(id),
      severity,
    });
  }

  return { events, baseline: nextBaseline, deliveredKeys, initializedBaseline: false };
}

/** Trim the delivered-key history so it cannot grow unbounded (keep newest N). */
export function pruneDelivered(delivered: Record<string, number>, keep: number = 200): Record<string, number> {
  const entries = Object.entries(delivered).sort((a, b) => b[1] - a[1]);
  const out: Record<string, number> = {};
  for (const [k, ts] of entries.slice(0, keep)) out[k] = ts;
  return out;
}

/** Guard for corrupted state: recover by re-initializing without an event flood. */
export function sanitizeStatePiece<T>(raw: unknown, fallback: T, validate: (v: unknown) => boolean): T {
  return validate(raw) ? (raw as T) : fallback;
}
