/**
 * Authorized production publishing client (Cloudflare Worker backend).
 *
 * Permanent publishing flow:
 *   Publisher Console → validate → POST to the AppMintly Publisher API
 *   (Cloudflare Worker) → server re-validates (incl. protected-field
 *   integrity) → commits data/apps.json on main via the GitHub Contents
 *   API → existing GitHub Actions workflow deploys GitHub Pages → live
 *   AppMintly.
 *
 * Security model:
 *   - NO GitHub token, secret or credential ever reaches the browser.
 *   - The Cloudflare Worker is authorized by a publish key, which the
 *     publisher enters at publish time (optionally remembered on the
 *     device); the Worker verifies it server-side (constant-time).
 *   - The Worker holds the least-privilege GitHub token (fine-grained
 *     PAT scoped to the platform repository) as a server-side secret;
 *     the token is never part of this client bundle.
 *   - The Worker can only ever modify data/apps.json (hard-coded path).
 *   - The browser never calls the GitHub API directly.
 */

import { AppItem } from '@/data/apps';

/**
 * Authorized publishing layer endpoint.
 * Configured once; the endpoint itself is public but every publish request
 * must present a valid publish key and pass full server-side validation.
 */
/**
 * AppMintly Publisher API — production Cloudflare Worker backend.
 * The Worker is the ONLY backend used by the live publishing path; it
 * performs all GitHub API/Actions operations server-side.
 */
export const PUBLISHER_API_BASE =
  'https://appmintly-publisher-api.sbn50088.workers.dev';

export const PUBLISH_ENDPOINT = `${PUBLISHER_API_BASE}/publish-catalog`;

/**
 * Authorized APK build service. Dispatches the real GitHub Actions
 * production build pipeline (release-android-apk.yml) after server-side
 * validation, and reports the actual workflow run status.
 */
export const BUILD_SERVICE_ENDPOINT = `${PUBLISHER_API_BASE}/build-apk`;

/**
 * Server-side metadata analyzer (Analyze URL). Fetches the target app URL
 * server-side and returns JSON; never parses HTML in the browser.
 */
export const ANALYZE_SERVICE_ENDPOINT = `${PUBLISHER_API_BASE}/analyze-url`;

export interface ServiceJsonResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  unavailable: boolean;
}

/**
 * fetch() a service endpoint and parse the body ONLY when the response is ok
 * and actually JSON. HTML error pages yield `unavailable: true` so callers
 * can show a truthful "service temporarily unavailable" message instead of
 * a JSON parse error. Mirrors lib/api-client.ts for absolute service URLs.
 */
export async function serviceFetchJson<T = any>(url: string, init?: RequestInit): Promise<ServiceJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, unavailable: true };
  }
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  let data: T | undefined;
  if (isJson) {
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, unavailable: true };
    }
  }
  if (!res.ok || !isJson) {
    return { ok: false, status: res.status, unavailable: !isJson, data };
  }
  return { ok: true, status: res.status, unavailable: false, data };
}

export interface ProductionPublishResult {
  success: boolean;
  message: string;
  commitSha?: string;
  commitUrl?: string;
  actionsUrl?: string;
  deployedUrl?: string;
}

export interface PublishServiceStatus {
  available: boolean;
  message?: string;
}

/**
 * Check that the authorized publishing layer (Cloudflare Worker) is online.
 * The Worker's root endpoint reports its health; availability of the
 * publish/build operations themselves is enforced server-side (publish key
 * + GitHub token live only in the Worker's secret store).
 */
export async function checkPublishService(): Promise<PublishServiceStatus> {
  try {
    const res = await fetch(PUBLISHER_API_BASE, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.status === 'online') {
      return {
        available: true,
        message: data.service || 'AppMintly Publisher API is online.',
      };
    }
    // Surface the real worker response when it is not online, so the
    // console states the actual situation truthfully.
    return {
      available: false,
      message:
        (data && (data.message || data.error || data.detail)) ||
        `Publishing service responded unexpectedly (HTTP ${res.status}).`,
    };
  } catch (err: any) {
    return { available: false, message: 'Publishing service unreachable — production publish is unavailable right now.' };
  }
}

/**
 * Publish an app record to the authoritative production catalog.
 * The server performs its own validation and protected-field integrity
 * checks before committing; a success result means data/apps.json on main
 * was actually updated.
 */
export async function publishAppToProduction(
  app: Partial<AppItem>,
  publishKey: string
): Promise<ProductionPublishResult> {
  if (!publishKey.trim()) {
    return { success: false, message: 'Publish key is required to publish to production.' };
  }
  try {
    const res = await fetch(PUBLISH_ENDPOINT, {
      method: 'POST',
      headers: publisherAuthHeaders(publishKey),
      body: JSON.stringify({ publishKey, app }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.success) {
      return {
        success: true,
        message: data.message || 'Published to the authoritative production catalog.',
        commitSha: data.commitSha,
        commitUrl: data.commitUrl,
        actionsUrl: data.actionsUrl,
        deployedUrl: data.deployedUrl,
      };
    }
    return {
      success: false,
      message: (data && data.message) || `Publish failed (HTTP ${res.status}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Publish failed — the authorized publishing layer could not be reached.',
    };
  }
}

/**
 * Publisher key handling is MEMORY-ONLY by design: the key is captured in
 * React state for the lifetime of the page session, sent only to the
 * Cloudflare Worker, and is never written to localStorage, sessionStorage,
 * IndexedDB, cookies, URLs, or any persisted file. A page refresh requires
 * the publisher to enter the key again — intentional.
 */

/**
 * One-time cleanup: the console previously offered "remember key on this
 * device" (localStorage). That feature is removed; scrub any legacy value
 * so nothing remains in browser storage.
 */
export function clearLegacyRememberedPublishKey() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('appmintly_publish_key');
    window.localStorage.removeItem('appmintly_publish_key_remember');
  } catch {
    /* storage unavailable — nothing to clean */
  }
}

/**
 * Authenticated-request headers for the Worker. The publish key is carried
 * BOTH as the Authorization: Bearer header (the Worker's CORS explicitly
 * allows the Authorization header) and — for backward compatibility with
 * the console's existing request shape — inside the JSON body. Both travel
 * to the same Worker over the same TLS connection.
 */
export function publisherAuthHeaders(publishKey: string): Record<string, string> {
  // MUST match the deployed Worker's CORS allow-headers EXACTLY
  // (verified live: Access-Control-Allow-Headers: Content-Type, Authorization).
  // Adding any extra header here (e.g. X-Requested-With) makes the browser
  // preflight fail and blocks every authenticated request with a network
  // error. The Worker's bearer-key check remains the security boundary.
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${publishKey}`,
  };
}

/**
 * Verify a publisher key WITHOUT any production side effect. Sends an
 * intentionally empty app record to POST /build-apk: the Worker checks the
 * key FIRST (verified live: every unauthenticated request returns 401
 * before validation), so a 401 means the key is invalid, and any non-401
 * response means the key was accepted and the empty record was rejected by
 * request validation — exactly what we want. No build can be dispatched
 * from an empty record (no name, no package id, no launch URL).
 */
export type PublisherKeyCheck =
  | { verified: true; message: string }
  | { verified: false; kind: 'empty' | 'invalid-key' | 'unavailable'; message: string };

export async function verifyPublisherKey(publishKey: string): Promise<PublisherKeyCheck> {
  if (!publishKey.trim()) {
    return { verified: false, kind: 'empty', message: 'Enter your AppMintly Publisher Key.' };
  }
  // Timeout protection: a hung connection must surface as a service error,
  // not an eternal spinner. 15s is generous for a Cloudflare Worker.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(BUILD_SERVICE_ENDPOINT, {
      method: 'POST',
      headers: publisherAuthHeaders(publishKey),
      body: JSON.stringify({ publishKey, app: {} }),
      signal: controller.signal,
    });
    if (res.status === 401) {
      return { verified: false, kind: 'invalid-key', message: 'Invalid Publisher Key' };
    }
    // Any non-401 response means the Worker accepted the key (the
    // intentionally empty record was then refused by request validation).
    // Never guess success on a 401.
    return { verified: true, message: 'Publisher key verified.' };
  } catch {
    // fetch throws (TypeError/AbortError) ONLY on network-level failure:
    // unreachable host, CORS preflight rejection, or timeout. This is a
    // SERVICE problem — never a wrong-key verdict.
    return {
      verified: false,
      kind: 'unavailable',
      message: 'Publishing service unavailable — could not reach the server. Check your connection and try again.',
    };
  } finally {
    clearTimeout(timeout);
  }
}


/* ─────────────────────────────────────────────────────────────────────────
 * Phase 9 — session hardening helpers.
 *
 * The Worker is the authoritative security boundary (bearer-key validation
 * on every privileged request). These helpers add a session-expiration
 * contract and a client-side brute-force throttle so the console behaves
 * like a production login surface. They never replace server validation.
 * ───────────────────────────────────────────────────────────────────────── */

/** Idle session lifetime in milliseconds (30 minutes). */
export const PUBLISHER_SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * Tracks failed login attempts for a client-side throttle. Honest scope:
 * this raises the cost of guessing in a browser; real brute-force
 * protection must be enforced by the Worker side (rate limiting there is
 * tracked as a Phase 9 backend limitation).
 */
export class LoginThrottle {
  private attempts: number[] = [];

  constructor(
    private maxAttempts = 5,
    private windowMs = 5 * 60 * 1000
  ) {}

  /** Record a failed attempt. */
  recordFailure(): void {
    const now = Date.now();
    this.attempts = this.attempts.filter((t) => now - t < this.windowMs);
    this.attempts.push(now);
  }

  /** Clear failures on success. */
  reset(): void {
    this.attempts = [];
  }

  /** Returns remaining lockout ms if throttled, otherwise 0. */
  remainingLockoutMs(): number {
    const now = Date.now();
    this.attempts = this.attempts.filter((t) => now - t < this.windowMs);
    if (this.attempts.length < this.maxAttempts) return 0;
    const oldest = Math.min(...this.attempts);
    const lockUntil = oldest + this.windowMs;
    return Math.max(0, lockUntil - now);
  }
}
