/**
 * Phase 5 — Shared catalog validation.
 *
 * Used by the Publisher Console before save/publish and by the authorized
 * publishing layer (server side re-validates everything independently).
 *
 * Rules:
 * - presentation/catalog metadata must be complete and truthful
 * - protected production APK release metadata must never change through
 *   catalog edits
 * - a publisher can never grant itself verification state
 */

import { AppItem, PrivacyTechFacts, PreviewMedia } from '@/data/apps';
import { isPermanentScreenshotUrl } from '@/lib/screenshot-assets';
import { CATEGORIES } from '@/data/categories';

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** APK/release fields that are production infrastructure and must never be
 *  changed through the catalog editor once a release is verified+enabled. */
import { PUBLISHERS } from '@/data/publishers';

export const PROTECTED_APK_FIELDS = [
  'enabled',
  'buildMode',
  'packageId',
  'versionName',
  'versionCode',
  'fileName',
  'apkUrl',
  'fileSizeBytes',
  'sha256',
  'releaseTag',
  'buildStatus',
  'generatedAt',
  'buildId',
  'verified',
  'downloadAvailable',
  'authorized',
] as const;

/** Top-level fields mirrored from the protected APK release record. */
export const PROTECTED_APP_FIELDS = [
  'version',
  'previousVersion',
  'size',
  'apkUrl',
  'apk',
] as const;

const VALID_TYPES = ['Web App', 'PWA', 'Android APK', 'Game', 'Tool', 'Website', 'App'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isHttpsOrRepoAsset(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith('https://')) return true;
  // Repository-served asset under the GitHub Pages base path
  if (url.startsWith('/')) return true;
  return false;
}

export function isHttpsUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (!url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/** Phase 11 — preview media constraints. */
export const PREVIEW_MEDIA_MAX_BYTES = 4 * 1024 * 1024; // 4 MB hard ceiling
const PREVIEW_MEDIA_TYPES = ['video', 'gif'] as const;
const PREVIEW_MEDIA_EXT = ['.webm', '.mp4', '.gif'];

/** Rejects data:/blob:/javascript:/http: and non-allowlisted media types. */
export function isSafePreviewMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  if (!url.startsWith('https://')) return false; // data:, blob:, javascript:, http: rejected
  try {
    const parsed = new URL(url);
    return PREVIEW_MEDIA_EXT.some((ext) => parsed.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}

/** Phase 11 — validate the optional previewMedia block. */
function validatePreviewMedia(media: PreviewMedia | undefined, errors: string[]): void {
  if (!media) return;
  if (!PREVIEW_MEDIA_TYPES.includes(media.type)) {
    errors.push('Preview media type must be "video" or "gif".');
  }
  if (!isSafePreviewMediaUrl(media.url)) {
    errors.push(
      'Preview media must be a permanent repository asset (/assets/...) or a verified HTTPS .webm/.mp4/.gif URL. data:/blob:/javascript: URLs are rejected.'
    );
  }
  if (!isHttpsOrRepoAsset(media.poster)) {
    errors.push('Preview media poster must be a permanent repository asset or an https:// image URL.');
  }
  if (media.maxBytes !== undefined && (media.maxBytes <= 0 || media.maxBytes > PREVIEW_MEDIA_MAX_BYTES)) {
    errors.push(`Preview media size ceiling must be between 1 and ${PREVIEW_MEDIA_MAX_BYTES} bytes.`);
  }
}

/** Phase 11 — validate the optional privacyTech facts block (truthfulness:
 *  structure and URL-safety only; semantic claims stay the publisher's
 *  responsibility and unverified values render as "Not verified"). */
function validatePrivacyTech(facts: PrivacyTechFacts | undefined, errors: string[]): void {
  if (!facts) return;
  const PERMISSION_SOURCES = ['apk-manifest', 'platform-code', 'publisher-declared'];
  if (facts.permissionsSource && !PERMISSION_SOURCES.includes(facts.permissionsSource)) {
    errors.push('privacyTech.permissionsSource must be "apk-manifest", "platform-code" or "publisher-declared".');
  }
  if (facts.permissions && !Array.isArray(facts.permissions)) {
    errors.push('privacyTech.permissions must be an array of permission identifiers.');
  }
  const NETWORK = ['online-only', 'offline-capable', 'unknown'];
  if (facts.networkRequirement && !NETWORK.includes(facts.networkRequirement)) {
    errors.push('privacyTech.networkRequirement must be "online-only", "offline-capable" or "unknown".');
  }
  const PWA = ['verified-installable', 'not-installable', 'unknown'];
  if (facts.pwaSupport && !PWA.includes(facts.pwaSupport)) {
    errors.push('privacyTech.pwaSupport must be "verified-installable", "not-installable" or "unknown".');
  }
  if (facts.externalServices && !Array.isArray(facts.externalServices)) {
    errors.push('privacyTech.externalServices must be an array of service names.');
  }
}

/**
 * Validate an app record for save/publish.
 * `original` is the authoritative catalog record for an existing app (if any).
 */
/**
 * Compare dotted numeric versions ("2.1.0"). Returns >0 when a is newer,
 * <0 when older, 0 when equal, null when either side is not parseable.
 */
function compareDottedVersion(a: string, b: string): number | null {
  const pa = a.trim().split('.').map((n) => parseInt(n, 10));
  const pb = b.trim().split('.').map((n) => parseInt(n, 10));
  if (pa.some(isNaN) || pb.some(isNaN) || pa.length === 0 || pb.length === 0) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function validateAppForPublish(
  app: Partial<AppItem>,
  catalog: AppItem[],
  original?: AppItem | null
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- Required presentation fields -------------------------------
  if (!app.name || !app.name.trim()) errors.push('App name is required.');
  if (app.name && app.name.trim().length < 2) errors.push('App name must be at least 2 characters.');

  if (!app.description || app.description.trim().length < 40)
    errors.push('Description is required and must be at least 40 characters.');
  if (!app.shortDescription || app.shortDescription.trim().length < 10)
    errors.push('Short description is required and must be at least 10 characters.');

  if (!app.category || !CATEGORIES.some((c) => c.name === app.category))
    errors.push(`Category "${app.category || ''}" is not a valid AppMintly category.`);

  if (!app.type || !VALID_TYPES.includes(app.type))
    errors.push(`App type "${app.type || ''}" is not a valid marketplace type.`);

  // ---- URLs --------------------------------------------------------
  if (!app.url?.trim() && !app.webUrl?.trim() && !app.apkUrl?.trim()) {
    errors.push('At least one application URL (web URL, or APK link) is required.');
  }
  for (const [label, url] of [
    ['Web App URL', app.url],
    ['Web URL', app.webUrl],
    ['PWA URL', app.pwaUrl],
  ] as [string, string | undefined][]) {
    if (url?.trim() && !isHttpsUrl(url)) errors.push(`${label} must be a valid https:// URL.`);
  }
  if (app.apkUrl?.trim() && !isHttpsUrl(app.apkUrl))
    errors.push('APK URL must be a valid https:// URL.');

  // ---- Icon --------------------------------------------------------
  if (!app.icon || !app.icon.trim()) {
    warnings.push('No icon set — the vector fallback will be used in the marketplace.');
  } else if (!isHttpsOrRepoAsset(app.icon)) {
    errors.push('Icon must be an https:// URL or a repository asset path starting with "/".');
  }

  // ---- Screenshots ---------------------------------------------------
  // Phase 10.8: production screenshots must be PERMANENT addresses —
  // canonical repository asset paths (/assets/apps/<slug>/screenshots/...)
  // or verified HTTPS image URLs. data:/blob:/javascript:/http:/local or
  // private addresses and GitHub /blob/ page URLs are always rejected,
  // field-level, client and server side.
  const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];
  screenshots.forEach((s, idx) => {
    if (!isPermanentScreenshotUrl(s)) {
      errors.push(
        `Screenshot ${idx + 1} uses a non-permanent image URL. Please upload the image again or provide a valid HTTPS image URL.`
      );
    }
  });
  if (screenshots.length > 10) errors.push('Maximum 10 screenshots allowed.');

  // ---- Phase 11: preview media & privacy facts ----------------------
  validatePreviewMedia((app as Partial<AppItem>).previewMedia, errors);
  validatePrivacyTech((app as Partial<AppItem>).privacyTech, errors);

  // ---- Tags / features ------------------------------------------------
  const tags = Array.isArray(app.tags) ? app.tags : [];
  for (const t of tags) {
    if (!/^[a-z0-9-]+$/.test(t)) {
      errors.push(`Tag "${t}" is invalid — use lowercase letters, digits and dashes.`);
      break;
    }
  }
  if (tags.length === 0) warnings.push('No tags set — the app will be harder to find in search.');
  if (!Array.isArray(app.features) || app.features.length === 0)
    warnings.push('No features listed — consider adding at least one.');

  // ---- Slug -----------------------------------------------------------
  const slug = (app.slug || (app.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
  if (!SLUG_RE.test(slug)) errors.push(`Slug "${slug}" is invalid — use lowercase letters, digits and dashes.`);

  // ---- Duplicate detection ---------------------------------------------
  const selfId = (app.id || slug).toLowerCase();
  const duplicate = catalog.find(
    (a) =>
      a.id.toLowerCase() === selfId ||
      a.slug.toLowerCase() === slug.toLowerCase()
  );
  if (duplicate && (!original || duplicate.id.toLowerCase() !== original.id.toLowerCase())) {
    errors.push(`An app with slug "${slug}" already exists in the catalog. Slugs must be unique.`);
  }

  // ---- Release version monotonicity (cannot be weakened) ----------------
  // A NEW release must be strictly greater than the already-released
  // version of the same application (same slug or same package id):
  // both the semantic version and the versionCode must increase. Editing
  // presentation fields of the SAME released version remains allowed.
  const released = catalog.find(
    (a) =>
      a.apk?.buildStatus === 'released' &&
      (a.slug.toLowerCase() === slug.toLowerCase() ||
        (Boolean(a.apk?.packageId) &&
          Boolean(app.apk?.packageId) &&
          a.apk!.packageId === app.apk!.packageId))
  );
  if (released?.apk?.versionCode && app.apk?.versionCode) {
    const newCode = app.apk.versionCode;
    const relCode = released.apk.versionCode;
    const newName = app.apk.versionName || '';
    const relName = released.apk.versionName || '';
    if (newCode < relCode) {
      errors.push(
        `Version code ${newCode} is not greater than released version code ${relCode}. Fix: enter a higher version code.`
      );
    } else if (newCode === relCode) {
      // Same versionCode: only a presentation-only edit of the SAME release
      // is allowed. A different versionName with the same code is invalid.
      if (newName && relName && newName !== relName) {
        errors.push(
          `Version ${newName} does not match released version ${relName} while the version code stays at ${relCode}. Fix: keep the released version name for metadata edits, or enter a higher version code for a new release.`
        );
      }
    } else {
      // Higher versionCode: the semantic version must also increase.
      const cmp = compareDottedVersion(newName, relName);
      if (newName && relName && cmp !== null && cmp <= 0) {
        errors.push(
          `Version ${newName} is not greater than released version ${relName}. Fix: enter a higher version number.`
        );
      }
    }
  }

  // ---- Publisher identity integrity --------------------------------------
  // Phase 10.9: publisher slugs validate against the canonical publisher
  // catalog (data/publishers.json) — the single source of truth for identity
  // and verification. Any repository-approved publisher is allowed; the
  // verification state itself is never taken from the app record.
  if (app.developerSlug) {
    const known = PUBLISHERS.some((p) => p.slug.toLowerCase() === String(app.developerSlug).toLowerCase());
    if (!known) {
      errors.push(`Unknown publisher identity "${app.developerSlug}". Only repository-approved publisher slugs may be used.`);
    }
  }
  // "verified" on an app record can never be set by the editor; verification
  // lives exclusively in data/publishers.json (repository-controlled).
  if (original?.apk?.verified && app.apk && !app.apk.verified) {
    errors.push('Verified release state cannot be removed through the editor.');
  }

  // ---- Protected APK metadata integrity ------------------------------------
  if (original && original.apk?.enabled && original.apk?.verified) {
    for (const field of PROTECTED_APK_FIELDS) {
      const a = (original.apk as unknown as Record<string, unknown>)[field];
      const b = (app.apk as unknown as Record<string, unknown> | undefined)?.[field];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        errors.push(
          `Protected release field "apk.${field}" cannot be changed through the editor (production APK releases are locked).`
        );
      }
    }
    for (const field of PROTECTED_APP_FIELDS) {
      const a = (original as unknown as Record<string, unknown>)[field];
      const b = (app as unknown as Record<string, unknown>)[field];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        errors.push(
          `Protected release field "${field}" cannot be changed through the editor (production APK releases are locked).`
        );
      }
    }
  }

  // ---- Structural JSON sanity --------------------------------------------
  try {
    JSON.stringify(app);
  } catch {
    errors.push('App data is not serializable to JSON.');
  }

  return { valid: errors.length === 0, errors, warnings };
}
