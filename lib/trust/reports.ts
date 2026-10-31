/**
 * AppMintly 2.0 — Item 9: Trust & Safety report client rules (pure, testable).
 *
 * These mirror the worker's validators so the form can explain a problem before
 * a request is made. The worker stays authoritative: it re-validates, sanitises,
 * rate-limits and deduplicates everything, and only it decides what is stored.
 *
 * HONESTY RULES ENCODED HERE
 * - A submitted report is a RECEIPT. No copy in this file says a report was
 *   investigated, confirmed, verified or resolved, because it cannot know that.
 * - Release integrity copy never claims an APK is malware-free, safe, scanned or
 *   "100% secure". A SHA-256 match only proves the file equals the published
 *   reference asset.
 * - Reports are private: there is no public list, counter or status endpoint.
 */

import type { AppItem } from '@/data/apps';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';

export const TRUST_API_BASE = 'https://appmintly-publisher-api.sbn50088.workers.dev';

export const REPORT_MESSAGE_MIN = 20;
export const REPORT_MESSAGE_MAX = 1200;
export const REPORT_CONTACT_MAX = 160;

export interface ReportCategory {
  id: string;
  label: string;
  hint: string;
}

/** Category ids are shared with the worker allowlist; labels live in the UI. */
export const REPORT_CATEGORIES: ReportCategory[] = [
  { id: 'suspicious-app', label: 'Suspicious application', hint: 'The listing looks like something other than what it claims to be.' },
  { id: 'broken-download', label: 'Broken APK download', hint: 'The download link fails, returns the wrong file, or never finishes.' },
  { id: 'incorrect-info', label: 'Incorrect app information', hint: 'Version, size, permissions or requirements look wrong.' },
  { id: 'suspicious-redirect', label: 'Suspicious or unexpected redirect', hint: 'The download sends you somewhere other than the official release.' },
  { id: 'release-integrity', label: 'Release integrity concern', hint: 'The checksum, signature or file does not match what is published.' },
  { id: 'other-safety', label: 'Other safety concern', hint: 'Anything else you believe the owner should look at.' },
];

export const REPORT_CATEGORY_IDS = REPORT_CATEGORIES.map((c) => c.id);

export function isValidReportCategory(value: unknown): boolean {
  return typeof value === 'string' && REPORT_CATEGORY_IDS.includes(value.trim().toLowerCase());
}

/** Mirrors the worker sanitiser. Never render report text as markup. */
export function sanitizeReportText(input: unknown, max = REPORT_MESSAGE_MAX): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<\s*\/?\s*[a-z][^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export interface ReportDraft {
  slug: string;
  category: string;
  message: string;
  contact: string;
}

export function validateReportDraft(raw: Partial<ReportDraft> | null | undefined): {
  ok: boolean;
  errors: string[];
  value: ReportDraft;
} {
  const input = raw || {};
  const errors: string[] = [];
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  const category = typeof input.category === 'string' ? input.category.trim().toLowerCase() : '';
  const message = sanitizeReportText(input.message);
  const contactRaw = sanitizeReportText(input.contact, REPORT_CONTACT_MAX);

  if (!SLUG_RE.test(slug)) errors.push('This app cannot be reported because its catalog slug is invalid.');
  if (!isValidReportCategory(category)) errors.push('Choose one of the listed report categories.');
  if (message.length < REPORT_MESSAGE_MIN) {
    errors.push(`Please describe the problem in at least ${REPORT_MESSAGE_MIN} characters.`);
  }
  if (contactRaw && !EMAIL_RE.test(contactRaw)) errors.push('The optional contact address does not look like an email address.');

  return { ok: errors.length === 0, errors, value: { slug, category, message, contact: contactRaw } };
}

/** What the visitor is told after a successful submission. Nothing more. */
export const RECEIPT_TEXT =
  'Your report was received. A person at AppMintly reviews safety reports; nothing has been investigated or resolved yet, and this is not a finding about the app.';

export const RECEIPT_TEXT_PRIVATE =
  'Reports are private. Other visitors cannot see your report, and the app listing is unchanged until the owner decides otherwise.';

/**
 * Map a worker error status to advice the form can show honestly.
 * 429 = rate limited, 409 = duplicate, 404 = app not published, 400 = invalid.
 */
export function describeReportFailure(status: number): string {
  if (status === 429) return 'You have sent several reports recently. Please wait an hour before sending more.';
  if (status === 409) return 'This exact report was already received. There is no need to send it twice.';
  if (status === 404) return 'This app is not in the published catalog right now, so it cannot be reported.';
  if (status === 403) return 'Reports must be submitted from AppMintly. Open the app page and try again.';
  if (status === 400) return 'The report could not be accepted. Check the category and the description.';
  return 'The report could not be sent right now. Please try again later.';
}

/* ------------------------------------------------------------------ */
/* Release integrity — only facts the release pipeline provides        */
/* ------------------------------------------------------------------ */

export interface ReleaseIntegrityFacts {
  version: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  sha256: string;
  verified: boolean;
  source: string;
  signatureSchemes: string[];
  releaseDate: string | null;
  packageId: string | null;
  officialAsset: boolean;
}

type AnyApp = AppItem & { apk?: Record<string, unknown> | object };

/**
 * Facts for the integrity panel. Returns null unless the release is
 * authoritative (enabled + verified + checksum + asset URL), so an unverified
 * listing can never show a "verified release" panel.
 */
export function releaseIntegrityFacts(app: AppItem | null | undefined): ReleaseIntegrityFacts | null {
  if (!app || !hasAuthoritativeApkRelease(app)) return null;
  const apk = ((app as AnyApp).apk || {}) as Record<string, unknown>;
  const sha = typeof apk.sha256 === 'string' ? apk.sha256 : '';
  if (sha.length < 32) return null;
  const schemes = apk.signatureSchemes && typeof apk.signatureSchemes === 'object'
    ? Object.entries(apk.signatureSchemes as Record<string, boolean>).filter(([, on]) => on).map(([k]) => k.toUpperCase())
    : [];
  const url = String(apk.apkUrl || (app as AnyApp & { apkUrl?: string }).apkUrl || '');
  return {
    version: typeof apk.versionName === 'string' ? apk.versionName : typeof app.version === 'string' ? app.version : null,
    fileName: typeof apk.fileName === 'string' ? apk.fileName : null,
    sizeBytes: typeof apk.fileSizeBytes === 'number' ? apk.fileSizeBytes : null,
    sha256: sha,
    verified: apk.verified === true,
    source: /^https:\/\/github\.com\/PDFly-source\/appmintly-releases\//.test(url)
      ? 'Official AppMintly GitHub release'
      : 'Publisher-supplied release asset',
    signatureSchemes: schemes,
    releaseDate: typeof apk.releaseDate === 'string' ? apk.releaseDate : null,
    packageId: typeof apk.packageId === 'string' ? apk.packageId : null,
    officialAsset: /^https:\/\/github\.com\/PDFly-source\/appmintly-releases\//.test(url),
  };
}

export function formatIntegrityBytes(bytes: number | null): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
}

export const CHECKSUM_PROVES = [
  'The file you downloaded is byte-for-byte the file AppMintly published a checksum for.',
  'A corrupted or swapped download does not match, and that mismatch is detectable.',
  'The checksum was recorded by the release pipeline, not typed by hand.',
];

export const CHECKSUM_DOES_NOT_PROVE = [
  'It does not prove the app is malware-free, or free of unwanted behaviour. AppMintly does not run antivirus scans on these files.',
  'That the app is safe, secure or risk-free.',
  'That the app works on your particular device.',
  'That the publisher is trustworthy beyond the file matching its published reference.',
];

/**
 * Security claims that must never appear in the affirmative.
 *
 * The guard is negation-aware on purpose. "This APK is malware-free" is
 * prohibited; "SHA-256 verification does not prove an APK is malware-free" is a
 * truthful disclosure and must be allowed to ship. A plain substring blacklist
 * cannot tell those apart, so claims are matched sentence by sentence and a
 * negation cue earlier in the same sentence marks the sentence as a disclaimer.
 */
const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /virus[- ]free/i,
  /malware[- ]free/i,
  /free of (viruses|malware)/i,
  /100% secure/i,
  /fully secure/i,
  /completely secure/i,
  /guaranteed safe/i,
  /antivirus (scanned|verified|clean|approved)/i,
  /security score/i,
  /threat score/i,
  /scanned for viruses/i,
  /no viruses/i,
  /passed (our )?(malware|virus) scan/i,
  /verified (safe|secure|clean)/i,
];

/** Words that mark a sentence as a disclaimer rather than a claim. */
const NEGATION_CUE =
  /\b(not|never|no|nothing|none|cannot|can't|doesn't|does not|didn't|isn't|aren't|wasn't|without|nor|neither|unproven|unverified|is not|are not)\b/i;

/** Exported for callers that want the raw pattern list (tests, tooling). */
export const FORBIDDEN_SECURITY_CLAIMS = new RegExp(FORBIDDEN_CLAIM_PATTERNS.map((r) => r.source).join('|'), 'i');

/**
 * Return the first sentence that makes a prohibited security claim, or null.
 * A sentence is exempt only when a negation cue appears BEFORE the claim.
 */
export function findForbiddenClaim(text: string): string | null {
  const sentences = String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      const match = pattern.exec(sentence);
      if (!match) continue;
      const before = sentence.slice(0, match.index);
      if (NEGATION_CUE.test(before)) continue;
      return sentence.slice(0, 160);
    }
  }
  return null;
}

/**
 * Return the first sentence that claims a moderation or safety outcome as fact.
 *
 * Only moderation/safety outcomes are matched here. The word "verified" is
 * deliberately excluded: "the release record was verified by the pipeline" is a
 * release-integrity fact, not a claim that a report was investigated or an app
 * is safe. Safety phrasing such as "verified safe" is caught by
 * findForbiddenClaim instead.
 */
export function findUnqualifiedOutcomeClaim(text: string): string | null {
  const sentences = String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const outcome = /\b(investigated|resolved|confirmed|approved|certified|cleared)\b/i;
  for (const sentence of sentences) {
    const match = outcome.exec(sentence);
    if (!match) continue;
    const before = sentence.slice(0, match.index);
    if (NEGATION_CUE.test(before) || NEGATION_CUE.test(sentence)) continue;
    return sentence.slice(0, 160);
  }
  return null;
}
