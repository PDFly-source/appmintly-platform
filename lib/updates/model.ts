/**
 * AppMintly Item 6 — Smart App Update Center: the pure model.
 *
 * EVERYTHING HERE READS THE PUBLISHED CATALOG AND NOTHING ELSE.
 *
 * Honesty rules enforced by construction:
 *  - A "latest version" exists only when the record is published and carries a
 *    version string. There is no default, no fallback to "1.0.0".
 *  - An update is offered only when the record also carries authoritative
 *    release evidence (enabled + verified + checksum + asset) AND the catalog
 *    version is strictly newer than the version this browser actually knows.
 *    A browser that never downloaded the app is never told it is "up to date"
 *    and never told an update is "available" — it simply has no baseline.
 *  - Release notes and version history come from real catalog fields
 *    (releaseNotes, changelog, apk.releaseDate, lastUpdated, previousVersion).
 *    A missing field produces an explicit "not published" state, never prose.
 *  - Dates are only ever the record's own dates; nothing is "today" or
 *    "recently" unless the catalog says so.
 *
 * This module is deliberately UI-free so the rules are unit-testable.
 */

import { compareVersions, releaseVersionOf } from '@/lib/notifications/engine';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

export interface UpdateAppLike {
  id?: string;
  slug?: string;
  name?: string;
  version?: string;
  published?: boolean;
  status?: string;
  type?: string;
  lastUpdated?: string;
  releaseDate?: string;
  releaseNotes?: string[] | string;
  changelog?: string[] | string;
  previousVersion?: string;
  launchUrl?: string;
  webUrl?: string;
  apk?: {
    enabled?: boolean;
    verified?: boolean;
    sha256?: string;
    apkUrl?: string;
    versionName?: string;
    versionCode?: number;
    releaseDate?: string;
    generatedAt?: string;
  } | null;
}

export type UpdateState =
  /** No version published for this record. */
  | 'no-version'
  /** Nothing recorded in this browser: no baseline, no claim. */
  | 'no-baseline'
  /** Browser knows the current published version. */
  | 'up-to-date'
  /** Catalog is strictly newer than what this browser downloaded. */
  | 'update-available'
  /** Browser knows a version newer than the catalog (stale catalog/record). */
  | 'catalog-behind';

export interface VersionKnowledge {
  state: UpdateState;
  /** Version this browser recorded, or '' when nothing is known. */
  localVersion: string;
  /** Version the published record declares, or '' when absent. */
  latestVersion: string;
  /** Only true for 'update-available'. */
  updateAvailable: boolean;
  /** True when the published record can actually deliver an update. */
  deliverable: boolean;
  /** Human label for the state, used verbatim by the UI. */
  label: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isPublished(app: UpdateAppLike | null | undefined): boolean {
  return Boolean(app && app.published === true);
}

/**
 * The published record's declared version. Uses the shared release-version
 * reader (APK versionName first, then the record version) so the Update Center
 * and the notification engine can never disagree.
 */
export function latestVersionOf(app: UpdateAppLike | null | undefined): string {
  if (!app) return '';
  const raw = releaseVersionOf(app as Record<string, unknown>);
  return typeof raw === 'string' ? raw.trim() : '';
}

/** True only when this listing can deliver a verified APK. */
export function deliverableUpdate(app: UpdateAppLike | null | undefined): boolean {
  return hasAuthoritativeApkRelease(app as never);
}

/**
 * Compare what this browser knows against what the catalog publishes.
 * `localVersion` must come from real local records (app-installs), never a guess.
 */
export function versionKnowledge(
  app: UpdateAppLike | null | undefined,
  localVersion: string
): VersionKnowledge {
  const latestVersion = latestVersionOf(app);
  const local = typeof localVersion === 'string' ? localVersion.trim() : '';
  const deliverable = deliverableUpdate(app);

  if (!latestVersion) {
    return {
      state: 'no-version',
      localVersion: local,
      latestVersion: '',
      updateAvailable: false,
      deliverable: false,
      label: 'No version published',
    };
  }
  if (!local) {
    return {
      state: 'no-baseline',
      localVersion: '',
      latestVersion,
      updateAvailable: false,
      deliverable,
      label: 'No version recorded in this browser',
    };
  }

  const delta = compareVersions(latestVersion, local);
  if (delta > 0) {
    return {
      state: 'update-available',
      localVersion: local,
      latestVersion,
      updateAvailable: true,
      deliverable,
      label: `Update available: v${latestVersion}`,
    };
  }
  if (delta === 0) {
    return {
      state: 'up-to-date',
      localVersion: local,
      latestVersion,
      updateAvailable: false,
      deliverable,
      label: `Up to date: v${latestVersion}`,
    };
  }
  return {
    state: 'catalog-behind',
    localVersion: local,
    latestVersion,
    updateAvailable: false,
    deliverable,
    label: `Catalog lists v${latestVersion}, older than your v${local}`,
  };
}

function asLines(value: string[] | string | undefined | null): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

/** The published release notes for the current version, verbatim. */
export function releaseNotesFor(app: UpdateAppLike | null | undefined): string[] {
  return asLines(app?.releaseNotes);
}

export interface ReleaseNoteEntry {
  version: string;
  /** Only a date the catalog actually carries for this version. */
  date: string | null;
  notes: string[];
  /** Where this entry came from, so the UI can say how sure it is. */
  source: 'current-release' | 'changelog';
}

/**
 * Version history, built ONLY from what the record carries:
 *  - the current release (version + apk.releaseDate + releaseNotes)
 *  - the declared previousVersion, if any
 *  - changelog lines, which this project writes as "vX.Y.Z: summary"
 * Nothing is inferred, dated or padded. An app with no such fields gets one
 * entry (or none) and the UI shows the honest empty state.
 */
export function versionHistoryFor(app: UpdateAppLike | null | undefined): ReleaseNoteEntry[] {
  if (!app) return [];
  const entries: ReleaseNoteEntry[] = [];
  const latest = latestVersionOf(app);
  const apkDate = typeof app.apk?.releaseDate === 'string' && DATE_PATTERN.test(app.apk.releaseDate) ? app.apk.releaseDate : null;

  if (latest) {
    const notes = releaseNotesFor(app);
    entries.push({
      version: latest,
      date: apkDate,
      notes,
      source: 'current-release',
    });
  }

  const previous = typeof app.previousVersion === 'string' ? app.previousVersion.trim() : '';
  const changelog = asLines(app.changelog);

  const seen = new Set(entries.map((e) => e.version));
  for (const line of changelog) {
    const match = line.match(/^v?(\d+(?:\.\d+){0,3})\s*[:\-–]\s*(.*)$/);
    if (!match) continue;
    const version = match[1];
    if (seen.has(version)) continue;
    seen.add(version);
    entries.push({
      version,
      date: null,
      notes: match[2] ? [match[2]] : [],
      source: 'changelog',
    });
  }

  if (previous && !seen.has(previous)) {
    entries.push({ version: previous, date: null, notes: [], source: 'changelog' });
  }

  // Newest first by the real comparator; entries without a date keep catalog
  // order after the dated current release.
  return entries.sort((a, b) => {
    if (a.source === 'current-release') return -1;
    if (b.source === 'current-release') return 1;
    return compareVersions(b.version, a.version);
  });
}

export interface RecentlyUpdatedEntry {
  app: UpdateAppLike;
  /** The record's own date string (ISO date), or null when it has none. */
  date: string | null;
  /** Where the date came from — shown to the reader. */
  dateField: 'apk.releaseDate' | 'lastUpdated' | 'releaseDate' | null;
}

/** Newest published releases first, using only dates the catalog carries. */
export function recentlyUpdated(apps: UpdateAppLike[], limit = 4): RecentlyUpdatedEntry[] {
  const rows: RecentlyUpdatedEntry[] = [];
  for (const app of apps) {
    if (!isPublished(app)) continue;
    const candidates: Array<[RecentlyUpdatedEntry['dateField'], unknown]> = [
      ['apk.releaseDate', app.apk?.releaseDate],
      ['lastUpdated', app.lastUpdated],
      ['releaseDate', app.releaseDate],
    ];
    const found = candidates.find(([, value]) => typeof value === 'string' && DATE_PATTERN.test(value));
    rows.push({
      app,
      date: found ? (found[1] as string) : null,
      dateField: found ? found[0] : null,
    });
  }
  return rows
    .sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    })
    .slice(0, Math.max(0, limit));
}

export interface UpdateCenterBuckets {
  available: Array<{ app: UpdateAppLike; knowledge: VersionKnowledge }>;
  upToDate: Array<{ app: UpdateAppLike; knowledge: VersionKnowledge }>;
  /** Apps this browser has no baseline for — explicitly not "up to date". */
  unknown: Array<{ app: UpdateAppLike; knowledge: VersionKnowledge }>;
  /** Records with no published version or no deliverable artifact. */
  unverifiable: Array<{ app: UpdateAppLike; knowledge: VersionKnowledge }>;
  totalPublished: number;
}

/**
 * Bucket the published catalog against this browser's local records.
 * `localVersions` maps app id -> version recorded locally ('' when none).
 */
export function buildUpdateCenter(
  apps: UpdateAppLike[],
  localVersions: Record<string, string>
): UpdateCenterBuckets {
  const buckets: UpdateCenterBuckets = {
    available: [],
    upToDate: [],
    unknown: [],
    unverifiable: [],
    totalPublished: 0,
  };
  for (const app of apps) {
    if (!isPublished(app)) continue;
    buckets.totalPublished += 1;
    const id = app.id || app.slug || '';
    const knowledge = versionKnowledge(app, localVersions[id] || '');
    if (knowledge.state === 'update-available') buckets.available.push({ app, knowledge });
    else if (knowledge.state === 'up-to-date') buckets.upToDate.push({ app, knowledge });
    else if (knowledge.state === 'no-baseline') buckets.unknown.push({ app, knowledge });
    else buckets.unverifiable.push({ app, knowledge });
  }
  return buckets;
}

/**
 * Web-app update indicator. A website is not a versioned artifact this browser
 * can diff, so the only truthful statement is about where the user should go.
 */
export function webUpdateHint(app: UpdateAppLike | null | undefined): { state: 'web-always-current' | 'no-web-target'; label: string; url: string } {
  const url = (app?.launchUrl || app?.webUrl || '').trim();
  if (!url) {
    return {
      state: 'no-web-target',
      label: 'No web experience published for this app',
      url: '',
    };
  }
  return {
    state: 'web-always-current',
    label: 'Web version loads the latest published build on every visit',
    url,
  };
}
