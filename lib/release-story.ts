/**
 * Phase 1B — Release Stories: a narrative timeline built STRICTLY from
 * actual catalog/release metadata. Pure module — no storage, no React.
 *
 * HONESTY RULES:
 *  - Every story entry is derived from a real field on the app record
 *    (catalog data/apps.json + its apk release block). Nothing is invented:
 *    no guessed dates, no marketing copy, no fabricated history.
 *  - A section appears only when the underlying field actually exists.
 *    Missing metadata means a missing section — never a placeholder that
 *    implies facts.
 *  - Each entry carries `source` naming the exact record field it came
 *    from, so the UI can present the story as evidence-backed.
 */

import { hasAuthoritativeApkRelease } from '@/lib/distribution';

export interface StoryEntry {
  /** Short timeline label, e.g. "First published". */
  label: string;
  /** The concrete fact, already humanized (e.g. "Version 1.0.9"). */
  detail: string;
  /** The record field(s) this entry is derived from. */
  source: string;
  /** Optional ISO date for ordering/display. */
  at?: string;
}

export interface ReleaseStory {
  /** App name from the catalog record. */
  appName: string;
  /** Current catalog version (source: app.version). */
  version: string;
  /** Timeline entries, oldest first. */
  timeline: StoryEntry[];
  /** Release notes exactly as recorded (source: app.releaseNotes). */
  releaseNotes: string[];
}

type AppLike = {
  name?: string;
  version?: string;
  developer?: string;
  publishedAt?: string;
  releaseDate?: string;
  lastUpdated?: string;
  releaseNotes?: string[];
  apk?: {
    enabled?: boolean;
    verified?: boolean;
    sha256?: string;
    apkUrl?: string;
    versionName?: string;
    versionCode?: number;
    releaseDate?: string;
    platform?: string;
    architecture?: string;
    securityCheckStatus?: string;
    securityCheckTimestamp?: string;
    certificateSubject?: string;
    certificateSha256Fingerprint?: string;
    signatureSchemes?: { v1: boolean; v2: boolean; v3: boolean };
    validatorVersion?: string;
  } | null;
  apkUrl?: string;
};

function fmtDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Truncate a long hex string for display; keep it verifiable. */
export function shortHash(hash: string | undefined, visible = 12): string {
  if (!hash || typeof hash !== 'string') return '';
  return hash.length <= visible * 2 ? hash : `${hash.slice(0, visible)}…${hash.slice(-4)}`;
}

/**
 * Build the release story from a catalog record. Pure and total: always
 * returns a story object; the timeline simply contains fewer entries when
 * less metadata is present.
 */
export function buildReleaseStory(app: AppLike): ReleaseStory {
  const timeline: StoryEntry[] = [];

  const publishedAt = fmtDate(app.publishedAt);
  if (publishedAt) {
    timeline.push({
      label: 'Listed on AppMintly',
      detail: `${app.name} joined the marketplace${app.developer ? ` by ${app.developer}` : ''}.`,
      source: 'publishedAt, developer',
      at: app.publishedAt,
    });
  }

  const apk = app.apk;
  const hasApk =
    hasAuthoritativeApkRelease(app as never) &&
    apk &&
    typeof apk.versionName === 'string';

  if (hasApk && typeof apk!.releaseDate === 'string') {
    const relDate = fmtDate(apk!.releaseDate);
    if (relDate) {
      timeline.push({
        label: 'Latest release published',
        detail: `Version ${apk!.versionName} (build ${apk!.versionCode}) released on ${relDate} for ${apk!.platform || 'android'} (${apk!.architecture || 'universal'}).`,
        source: 'apk.releaseDate, apk.versionName, apk.versionCode',
        at: apk!.releaseDate,
      });
    }
  }

  if (hasApk && apk!.securityCheckStatus === 'passed') {
    timeline.push({
      label: 'Integrity verified in the release pipeline',
      detail: `Signed by ${apk!.certificateSubject || 'the publisher'}; signature schemes v1/v2/v3; SHA-256 fingerprint ${shortHash(apk!.certificateSha256Fingerprint)}. Checked by validator ${apk!.validatorVersion || 'the release pipeline'}.`,
      source:
        'apk.securityCheckStatus, apk.certificateSubject, apk.signatureSchemes, apk.certificateSha256Fingerprint, apk.validatorVersion',
      at: apk!.securityCheckTimestamp,
    });
  }

  const lastUpdated = fmtDate(app.lastUpdated);
  if (lastUpdated) {
    timeline.push({
      label: 'Catalog record updated',
      detail: `The marketplace record was last updated on ${lastUpdated}.`,
      source: 'lastUpdated',
      at: app.lastUpdated,
    });
  }

  // Oldest first, undated entries keep their relative order at the end.
  const dated = timeline.filter((e) => e.at);
  const undated = timeline.filter((e) => !e.at);
  dated.sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());

  return {
    appName: app.name || '',
    version: app.version || '',
    timeline: [...dated, ...undated],
    releaseNotes: Array.isArray(app.releaseNotes) ? app.releaseNotes : [],
  };
}
