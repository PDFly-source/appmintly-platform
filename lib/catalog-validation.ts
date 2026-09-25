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

import { AppItem } from '@/data/apps';
import { CATEGORIES } from '@/data/categories';

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** APK/release fields that are production infrastructure and must never be
 *  changed through the catalog editor once a release is verified+enabled. */
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
  const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];
  for (const s of screenshots) {
    if (!isHttpsUrl(s) && !s.startsWith('data:image/')) {
      errors.push('Screenshots must be https:// URLs (or uploaded images).');
      break;
    }
  }
  if (screenshots.length > 10) errors.push('Maximum 10 screenshots allowed.');

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
  if (app.developerSlug && app.developerSlug !== 'pkd') {
    errors.push(`Unknown publisher identity "${app.developerSlug}". Only repository-approved publisher slugs may be used.`);
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
