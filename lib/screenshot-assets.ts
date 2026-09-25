/**
 * Phase 10.8 — canonical screenshot asset rules (shared by the Publisher
 * Console ScreenshotManager, catalog validation and the public app detail
 * page).
 *
 * A screenshot in the draft/catalog must be one of:
 *  1. A repository-relative asset path: /assets/apps/<slug>/screenshots/<file>
 *     (the canonical value produced by the authenticated /upload-screenshot
 *     backend, or imported from a GitHub blob URL / deployed AppMintly URL)
 *  2. A direct HTTPS image URL that has been verified to load as an image.
 *
 * Never allowed: data:, blob:, javascript:, http:, localhost/private
 * addresses, or GitHub HTML /blob/ page URLs (they are web pages, not
 * images — they produce broken previews).
 */

import { BASE_PATH } from '@/lib/api-path';

/** Valid canonical repository screenshot path (repository-relative). */
export const REPO_SCREENSHOT_PATH_RE =
  /^\/assets\/apps\/([a-z0-9-]{1,60})\/screenshots\/([A-Za-z0-9][A-Za-z0-9._-]{0,120})$/;

const APPMINTLY_SITE_PREFIX = 'https://pdfly-source.github.io/appmintly-platform';
const APPMINTLY_SITE_PREFIX_SLASH = APPMINTLY_SITE_PREFIX + '/';
const GITHUB_BLOB_RE =
  /^https:\/\/github\.com\/PDFly-source\/appmintly-platform\/blob\/([^/]+)\/(.+)$/i;
const GITHUB_RAW_RE =
  /^https:\/\/raw\.githubusercontent\.com\/PDFly-source\/appmintly-platform\/([^/]+)\/(.+)$/i;

export type NormalizedScreenshot =
  | { kind: 'repo'; value: string }
  | { kind: 'https'; value: string }
  | { kind: 'error'; error: string };

/**
 * Convert any supported user input into a canonical catalog value.
 * Accepts:
 *  - direct HTTPS image URL (kept as-is, caller must verify it loads)
 *  - repository-relative path /assets/apps/.../screenshots/...
 *  - deployed AppMintly URL (canonicalized to the repository-relative path)
 *  - GitHub blob/raw URLs of THIS repository (canonicalized to the
 *    repository-relative path — never stored as GitHub page URLs)
 */
export function normalizeScreenshotInput(raw: string): NormalizedScreenshot {
  const input = raw.trim();
  if (!input) return { kind: 'error', error: 'Enter a screenshot URL.' };

  const lower = input.toLowerCase();
  if (lower.startsWith('data:')) {
    return { kind: 'error', error: 'data: URLs are not permanent. Upload the image instead.' };
  }
  if (lower.startsWith('blob:')) {
    return { kind: 'error', error: 'blob: URLs are not permanent. Upload the image instead.' };
  }
  if (lower.startsWith('javascript:')) {
    return { kind: 'error', error: 'Invalid screenshot URL.' };
  }
  if (lower.startsWith('http://')) {
    return { kind: 'error', error: 'Screenshot URLs must use https://.' };
  }

  // Deployed AppMintly URL → repository-relative path
  if (input.startsWith(APPMINTLY_SITE_PREFIX_SLASH)) {
    const rel = input.slice(APPMINTLY_SITE_PREFIX_SLASH.length).split('?')[0];
    if (!REPO_SCREENSHOT_PATH_RE.test('/' + rel.replace(/^\//, '')) &&
        !REPO_SCREENSHOT_PATH_RE.test('/' + rel)) {
      return {
        kind: 'error',
        error: 'Only AppMintly screenshot assets (/assets/apps/<slug>/screenshots/...) are supported.',
      };
    }
    const path = '/' + rel.replace(/^\//, '');
    return REPO_SCREENSHOT_PATH_RE.test(path)
      ? { kind: 'repo', value: path }
      : { kind: 'error', error: 'Invalid AppMintly screenshot asset path.' };
  }

  // GitHub blob / raw page URLs of this repository → repository-relative path
  let repoInner: string | null = null;
  const asBlob = GITHUB_BLOB_RE.exec(input);
  const asRaw = GITHUB_RAW_RE.exec(input);
  if (asBlob) repoInner = asBlob[2];
  else if (asRaw) repoInner = asRaw[2];
  if (repoInner !== null) {
    const rel = repoInner.replace(/^public\//, '').replace(/^\/+/, '');
    const path = '/' + rel;
    if (!REPO_SCREENSHOT_PATH_RE.test(path)) {
      return {
        kind: 'error',
        error: 'Only screenshot assets under public/assets/apps/<slug>/screenshots/ can be imported from GitHub URLs.',
      };
    }
    return { kind: 'repo', value: path };
  }
  if (input.toLowerCase().includes('github.com/') || input.toLowerCase().includes('githubusercontent.com/')) {
    return {
      kind: 'error',
      error: 'Only AppMintly repository screenshot URLs can be imported from GitHub.',
    };
  }

  // Repository-relative path
  if (input.startsWith('/')) {
    if (!REPO_SCREENSHOT_PATH_RE.test(input)) {
      return {
        kind: 'error',
        error: 'Repository paths must look like /assets/apps/<slug>/screenshots/<file>.',
      };
    }
    return { kind: 'repo', value: input };
  }

  // Direct HTTPS URL
  if (input.startsWith('https://')) {
    if (!isAllowedExternalImageHost(input)) {
      return {
        kind: 'error',
        error: 'Image URL could not be verified. Use an AppMintly repository asset or upload the image.',
      };
    }
    return { kind: 'https', value: input };
  }

  return { kind: 'error', error: 'Invalid screenshot URL.' };
}

/** Reject localhost / loopback / private-network hostnames and IP literals. */
export function isAllowedExternalImageHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return false;
  }
  return true;
}

/**
 * Permanent screenshot values allowed in the draft/catalog:
 * canonical repository asset paths or verified HTTPS image URLs.
 * Everything else (data:, blob:, javascript:, http:, local/private
 * addresses, GitHub /blob/ pages) is rejected.
 */
export function isPermanentScreenshotUrl(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim();
  if (REPO_SCREENSHOT_PATH_RE.test(s)) return true;
  if (s.startsWith('https://')) return isAllowedExternalImageHost(s);
  return false;
}

/**
 * Resolve a catalog screenshot value to the browser display URL.
 * Repository-relative paths are prefixed with the Pages base path
 * (/appmintly-platform for the static GitHub Pages build).
 */
export function resolveAssetDisplayUrl(value: string): string {
  const s = value.trim();
  if (s.startsWith('/')) return `${BASE_PATH}${s}`;
  return s;
}

/** Verify an HTTPS URL actually renders as an image (client-side). */
export function verifyHttpsImageLoads(
  url: string,
  timeoutMs = 10_000
): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = img.onerror = null;
      img.src = '';
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/* ============================================================
 * Phase 10.8.1 — real file-type detection for local uploads.
 *
 * Android file providers frequently deliver genuine PNG/JPEG/WebP
 * files with an EMPTY File.type or an unofficial MIME such as
 * "image/jpg". Declared MIME is therefore only a fast path; the
 * actual file signature (magic bytes) is authoritative, with the
 * filename extension as a last-resort hint. The authorized
 * /upload-screenshot Worker independently re-sniffs the bytes, so
 * a disguised non-image can never reach the repository even if a
 * client-side check is fooled.
 * ============================================================ */

/** Detect the image type from the first bytes (PNG/JPEG/WebP signatures). */
export function sniffImageType(head: Uint8Array): string | null {
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Declared MIME fast-path values (incl. the common Android "image/jpg" alias). */
const SUPPORTED_DECLARED_TYPES: Record<string, string> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};

/**
 * Resolve whether a locally selected file is a supported image, WITHOUT
 * relying on File.type alone. Order: declared MIME (fast path) → actual
 * magic bytes → filename extension. Returns the canonical MIME type or
 * null when the file is not a PNG/JPEG/WebP image.
 */
export async function detectImageType(file: Blob & { name?: string }): Promise<string | null> {
  const declared = (file.type || '').toLowerCase().trim();
  if (SUPPORTED_DECLARED_TYPES[declared]) return SUPPORTED_DECLARED_TYPES[declared];
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (sniffed) return sniffed;
  const ext = ((file as File).name || '').toLowerCase().match(/\.(png|jpe?g|webp)$/);
  if (ext) return ext[1] === 'png' ? 'image/png' : ext[1] === 'webp' ? 'image/webp' : 'image/jpeg';
  return null;
}
