/**
 * URL safety utilities (Phase 9 security hardening).
 *
 * Client-side defense-in-depth for user-supplied URLs. The authoritative
 * SSRF protection lives in the Cloudflare Worker (analyze-url fetches the
 * target server-side); these checks ensure the browser never even sends
 * obviously unsafe targets, and that rendered external links are safe.
 */

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
}

const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // private class A
  /^192\.168\./, // private class C
  /^172\.(1[6-9]|2\d|3[01])\./, // private class B
  /^0\./, // 0.0.0.0/8
  /^169\.254\./, // link-local incl. cloud metadata endpoints
  /^192\.0\.0\./, // IETF protocol assignments
  /^198\.1[89]\./, // benchmarking ranges
];

export function checkExternalUrl(rawUrl: string): UrlSafetyResult {
  const raw = (rawUrl || '').trim();
  if (!raw) return { safe: false, reason: 'URL is empty.' };

  // Block dangerous schemes outright.
  const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'https' && scheme !== 'http') {
      return { safe: false, reason: `Scheme "${scheme}" is not allowed. Only http(s) URLs are permitted.` };
    }
  } else if (!raw.startsWith('//')) {
    return { safe: false, reason: 'URL must include an http(s) scheme.' };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { safe: false, reason: 'URL is not valid.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { safe: false, reason: 'Only http(s) URLs are permitted.' };
  }

  const host = url.hostname.toLowerCase();

  // Localhost and internal names.
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'local' || host.endsWith('.local') || host.endsWith('.internal')) {
    return { safe: false, reason: 'Local and internal hostnames are not allowed.' };
  }

  // Private / link-local / metadata IPv4 ranges.
  if (PRIVATE_IPV4_PATTERNS.some((p) => p.test(host))) {
    return { safe: false, reason: 'Private, loopback, and link-local addresses are not allowed.' };
  }

  // Private / link-local IPv6 (and any bracketed IPv6).
  if (host.startsWith('[')) {
    const v6 = host.replace(/^\[|\]$/g, '');
    const lower = v6.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80') ||
      lower.startsWith('fec0')
    ) {
      return { safe: false, reason: 'Private and link-local IPv6 addresses are not allowed.' };
    }
  }

  // Bare IPv6 without brackets that is obviously local.
  if (host.includes(':') && (host === '::1' || host.startsWith('fe80') || host.startsWith('fd'))) {
    return { safe: false, reason: 'Private and link-local IPv6 addresses are not allowed.' };
  }

  return { safe: true };
}

/** Strict variant for URLs that must be HTTPS (production launch URLs, release links). */
export function checkHttpsUrl(rawUrl: string): UrlSafetyResult {
  const base = checkExternalUrl(rawUrl);
  if (!base.safe) return base;
  try {
    if (new URL(rawUrl.trim()).protocol !== 'https:') {
      return { safe: false, reason: 'An HTTPS URL is required.' };
    }
  } catch {
    return { safe: false, reason: 'URL is not valid.' };
  }
  return { safe: true };
}

/** True when a URL string is safe to render as an <a href> (no javascript:/data:). */
export function isRenderableHref(rawUrl?: string | null): boolean {
  if (!rawUrl) return false;
  const raw = rawUrl.trim().toLowerCase();
  if (raw.startsWith('javascript:') || raw.startsWith('data:') || raw.startsWith('vbscript:')) {
    return false;
  }
  return true;
}
