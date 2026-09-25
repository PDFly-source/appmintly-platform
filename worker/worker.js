/**
 * AppMintly Publisher API — Cloudflare Worker
 * ============================================================
 * Independent, lightweight production backend for the AppMintly
 * Publisher Console (GitHub Pages static frontend).
 *
 *   Publisher Console (browser, publish-key authorized)
 *        ↓ HTTPS
 *   THIS Cloudflare Worker (appmintly-publisher-api)
 *        ↓ GitHub API (server-side fine-grained PAT)
 *   GitHub Actions (release-android-apk.yml) / Repository (data/apps.json)
 *        ↓
 *   Production APK pipeline + GitHub Pages marketplace
 *
 * Endpoints (frontend contract preserved from the previous Base44 layer):
 *   GET  /                    -> health/config probe: { ok, service, endpoints }
 *   POST /analyze-url        -> { success, data: DetectedMetadata } | { success:false, error }
 *   POST /upload-screenshot  -> { ok, path, url, sha, sizeBytes, uploaded } (publish-key authorized)
 *   POST /build-apk          -> { success, buildId, status:'QUEUED', runUrl? }
 *   GET  /build-apk?buildId= -> { success, status: QUEUED|BUILDING|SUCCESS|FAILED,
 *                                  runUrl, error?, apkMetadata? }
 *   GET  /publish-catalog    -> { configured, message }
 *   POST /publish-catalog    -> { success, message, commitSha, commitUrl, actionsUrl, deployedUrl }
 *
 * Security:
 *   - APPMINTLY_GITHUB_TOKEN and APPMINTLY_PUBLISH_KEY exist ONLY as
 *     Worker secrets (server-side env); never in the frontend bundle,
 *     responses or logs.
 *   - Publish key verified with constant-time comparison on every
 *     authenticated endpoint; never echoed or logged.
 *   - CORS: ONLY the production console origin https://pdfly-source.github.io.
 *     No wildcard origin. CORS is not the authentication mechanism.
 *   - Strict input validation, SSRF guards on /analyze-url, rate limits,
 *     duplicate-release and in-progress build protection (409).
 *   - Only real GitHub Actions state is reported. Dispatch accepted is
 *     never conflated with build success.
 *
 * No database: the buildId returned by /build-apk is a stateless
 * base64url token encoding {name, version, slug, packageId, runUrl};
 * status polling resolves the REAL workflow run from the GitHub API.
 */

const REPO = 'PDFly-source/appmintly-platform';
const RELEASE_WORKFLOW = 'release-android-apk.yml';
const DEPLOY_WORKFLOW = 'deploy.yml';
const CATALOG_PATH = 'data/apps.json';
const ALLOWED_ORIGIN = 'https://pdfly-source.github.io';
const UA = 'AppMintly-Publisher-Worker/1.0 (+https://pdfly-source.github.io/appmintly-platform/)';

const HTML_SIZE_LIMIT = 1_500_000;
const MANIFEST_SIZE_LIMIT = 200_000;
const FETCH_TIMEOUT_MS = 12_000;

/* ============================== CORS ============================== */

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  };
  if (origin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

/* ============================ utilities =========================== */

class SafeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Constant-time string comparison (no early-exit leak). */
function keysEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64urlEncode(obj) {
  const s = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function releaseTitle(name, version) {
  return `Release ${name} v${version}`;
}

/* =========================== rate limiting ======================== */
/* Best-effort per-isolate in-memory buckets. The authoritative guards   */
/* are the GitHub-side checks (duplicate release, in-progress run).      */

const buckets = new Map();

function rateLimited(kind, key, limit, windowMs) {
  const now = Date.now();
  const id = `${kind}:${key}`;
  const b = buckets.get(id);
  if (!b || now - b.start > windowMs) {
    buckets.set(id, { start: now, count: 1 });
    if (buckets.size > 5000) buckets.clear();
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

function clientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  );
}

/* ============================= GitHub ============================= */

async function github(token, endpoint, init) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
      'Content-Type': 'application/json',
      ...((init && init.headers) || {}),
    },
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 403) throw new SafeError(403, 'GitHub Actions permission is unavailable for this service.');
    if (res.status === 404 && endpoint.includes('contents')) throw new SafeError(502, 'The marketplace catalog could not be read from GitHub.');
    throw new SafeError(502, `GitHub API error (HTTP ${res.status}).`);
  }
  return { status: res.status, data };
}

async function readCatalog(token) {
  const { data } = await github(token, `/contents/${CATALOG_PATH}?ref=main`);
  if (data && typeof data.content === 'string' && data.encoding === 'base64') {
    const bin = atob(data.content.replace(/\n/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const apps = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(apps)) throw new SafeError(502, 'Catalog format on GitHub is invalid.');
    return { apps, sha: data.sha };
  }
  throw new SafeError(502, 'Unexpected catalog format from GitHub.');
}

/* ===================== canonical publisher catalog ================ */

const PUBLISHERS_PATH = 'data/publishers.json';

/** Read the repository-controlled publisher identities (fail-closed). */
async function readPublishers(token) {
  const { data } = await github(token, `/contents/${PUBLISHERS_PATH}?ref=main`);
  if (data && typeof data.content === 'string' && data.encoding === 'base64') {
    const bin = atob(data.content.replace(/\n/g, ''));
    const publishers = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(bin, (c) => c.charCodeAt(0))
    ));
    if (Array.isArray(publishers)) return publishers;
  }
  throw new SafeError(502, 'Publisher catalog on GitHub is unavailable or invalid.');
}

/* ======================= HTML metadata analysis =================== */

function resolveUrl(rel, base) {
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}

function extractTagAttribute(html, tagName, attribute, matchAttribute) {
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    if (matchAttribute && !new RegExp(`${matchAttribute.name}\\s*=\\s*["']?${matchAttribute.value}["']?`, 'i').test(fullTag)) continue;
    const attrMatch = fullTag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']*)["']`, 'i'));
    if (attrMatch && attrMatch[1]) return attrMatch[1].trim();
  }
  return null;
}

function extractMetaContent(html, nameOrProperty) {
  return (
    extractTagAttribute(html, 'meta', 'content', { name: 'property', value: nameOrProperty }) ||
    extractTagAttribute(html, 'meta', 'content', { name: 'name', value: nameOrProperty }) ||
    extractTagAttribute(html, 'meta', 'content', { name: 'http-equiv', value: nameOrProperty })
  );
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match && match[1] ? match[1].trim() : null;
}

async function fetchText(url, headers, timeoutMs, limit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers, redirect: 'follow' });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { text: '', ok: false, status: res.status };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return { text: (await res.text()).slice(0, limit), ok: true, status: res.status };
    }
    const decoder = new TextDecoder();
    let received = 0;
    let text = '';
    while (received < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      text += decoder.decode(value, { stream: true });
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    return { text, ok: true, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/* ========================== SSRF guards =========================== */

function isPrivateIPv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function assertSafePublicHttpsUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SafeError(400, 'Invalid URL format');
  }
  if (parsed.protocol !== 'https:') {
    throw new SafeError(400, 'Only secure HTTPS URLs are permitted for app distribution.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '[::1]' ||
    host === '::1' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':') ||
    isPrivateIPv4(host)
  ) {
    throw new SafeError(400, 'Private, local and IP-literal addresses are not permitted.');
  }
  if (parsed.username || parsed.password) {
    throw new SafeError(400, 'URLs with embedded credentials are not permitted.');
  }
  return parsed;
}

/* ========================= input validation ======================= */

function validateAppInput(app) {
  if (!app || typeof app !== 'object') throw new SafeError(400, 'Application data is required.');
  const name = typeof app.name === 'string' ? app.name.trim() : '';
  const slug = typeof app.slug === 'string' ? app.slug.trim() : '';
  const versionName = typeof app.versionName === 'string' ? app.versionName.trim() : '';
  const launchUrl = typeof app.launchUrl === 'string' ? app.launchUrl.trim() : '';
  if (!name || name.length > 80) throw new SafeError(400, 'Application name is required (max 80 characters).');
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) throw new SafeError(400, 'Invalid slug. Use lowercase letters, digits and hyphens (max 60).');
  if (!/^\d+\.\d+\.\d+$/.test(versionName)) throw new SafeError(400, 'Version must be numeric x.y.z (for example 2.0.1).');
  const [maj, min, pat] = versionName.split('.').map(Number);
  const versionCode = maj * 10000 + min * 100 + pat;
  if (versionCode < 1 || versionCode > 2000000) throw new SafeError(400, 'Version is outside the supported range.');

  const parsed = assertSafePublicHttpsUrl(launchUrl);

  let packageId = typeof app.packageId === 'string' ? app.packageId.trim() : '';
  if (!packageId) packageId = `com.appforge.${slug.replace(/[^a-z0-9]/g, '').slice(0, 30) || 'app'}`;
  if (packageId.length < 5 || packageId.length > 100) throw new SafeError(400, 'Package ID must be between 5 and 100 characters.');
  const parts = packageId.split('.');
  if (parts.length < 2) throw new SafeError(400, 'Package ID must contain at least one dot (for example com.appforge.myapp).');
  for (const part of parts) {
    if (!/^[a-z][a-z0-9_]*$/.test(part)) {
      throw new SafeError(400, 'Invalid package ID. Each segment must start with a lowercase letter and contain only lowercase letters, digits or underscores.');
    }
  }
  if (app.buildMode && app.buildMode !== 'webview') {
    throw new SafeError(400, 'Only the existing WebView engine is supported by this production build.');
  }
  const iconUrl = typeof app.iconUrl === 'string' ? app.iconUrl.trim() : '';
  if (iconUrl) {
    try {
      const u = new URL(iconUrl);
      if (u.protocol !== 'https:') throw new Error('');
    } catch {
      throw new SafeError(400, 'Icon URL must be a valid HTTPS URL.');
    }
  }
  const color = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : '');
  return {
    slug, name, versionName, launchUrl: parsed.toString(),
    packageId, iconUrl, themeColor: color(app.themeColor), backgroundColor: color(app.backgroundColor),
  };
}

/* ===================== protected catalog merging ================== */

const APK_PROTECTED_KEYS = [
  'sha256', 'versionName', 'versionCode', 'fileName', 'apkUrl', 'fileSizeBytes',
  'releaseTag', 'generatedAt', 'buildId', 'buildStatus', 'validation',
  // Phase 10.9: the remaining release-pipeline-written evidence fields are
  // equally authoritative — a browser submission can never write them.
  'verified', 'downloadAvailable', 'architecture', 'platform', 'releaseDate',
  // Phase 11.6 Part P: security-gate evidence written by the release
  // pipeline after every mandatory check passed. Browser submissions can
  // never create or modify these.
  'minSdk', 'targetSdk', 'certificateSubject', 'certificateSha256Fingerprint',
  'signatureSchemes', 'securityCheckStatus', 'securityCheckTimestamp',
  'validatorVersion', 'releaseId', 'assetId',
];

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  return s === 'archived' ? 'archived' : s === 'draft' ? 'draft' : 'published';
}

function validateIncomingCatalogApp(app) {
  if (!app || typeof app !== 'object') throw new SafeError(400, 'Invalid app payload.');
  const name = typeof app.name === 'string' ? app.name.trim() : '';
  const slug = typeof app.slug === 'string' ? app.slug.trim() : (typeof app.id === 'string' ? app.id.trim() : '');
  const launchUrl =
    typeof app.launchUrl === 'string' ? app.launchUrl.trim() :
    typeof app.url === 'string' ? app.url.trim() :
    typeof app.webUrl === 'string' ? app.webUrl.trim() :
    typeof app.pwaUrl === 'string' ? app.pwaUrl.trim() : '';
  if (!name || name.length > 80) throw new SafeError(400, 'App name is required (max 80 characters).');
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) throw new SafeError(400, 'Invalid app slug. Use lowercase letters, digits and hyphens.');
  if (!launchUrl || !/^https:\/\//.test(launchUrl)) throw new SafeError(400, 'A secure HTTPS launch URL is required.');
  if (!app.category || !String(app.category).trim()) throw new SafeError(400, 'App category is required.');
  if (app.version && !/^\d+\.\d+\.\d+$/.test(String(app.version).trim())) {
    throw new SafeError(400, 'Version must be numeric x.y.z.');
  }
  for (const field of ['url', 'launchUrl', 'webUrl', 'pwaUrl', 'icon', 'manifestUrl', 'startUrl', 'scope', 'apkUrl', 'playStoreUrl', 'appStoreUrl']) {
    const v = app[field];
    if (typeof v === 'string' && v.trim() && !/^(https?:\/\/|\/|#)/.test(v.trim())) {
      throw new SafeError(400, `Field "${field}" must be a valid URL.`);
    }
  }
  if (Array.isArray(app.screenshots)) {
    if (app.screenshots.length > 10) throw new SafeError(400, 'At most 10 screenshots are allowed.');
    for (const s of app.screenshots) {
      if (!isPermanentScreenshotValue(s)) {
        throw new SafeError(400, 'Screenshots must be AppMintly repository asset paths (/assets/apps/<slug>/screenshots/...) or valid HTTPS image URLs.');
      }
    }
  }
}

/* Permanent screenshot values: canonical repository asset paths or
 * verified HTTPS image URLs. data:/blob:/javascript:/http:/local or
 * private addresses and GitHub /blob/ page URLs are always rejected
 * (Phase 10.8 publish safety — server-enforced). */
const SCREENSHOT_PATH_RE = /^\/assets\/apps\/([a-z0-9-]{1,60})\/screenshots\/([A-Za-z0-9][A-Za-z0-9._-]{0,120})$/;

function isPrivateImageHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' || host === '::1' || host === '[::1]' || host.endsWith('.localhost') ||
      host === '127.0.0.1' || host === '0.0.0.0' || /^127\./.test(host) ||
      /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)
    );
  } catch {
    return true;
  }
}

function isPermanentScreenshotValue(s) {
  if (typeof s !== 'string') return false;
  const v = s.trim();
  if (SCREENSHOT_PATH_RE.test(v)) return true;
  if (/^https:\/\//.test(v)) return !isPrivateImageHost(v) && !/github\.com\/.*\/blob\//.test(v.toLowerCase());
  return false;
}

function mergeApp(existing, incoming) {
  const today = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();
  const status = normalizeStatus(incoming.status || 'published');

  const merged = {
    ...incoming,
    id: existing ? existing.id : (incoming.id || incoming.slug),
    slug: incoming.slug || existing?.slug,
    status,
    published: status === 'published',
    lastUpdated: today,
    updatedAt: nowIso,
    releaseDate: existing?.releaseDate || incoming.releaseDate || today,
    publishedAt: existing?.publishedAt || incoming.publishedAt || nowIso,
    featured: Boolean(incoming.featured),
    original: existing ? Boolean(existing.original) : Boolean(incoming.original),
    isDemo: false,
    features: Array.isArray(incoming.features) ? incoming.features : (existing?.features || []),
    tags: Array.isArray(incoming.tags) ? incoming.tags : (existing?.tags || []),
    screenshots: Array.isArray(incoming.screenshots) ? incoming.screenshots : (existing?.screenshots || []),
    changelog: Array.isArray(incoming.changelog) ? incoming.changelog : (existing?.changelog || []),
  };

  // Phase 10.9: publisher identity merges from the canonical record —
  // display name and slug survive an edit even if the editor omitted them,
  // and the record-level `verified` flag is NEVER stored (verification
  // resolves exclusively from data/publishers.json at render time).
  delete merged.verified;
  merged.developer = (typeof incoming.developer === 'string' && incoming.developer.trim()) ||
    (typeof existing?.developer === 'string' && existing.developer) || 'Unknown Developer';
  merged.developerSlug = (typeof incoming.developerSlug === 'string' && incoming.developerSlug.trim()) ||
    (typeof existing?.developerSlug === 'string' && existing.developerSlug) || '';

  // Protected APK release integrity: browser submissions can only set the
  // build intent fields; all release evidence comes from the production
  // release workflow only.
  const incomingApk = (incoming.apk && typeof incoming.apk === 'object') ? { ...incoming.apk } : {};
  const existingApk = (existing?.apk && typeof existing.apk === 'object') ? { ...existing.apk } : {};
  // Phase 10.9 distribution model: `apk.enabled` can only be true when a
  // REAL authoritative release exists (release-pipeline evidence: verified
  // + sha256). A listing without a released APK is a Web App only — the
  // catalog must never claim a fabricated Android APK.
  const hasAuthoritativeRelease = Boolean(existingApk.verified && existingApk.sha256);
  const apk = {
    enabled: incomingApk.enabled === true && hasAuthoritativeRelease,
    buildMode: incomingApk.buildMode || existingApk.buildMode || 'webview',
    packageId: incomingApk.packageId || existingApk.packageId || '',
    authorized: Boolean(incomingApk.authorized ?? existingApk.authorized ?? true),
  };
  for (const key of APK_PROTECTED_KEYS) {
    if (existingApk[key] !== undefined) apk[key] = existingApk[key];
    else if (incomingApk[key] === undefined) delete apk[key];
  }
  if (Object.keys(apk).length > 0) merged.apk = apk;
  else delete merged.apk;

  // Existing released APK URL must never be silently replaced from the browser.
  if (existing?.apkUrl && existing.apk?.sha256) merged.apkUrl = existing.apkUrl;

  return merged;
}

/* =========================== analyze URL ========================== */

async function handleAnalyzeUrl(request) {
  if (rateLimited('analyze', clientIp(request), 20, 60_000)) {
    throw new SafeError(429, 'Too many analysis requests. Please wait a minute and try again.');
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw new SafeError(400, 'Request body must be valid JSON.');
  }
  const targetUrl = String(body?.url || '').trim();
  if (!targetUrl) throw new SafeError(400, 'URL is required');
  const parsedTargetUrl = assertSafePublicHttpsUrl(targetUrl);

  const page = await fetchText(parsedTargetUrl.toString(), {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 APPMINTLY/1.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }, FETCH_TIMEOUT_MS, HTML_SIZE_LIMIT);
  if (!page.ok) {
    throw new SafeError(502, `The destination server returned HTTP ${page.status}. Automatic metadata access might be restricted by the website.`);
  }
  const html = page.text;

  const pageTitle = extractTitle(html) || '';
  const ogTitle = extractMetaContent(html, 'og:title') || '';
  const appNameMeta = extractMetaContent(html, 'application-name') || extractMetaContent(html, 'apple-mobile-web-app-title') || '';
  const metaDesc = extractMetaContent(html, 'description') || '';
  const ogDesc = extractMetaContent(html, 'og:description') || '';
  const ogImage = extractMetaContent(html, 'og:image') || '';
  const themeColorMeta = extractMetaContent(html, 'theme-color') || '';
  const hasServiceWorkerIndicator = /navigator\.serviceWorker\.register|serviceWorker|sw\.js|\/sw\b/i.test(html);

  // Locate manifest
  let manifestUrl = '';
  const manifestHref =
    extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'manifest' }) ||
    extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'manifest.webmanifest' });
  if (manifestHref) {
    manifestUrl = resolveUrl(manifestHref, parsedTargetUrl.toString());
  } else {
    for (const p of ['/manifest.json', '/manifest.webmanifest', '/app.webmanifest']) {
      const testUrl = resolveUrl(p, parsedTargetUrl.toString());
      const check = await fetchText(testUrl, { 'User-Agent': UA }, 5000, 1);
      if (check.ok) {
        manifestUrl = testUrl;
        break;
      }
    }
  }

  let manifestData = null;
  if (manifestUrl) {
    const m = await fetchText(manifestUrl, {
      'User-Agent': UA,
      Accept: 'application/manifest+json,application/json,*/*',
    }, 5000, MANIFEST_SIZE_LIMIT);
    if (m.ok) {
      try { manifestData = JSON.parse(m.text); } catch { manifestData = null; }
    }
  }

  const manifestName = typeof manifestData?.name === 'string' ? manifestData.name : '';
  const manifestShortName = typeof manifestData?.short_name === 'string' ? manifestData.short_name : '';
  const manifestDesc = typeof manifestData?.description === 'string' ? manifestData.description : '';
  const manifestThemeColor = typeof manifestData?.theme_color === 'string' ? manifestData.theme_color : '';
  const manifestBgColor = typeof manifestData?.background_color === 'string' ? manifestData.background_color : '';
  const manifestStartUrl = typeof manifestData?.start_url === 'string' ? resolveUrl(manifestData.start_url, manifestUrl || targetUrl) : targetUrl;
  const manifestScope = typeof manifestData?.scope === 'string' ? resolveUrl(manifestData.scope, manifestUrl || targetUrl) : targetUrl;
  const manifestDisplay = typeof manifestData?.display === 'string' ? manifestData.display : '';

  let cleanName = manifestName || appNameMeta || ogTitle || pageTitle || parsedTargetUrl.hostname;
  if (cleanName.includes(' — ')) cleanName = cleanName.split(' — ')[0].trim();
  if (cleanName.includes(' | ')) cleanName = cleanName.split(' | ')[0].trim();

  const cleanShortName = manifestShortName || appNameMeta || cleanName.slice(0, 15);
  const cleanDescription = manifestDesc || ogDesc || metaDesc || 'Modern application accessible in your web browser.';
  let cleanShortDescription = cleanDescription;
  if (cleanShortDescription.includes('.')) cleanShortDescription = cleanShortDescription.split('.')[0] + '.';
  if (cleanShortDescription.length > 90) cleanShortDescription = cleanShortDescription.slice(0, 87) + '...';

  let developer = '';
  const authorMeta = extractMetaContent(html, 'author');
  const siteName = extractMetaContent(html, 'og:site_name');
  if (authorMeta) developer = authorMeta;
  else if (siteName && siteName !== cleanName) developer = siteName;
  else developer = parsedTargetUrl.hostname.replace(/^www\./, '');

  const resolvedIcons = [];
  if (Array.isArray(manifestData?.icons)) {
    for (const ic of manifestData.icons) {
      if (ic && typeof ic.src === 'string') {
        resolvedIcons.push({
          src: resolveUrl(ic.src, manifestUrl || targetUrl),
          sizes: typeof ic.sizes === 'string' ? ic.sizes : undefined,
          type: typeof ic.type === 'string' ? ic.type : undefined,
          purpose: typeof ic.purpose === 'string' ? ic.purpose : undefined,
        });
      }
    }
  }
  const appleTouchIcon = extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'apple-touch-icon' });
  if (appleTouchIcon) resolvedIcons.push({ src: resolveUrl(appleTouchIcon, targetUrl), sizes: '180x180', purpose: 'apple-touch-icon' });
  const iconHref = extractTagAttribute(html, 'link', 'href', { name: 'rel', value: 'icon' });
  if (iconHref) resolvedIcons.push({ src: resolveUrl(iconHref, targetUrl), sizes: 'any', purpose: 'favicon' });

  let chosenIcon = '';
  const icon512 = resolvedIcons.find((i) => i.sizes?.includes('512x512'));
  const icon384 = resolvedIcons.find((i) => i.sizes?.includes('384x384'));
  const icon192 = resolvedIcons.find((i) => i.sizes?.includes('192x192'));
  const icon180 = resolvedIcons.find((i) => i.sizes?.includes('180x180') || i.purpose === 'apple-touch-icon');
  const iconSvg = resolvedIcons.find((i) => i.src.endsWith('.svg'));
  if (icon512) chosenIcon = icon512.src;
  else if (icon384) chosenIcon = icon384.src;
  else if (icon192) chosenIcon = icon192.src;
  else if (icon180) chosenIcon = icon180.src;
  else if (iconSvg) chosenIcon = iconSvg.src;
  else if (resolvedIcons[0]) chosenIcon = resolvedIcons[0].src;
  else if (ogImage) chosenIcon = resolveUrl(ogImage, targetUrl);

  const screenshots = [];
  if (Array.isArray(manifestData?.screenshots)) {
    for (const sc of manifestData.screenshots) {
      if (sc && typeof sc.src === 'string') screenshots.push(resolveUrl(sc.src, manifestUrl || targetUrl));
    }
  }
  if (ogImage && !screenshots.includes(resolveUrl(ogImage, targetUrl))) {
    screenshots.push(resolveUrl(ogImage, targetUrl));
  }

  const manifestDetected = Boolean(manifestData);
  const hasStandaloneDisplay = ['standalone', 'fullscreen', 'minimal-ui'].includes(manifestDisplay.toLowerCase());
  const hasAppropriateIcons = resolvedIcons.some(
    (i) => (i.sizes && (i.sizes.includes('192') || i.sizes.includes('512'))) || i.src.endsWith('.svg'),
  );
  const isInstallable = manifestDetected && hasStandaloneDisplay && hasAppropriateIcons && parsedTargetUrl.protocol === 'https:';

  let pwaStatus = 'Web App Only';
  if (isInstallable && hasServiceWorkerIndicator) pwaStatus = 'PWA Ready';
  else if (manifestDetected) pwaStatus = 'PWA Metadata Found';

  let suggestedCategory = 'Tools';
  const textCorpus = `${cleanName} ${cleanDescription} ${JSON.stringify(manifestData?.categories || '')}`.toLowerCase();
  if (/game|arcade|play|puzzle|rpg|shooter/i.test(textCorpus)) suggestedCategory = 'Games';
  else if (/pdf|convert|compress|editor|generator|format|code|util/i.test(textCorpus)) suggestedCategory = 'Tools';
  else if (/task|note|plan|habit|todo|calendar|manage|work/i.test(textCorpus)) suggestedCategory = 'Productivity';
  else if (/finance|budget|money|wallet|crypto|expense/i.test(textCorpus)) suggestedCategory = 'Finance';
  else if (/health|workout|fitness|timer|meditat|water/i.test(textCorpus)) suggestedCategory = 'Health';
  else if (/education|learn|study|school|math|science/i.test(textCorpus)) suggestedCategory = 'Education';
  else if (/music|audio|sound|drum|video|movie|media/i.test(textCorpus)) suggestedCategory = 'Entertainment';

  const suggestedType = isInstallable ? 'PWA' : suggestedCategory === 'Games' ? 'Web Game' : 'Web App';

  const result = {
    url: targetUrl,
    name: cleanName,
    shortName: cleanShortName,
    developer: developer || 'Independent Developer',
    description: cleanDescription,
    shortDescription: cleanShortDescription,
    icon: chosenIcon,
    icons: resolvedIcons,
    screenshots: screenshots.slice(0, 6),
    themeColor: manifestThemeColor || themeColorMeta || '#17191C',
    backgroundColor: manifestBgColor || '#FFFFFF',
    type: suggestedType,
    category: suggestedCategory,
    version: typeof manifestData?.version === 'string' ? manifestData.version : '1.0.0',
    manifestUrl,
    startUrl: manifestStartUrl,
    scope: manifestScope,
    pwa: {
      detected: manifestDetected,
      installable: isInstallable,
      manifestDetected,
      serviceWorkerDetected: hasServiceWorkerIndicator ? true : null,
      statusSummary: pwaStatus,
    },
    detectionSummary: {
      nameDetected: Boolean(cleanName),
      descriptionDetected: Boolean(cleanDescription),
      iconDetected: Boolean(chosenIcon),
      manifestFound: manifestDetected,
      screenshotsFound: screenshots.length > 0,
      serviceWorkerIndicator: hasServiceWorkerIndicator,
    },
  };

  return json(request, 200, { success: true, data: result });
}

/* ============================ build apk =========================== */

async function handleBuildPost(request, env) {
  if (!env.APPMINTLY_PUBLISH_KEY || !env.APPMINTLY_GITHUB_TOKEN) {
    throw new SafeError(503, 'Build service is not fully configured (server secrets missing).');
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw new SafeError(400, 'Request body must be valid JSON.');
  }
  const provided = typeof body.publishKey === 'string' ? body.publishKey : '';
  if (!provided || !keysEqual(provided, env.APPMINTLY_PUBLISH_KEY)) {
    throw new SafeError(401, 'Invalid or missing publish key.');
  }
  if (rateLimited('build-ip', clientIp(request), 6, 10 * 60_000)) {
    throw new SafeError(429, 'Build rate limit reached. Please wait a few minutes between production builds.');
  }

  const app = validateAppInput(body.app || {});
  const token = env.APPMINTLY_GITHUB_TOKEN;

  // Duplicate/completed-release protection
  const { apps } = await readCatalog(token);
  const existing = apps.find((a) => (a.apk && a.apk.packageId === app.packageId) || a.slug === app.slug);
  if (existing && existing.apk && existing.apk.packageId === app.packageId && existing.apk.sha256 && existing.apk.versionName === app.versionName) {
    throw new SafeError(409, `Version ${app.versionName} of ${existing.name || app.slug} is already published and verified. Increment the version to build a new release.`);
  }

  // In-progress run protection
  const { data: runsData } = await github(token, `/actions/workflows/${RELEASE_WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=25`);
  const inProgress = (runsData.workflow_runs || []).find(
    (r) => r.display_title === releaseTitle(app.name, app.versionName) && r.status !== 'completed',
  );
  if (inProgress) {
    throw new SafeError(409, `A production build of ${app.name} v${app.versionName} is already running.`);
  }

  // Dispatch the REAL production workflow
  await github(token, `/actions/workflows/${RELEASE_WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        app_name: app.name,
        package_id: app.packageId,
        version_name: app.versionName,
        source_url: app.launchUrl,
        icon_url: app.iconUrl,
        theme_color: app.themeColor,
        background_color: app.backgroundColor,
      },
    }),
  });

  // Resolve the run quickly for immediate console feedback (best-effort).
  let runUrl = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 2500));
    const { data } = await github(token, `/actions/workflows/${RELEASE_WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=10`);
    const run = (data.workflow_runs || []).find(
      (r) => r.display_title === releaseTitle(app.name, app.versionName) && r.status !== 'completed',
    );
    if (run) {
      runUrl = run.html_url;
      break;
    }
  }

  // Stateless buildId token: carries exactly what status polling needs.
  const buildId = b64urlEncode({
    n: app.name,
    v: app.versionName,
    s: app.slug,
    p: app.packageId,
    t: Date.now(),
  });

  return json(request, 200, { success: true, buildId, status: 'QUEUED', runUrl: runUrl || null });
}

async function handleBuildGet(request, env) {
  const url = new URL(request.url);
  const buildId = url.searchParams.get('buildId') || '';
  let payload;
  try {
    payload = b64urlDecode(buildId);
  } catch {
    return json(request, 400, { success: false, error: 'Invalid build ID.' });
  }
  if (!payload.n || !payload.v) {
    return json(request, 400, { success: false, error: 'Invalid build ID.' });
  }
  if (!env.APPMINTLY_GITHUB_TOKEN) {
    throw new SafeError(503, 'Build service is not fully configured (server secrets missing).');
  }
  if (rateLimited('poll-ip', clientIp(request), 120, 60_000)) {
    throw new SafeError(429, 'Too many status requests.');
  }

  const token = env.APPMINTLY_GITHUB_TOKEN;
  const { data } = await github(token, `/actions/workflows/${RELEASE_WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=25`);
  const run = (data.workflow_runs || []).find(
    (r) => r.display_title === releaseTitle(payload.n, payload.v),
  );

  if (!run) {
    return json(request, 200, { success: true, status: 'QUEUED', runUrl: null, error: null });
  }
  if (run.status !== 'completed') {
    return json(request, 200, { success: true, status: 'BUILDING', runUrl: run.html_url, error: null });
  }
  if (run.conclusion !== 'success') {
    return json(request, 200, {
      success: true,
      status: 'FAILED',
      runUrl: run.html_url,
      error: `GitHub Actions run ${run.conclusion || 'failed'}. Inspect ${run.html_url}`,
    });
  }

  // Run succeeded: read the real published release metadata from the catalog.
  let apkMetadata = null;
  try {
    const { apps } = await readCatalog(token);
    const entry = apps.find((a) => a.apk && a.apk.packageId === payload.p);
    if (entry && entry.apk && entry.apk.sha256) {
      apkMetadata = {
        packageId: entry.apk.packageId,
        versionName: entry.apk.versionName,
        versionCode: entry.apk.versionCode,
        fileName: entry.apk.fileName,
        apkUrl: entry.apk.apkUrl || entry.apkUrl || null,
        sha256: entry.apk.sha256,
        fileSizeBytes: entry.apk.fileSizeBytes,
        releaseTag: entry.apk.releaseTag || null,
        generatedAt: entry.apk.generatedAt || null,
      };
    }
  } catch {
    // Catalog read failure is surfaced as missing metadata, never fake data.
  }

  return json(request, 200, { success: true, status: 'SUCCESS', runUrl: run.html_url, error: null, apkMetadata, apkUrl: apkMetadata?.apkUrl || null });
}

/* ========================= publish catalog ======================= */

async function handlePublishGet(request, env) {
  const configured = Boolean(env.APPMINTLY_PUBLISH_KEY && env.APPMINTLY_GITHUB_TOKEN);
  return json(request, 200, {
    configured,
    message: configured
      ? 'Authorized AppMintly catalog publishing layer is configured.'
      : 'Publishing layer is not configured yet: worker secrets APPMINTLY_PUBLISH_KEY and APPMINTLY_GITHUB_TOKEN are required.',
  });
}

async function handlePublishPost(request, env) {
  if (!env.APPMINTLY_PUBLISH_KEY || !env.APPMINTLY_GITHUB_TOKEN) {
    throw new SafeError(503, 'Publishing layer is not configured (server secrets missing).');
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw new SafeError(400, 'Request body must be valid JSON.');
  }
  const provided = typeof body.publishKey === 'string' ? body.publishKey : '';
  if (!provided || !keysEqual(provided, env.APPMINTLY_PUBLISH_KEY)) {
    throw new SafeError(401, 'Invalid or missing publish key.');
  }
  if (rateLimited('publish-ip', clientIp(request), 12, 60_000)) {
    throw new SafeError(429, 'Too many publish requests. Please wait a minute.');
  }

  const incoming = body.app;
  validateIncomingCatalogApp(incoming);
  const token = env.APPMINTLY_GITHUB_TOKEN;

  // Read current catalog with its blob SHA (compare-and-swap protection)
  const { apps, sha } = await readCatalog(token);

  // Phase 10.9: publisher slugs validate server-side against the canonical
  // repository-controlled publisher catalog — the browser can never invent
  // or promote an identity.
  if (incoming.developerSlug) {
    const publishers = await readPublishers(token);
    const known = publishers.some(
      (p) => p && typeof p.slug === 'string' &&
        p.slug.toLowerCase() === String(incoming.developerSlug).toLowerCase()
    );
    if (!known) {
      throw new SafeError(400, `Unknown publisher identity "${incoming.developerSlug}". Only repository-approved publisher slugs may be used.`);
    }
  }

  const idx = apps.findIndex(
    (a) => String(a.id).toLowerCase() === String(incoming.id || incoming.slug).toLowerCase() ||
      String(a.slug).toLowerCase() === String(incoming.slug).toLowerCase(),
  );
  const existing = idx >= 0 ? apps[idx] : null;

  if (existing?.apk?.sha256 && incoming.apk && typeof incoming.apk === 'object' &&
      incoming.apk.packageId && existing.apk.packageId && incoming.apk.packageId !== existing.apk.packageId) {
    throw new SafeError(409, `Package ID of a released app is protected. Current release is ${existing.apk.packageId}.`);
  }

  const merged = mergeApp(existing, incoming);
  if (idx >= 0) apps[idx] = merged;
  else apps.unshift(merged);

  // Commit ONLY data/apps.json (compare-and-swap via blob sha)
  const put = await github(token, `/contents/${CATALOG_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `publisher-console: publish ${merged.slug} v${merged.version || '1.0.0'} (authorized console commit)`,
      content: utf8ToBase64(JSON.stringify(apps, null, 2)),
      sha,
      branch: 'main',
    }),
  });

  // Pages deployment: the PAT push itself triggers deploy.yml (data/** path);
  // dispatch it explicitly as well to match the audited architecture.
  let deployedUrl = 'https://pdfly-source.github.io/appmintly-platform/';
  try {
    await github(token, `/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    });
  } catch {
    deployedUrl = null;
  }

  return json(request, 200, {
    success: true,
    message: 'Published successfully. The production catalog was committed and the marketplace deployment was triggered.',
    // Phase 10.9 fix: report the REAL commit sha, not the file blob sha
    // (GitHub Contents PUT returns content.sha = blob; commit.sha = commit).
    commitSha: put.data?.commit?.sha || put.data?.content?.sha || null,
    commitUrl: put.data?.content?.html_url || put.data?.commit?.html_url || null,
    actionsUrl: `https://github.com/${REPO}/actions`,
    deployedUrl,
  });
}


/* ===================== screenshot asset upload ==================== */
/*
 * POST /upload-screenshot — authenticated screenshot media upload.
 *
 * Flow: Publisher Console (publish-key authorized) → this Worker →
 * GitHub Contents API creates the file under
 *   public/assets/apps/<validated-slug>/screenshots/<deterministic-name>
 * on main. Only that destination is possible: the repository path is
 * constructed server-side from a validated slug and a server-generated
 * filename; the browser can never supply an arbitrary repository path.
 *
 * Security:
 *  - origin-checked, constant-time publish-key auth (Bearer header or body)
 *  - per-IP rate limit
 *  - image content is sniffed from the actual bytes (PNG/JPEG/WebP magic);
 *    the browser-provided MIME type is never trusted
 *  - 10 MB max, strict base64 decode, no data:/blob: inputs
 *  - deterministic filename screenshot-<n>-<blobsha10>.<ext>; identical
 *    content is idempotent, different content never overwrites
 *  - no repository file is ever deleted through this endpoint
 */

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SCREENSHOT_MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Detect the real image type from magic bytes (never trust declared MIME). */
function sniffImageMime(bytes) {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

/** Git blob SHA-1 ("blob <len>\0" + content) for idempotency checks. */
async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const cat = new Uint8Array(header.length + bytes.length);
  cat.set(header, 0);
  cat.set(bytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', cat);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Phase 10.8.1 — dependency-free multipart/form-data parsing.
 *
 * The Publisher Console now uploads the REAL image file in a
 * browser-generated multipart body (FormData). This parser extracts the
 * parts directly from the raw request bytes; the client filename is read
 * but NEVER trusted (storage names are generated server-side below).
 * Returns { fields: {name: value}, files: [{ name, filename, bytes }] }.
 */
function parseMultipartForm(bytes, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  if (!m) throw new SafeError(400, 'Invalid multipart request (missing boundary).');
  const boundary = '--' + (m[1] || m[2]);
  // latin1 decode → byte-per-character string, so String.indexOf gives
  // exact byte offsets (fast native search, safe for binary bodies).
  // Byte-per-character string WITHOUT TextDecoder('latin1') — the
  // Cloudflare Workers runtime does not implement the legacy encoding
  // labels, so build the exact byte↔char mapping manually (chunked so
  // large binary bodies never hit the argument-length limit).
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  const dec = new TextDecoder();

  const fields = {};
  const files = [];
  let pos = bin.indexOf(boundary);
  if (pos < 0) throw new SafeError(400, 'Invalid multipart request body.');
  pos += boundary.length;

  while (pos < bytes.length) {
    if (bin[pos] === '-' && bin[pos + 1] === '-') break; // closing "--"
    if (bin[pos] === '\r' && bin[pos + 1] === '\n') pos += 2;
    else break;

    const headEnd = bin.indexOf('\r\n\r\n', pos);
    if (headEnd < 0) throw new SafeError(400, 'Invalid multipart request (malformed part).');
    const headerText = bin.slice(pos, headEnd);
    const cd = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headerText);
    if (!cd) throw new SafeError(400, 'Invalid multipart request (missing Content-Disposition).');
    const nameM = /name="([^"]*)"/i.exec(cd[1]);
    const fileM = /filename="([^"]*)"/i.exec(cd[1]);
    const fieldName = nameM ? nameM[1] : '';

    const bodyStart = headEnd + 4;
    const next = bin.indexOf(boundary, bodyStart);
    if (next < 0) throw new SafeError(400, 'Invalid multipart request (unterminated part).');
    const bodyEnd = Math.max(bodyStart, next - 2); // strip the trailing CRLF
    const body = bytes.slice(bodyStart, bodyEnd);

    if (fileM) {
      files.push({ name: fieldName, filename: fileM[1], bytes: body });
    } else {
      fields[fieldName] = dec.decode(body);
    }
    pos = next + boundary.length;
  }
  return { fields, files };
}

/** Standard base64 encode of raw bytes (chunked — safe for large buffers). */
function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Strict standard-base64 decode → bytes; throws on any invalid character. */
function decodeBase64Strict(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw new SafeError(400, 'Invalid image payload encoding.');
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function handleUploadScreenshot(request, env) {
  if (!env.APPMINTLY_PUBLISH_KEY || !env.APPMINTLY_GITHUB_TOKEN) {
    throw new SafeError(503, 'Upload service is not fully configured (server secrets missing).');
  }
  // Origin is validated in addition to CORS: only the production console.
  if ((request.headers.get('origin') || '') !== ALLOWED_ORIGIN) {
    throw new SafeError(403, 'Forbidden origin.');
  }
  // Phase 10.8.1: accept BOTH the browser-native multipart/form-data upload
  // (real image file, browser-generated boundary) and, for backward
  // compatibility with the previously deployed console, the legacy JSON
  // base64 body. Either way the image type is sniffed from the ACTUAL bytes.
  const contentType = request.headers.get('content-type') || '';
  let bytes;
  let slug;
  let bodyPublishKey;
  let imageBase64 = ''; // used by the GitHub Contents API commit below
  if (/multipart\/form-data/i.test(contentType)) {
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.length > SCREENSHOT_MAX_BYTES + 1024 * 1024) {
      throw new SafeError(413, 'Screenshot is too large. Maximum 10 MB per image.');
    }
    const form = parseMultipartForm(raw, contentType);
    const img = form.files.find((f) => f.name === 'image') || form.files[0];
    if (!img || img.bytes.length === 0) {
      throw new SafeError(400, 'No image file received. Attach the image as the "image" part.');
    }
    bytes = img.bytes; // raw image bytes — no data:/blob: encoding is possible
    imageBase64 = bytesToBase64(bytes);
    slug = String(form.fields.slug || '');
    bodyPublishKey = String(form.fields.publishKey || '');
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new SafeError(400, 'Request body must be valid JSON or multipart/form-data.');
    }
    slug = String(body.slug || '');
    bodyPublishKey = typeof body.publishKey === 'string' ? body.publishKey : '';
    imageBase64 = String(body.imageBase64 || '').trim();
    if (imageBase64.startsWith('data:') || imageBase64.startsWith('blob:')) {
      throw new SafeError(400, 'Temporary data:/blob: images cannot be uploaded. Send the raw image bytes.');
    }
    bytes = decodeBase64Strict(imageBase64);
  }

  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || bodyPublishKey;
  if (!provided || !keysEqual(provided, env.APPMINTLY_PUBLISH_KEY)) {
    throw new SafeError(401, 'Invalid or missing publish key.');
  }
  if (rateLimited('upload-ip', clientIp(request), 20, 60_000)) {
    throw new SafeError(429, 'Too many screenshot uploads. Please wait a minute.');
  }

  // Slug validation (identical rules to the catalog editor)
  slug = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) {
    throw new SafeError(400, 'Invalid app slug. Use lowercase letters, digits and hyphens (max 60).');
  }

  if (bytes.length === 0) throw new SafeError(400, 'Empty image.');
  if (bytes.length > SCREENSHOT_MAX_BYTES) {
    throw new SafeError(413, 'Screenshot is too large. Maximum 10 MB per image.');
  }
  const mime = sniffImageMime(bytes);
  if (!mime) {
    throw new SafeError(415, 'Unsupported image type. Only PNG, JPEG and WebP screenshots are accepted.');
  }

  const token = env.APPMINTLY_GITHUB_TOKEN;
  const ext = SCREENSHOT_MIME_EXT[mime];
  const blobSha = await gitBlobSha(bytes);
  const dir = `public/assets/apps/${slug}/screenshots`;

  // Deterministic, collision-free filename: the FIRST free index with this
  // content identity. Identical bytes already stored → idempotent success;
  // different content under an existing name → next index (never overwrite).
  let chosen = null;
  for (let n = 1; n <= 50; n++) {
    const name = `screenshot-${n}-${blobSha.slice(0, 10)}.${ext}`;
    const api = `https://api.github.com/repos/${REPO}/contents/${dir}/${name}?ref=main`;
    const res = await fetch(api, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': UA,
      },
    });
    if (res.status === 404) {
      chosen = { name, path: `${dir}/${name}`, alreadyStored: false };
      break;
    }
    if (!res.ok) throw new SafeError(502, `GitHub API error (HTTP ${res.status}).`);
    const data = await res.json().catch(() => null);
    if (data && typeof data.sha === 'string' && data.sha === blobSha) {
      // Exact same content already committed — idempotent response.
      chosen = { name: data.name, path: `${dir}/${data.name}`, alreadyStored: true };
      break;
    }
  }
  if (!chosen) {
    throw new SafeError(409, 'Screenshot storage limit reached for this app. Remove unused screenshots first.');
  }

  if (!chosen.alreadyStored) {
    const put = await github(token, `/contents/${chosen.path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `publisher: add screenshot for ${slug}`,
        content: imageBase64,
        branch: 'main',
      }),
    });
    if (!put.data || !put.data.content || put.data.content.sha !== blobSha) {
      throw new SafeError(502, 'GitHub did not confirm the screenshot commit.');
    }
  }

  // Pages deployment: the Contents-API push itself triggers deploy.yml
  // (public/** path filter); dispatch explicitly as well to match the
  // audited publish architecture. Best-effort, never blocks success.
  try {
    await github(token, `/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    });
  } catch {
    /* deployment still happens through the push trigger */
  }

  return json(request, 200, {
    ok: true,
    path: chosen.path.replace(/^public/, ''),
    url: `https://pdfly-source.github.io/appmintly-platform${chosen.path.replace(/^public/, '')}`,
    sha: blobSha,
    mime,
    sizeBytes: bytes.length,
    uploaded: !chosen.alreadyStored,
  });
}

/* ============================= router ============================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (path === '/' && request.method === 'GET') {
        // Root shape matches the live deployment contract the frontend
        // probes (checkPublishService expects status === 'online').
        return json(request, 200, {
          ok: true,
          service: 'AppMintly Publisher API',
          status: 'online',
          version: '1.1.0',
          endpoints: ['/analyze-url', '/build-apk', '/publish-catalog', '/upload-screenshot'],
          configured: Boolean(env.APPMINTLY_PUBLISH_KEY && env.APPMINTLY_GITHUB_TOKEN),
        });
      }
      if (path === '/upload-screenshot' && request.method === 'POST') {
        return await handleUploadScreenshot(request, env);
      }
      if (path === '/analyze-url' && request.method === 'POST') {
        return await handleAnalyzeUrl(request);
      }
      if (path === '/build-apk') {
        if (request.method === 'POST') return await handleBuildPost(request, env);
        if (request.method === 'GET') return await handleBuildGet(request, env);
        return json(request, 405, { success: false, error: 'Method not allowed.' });
      }
      if (path === '/publish-catalog') {
        if (request.method === 'GET') return await handlePublishGet(request, env);
        if (request.method === 'POST') return await handlePublishPost(request, env);
        return json(request, 405, { success: false, message: 'Method not allowed.' });
      }
      return json(request, 404, { success: false, error: 'Not found.' });
    } catch (err) {
      if (err instanceof SafeError) {
        return json(request, err.status, { success: false, error: err.message, message: err.message });
      }
      // Never leak stack traces or internals; never log secret material.
      return json(request, 500, { success: false, error: 'Unexpected server error.' });
    }
  },
};
