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
      headers: { 'Content-Type': 'application/json' },
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

/** localStorage keys for the optional device-remembered publish key. */
const PUBLISH_KEY_STORAGE = 'appmintly_publish_key';
const PUBLISH_KEY_REMEMBER = 'appmintly_publish_key_remember';

export function loadRememberedPublishKey(): { key: string; remember: boolean } {
  if (typeof window === 'undefined') return { key: '', remember: false };
  const remember = window.localStorage.getItem(PUBLISH_KEY_REMEMBER) === 'true';
  const key = remember ? window.localStorage.getItem(PUBLISH_KEY_STORAGE) || '' : '';
  return { key, remember };
}

export function storeRememberedPublishKey(key: string, remember: boolean) {
  if (typeof window === 'undefined') return;
  if (remember) {
    window.localStorage.setItem(PUBLISH_KEY_STORAGE, key);
    window.localStorage.setItem(PUBLISH_KEY_REMEMBER, 'true');
  } else {
    window.localStorage.removeItem(PUBLISH_KEY_STORAGE);
    window.localStorage.setItem(PUBLISH_KEY_REMEMBER, 'false');
  }
}
