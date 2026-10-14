/**
 * Centralized Share System (production bug fix).
 *
 * One reusable, framework-independent sharing core used by every app-detail
 * page (and the QR share dialog). App-specific pages must NOT keep their own
 * duplicated navigator.share / navigator.clipboard handlers — they all call
 * into this module.
 *
 * Behavior contract:
 *  1. PRIMARY — Native Web Share API (navigator.share): when the browser
 *     supports it, the native Android/OS share sheet opens with the app's
 *     canonical URL, title and a short description. Success is only reported
 *     after the browser promise RESOLVES — never fabricated up front.
 *  2. CANCELLATION — a closed/cancelled share sheet rejects with AbortError.
 *     This is reported as 'cancelled' and the caller stays SILENT: no toast,
 *     and critically NO automatic clipboard fallback (the user chose not to
 *     share; copying the link anyway would be against their intent).
 *  3. CLIPBOARD FALLBACK — when native sharing is unavailable (Firefox on
 *     Android, in-app WebViews, desktop browsers without Web Share) or fails
 *     with a non-cancel error, the canonical URL is copied via the async
 *     Clipboard API. The outcome is only 'copied' after the write RESOLVES.
 *     If it rejects, 'copy-failed' is returned so the caller can show an
 *     honest error and another way to copy the link — never a fake success.
 *  4. URLS — every share uses the app's canonical detail-page URL derived
 *     from its catalog slug and the canonical-host strategy (lib/site.ts),
 *     with trailing-slash behavior matching lib/canonical-slash.ts. The URL
 *     is identical on both hosting targets and independent of any base-path
 *     mirror the visitor happens to be on. No app URL is ever hardcoded.
 *  5. FUTURE APPS — the implementation is generic: it derives everything
 *     (URL, title, description) from the catalog record passed in, so new
 *     catalog entries inherit the full behavior with zero registration.
 */

import { CANONICAL_SITE_URL } from '@/lib/site';
import { CANONICAL_TRAILING_SLASH } from '@/lib/canonical-slash';

/** Minimal catalog-record shape needed to share an app. */
export interface ShareableApp {
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
}

/** Environment abstraction so tests can inject fake navigator capabilities. */
export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  clipboardWriteText?: (text: string) => Promise<void>;
}

/** Result of a share attempt. Callers decide the UI feedback from `status`. */
export type ShareOutcome =
  | { status: 'shared'; url: string }
  | { status: 'cancelled'; url: string }
  | { status: 'copied'; url: string }
  | { status: 'copy-failed'; url: string };

/**
 * Canonical app-detail share URL for a catalog slug.
 *
 * Mirrors exactly the canonical URL emitted by app/[slug]/page.tsx metadata:
 * canonical host + /app/<slug> + the build's canonical trailing slash. It
 * deliberately does NOT use window.location (which would share whatever
 * mirror/query/hash the visitor is on) and does NOT read
 * NEXT_PUBLIC_BASE_PATH, so shared links always point at the canonical host.
 */
export function buildAppShareUrl(slug: string): string {
  return `${CANONICAL_SITE_URL}app/${slug}${CANONICAL_TRAILING_SLASH}`;
}

/** True when an error represents the user closing/cancelling the share sheet. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

/** Resolve the live browser environment (client-side only). */
function browserEnv(): ShareEnv {
  if (typeof navigator === 'undefined') return {};
  return {
    share: typeof navigator.share === 'function' ? navigator.share.bind(navigator) : undefined,
    clipboardWriteText:
      navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
        ? navigator.clipboard.writeText.bind(navigator.clipboard)
        : undefined,
  };
}

/**
 * Core generic share used by every call site (app-detail share button, QR
 * dialog). Tries the native share sheet first, falls back to the clipboard.
 * Never fabricates results and never falls back to clipboard on cancel.
 */
export async function shareContent(
  input: { title: string; text?: string | null; url: string },
  env: ShareEnv = browserEnv()
): Promise<ShareOutcome> {
  const { title, text, url } = input;

  if (typeof env.share === 'function') {
    try {
      await env.share({ title, text: text || undefined, url });
      return { status: 'shared', url }; // browser confirmed the share
    } catch (err) {
      if (isAbortError(err)) {
        // User closed/dismissed the share sheet: stay silent, do NOT copy.
        return { status: 'cancelled', url };
      }
      // A genuine failure of a supported share API: fall through to the
      // clipboard fallback so the user still gets a way to share the link.
    }
  }

  if (typeof env.clipboardWriteText === 'function') {
    try {
      await env.clipboardWriteText(url);
      return { status: 'copied', url }; // clipboard write confirmed
    } catch {
      return { status: 'copy-failed', url };
    }
  }

  // Clipboard API unavailable (insecure context / restricted WebView).
  return { status: 'copy-failed', url };
}

/**
 * Share a catalog app via its canonical detail-page URL. Generic over the
 * catalog record: current and future apps need only slug + name.
 */
export async function shareApp(app: ShareableApp, env: ShareEnv = browserEnv()): Promise<ShareOutcome> {
  return shareContent(
    {
      title: `${app.name} on AppMintly`,
      text: app.shortDescription || app.description || app.name,
      url: buildAppShareUrl(app.slug),
    },
    env
  );
}

/**
 * Single-flight wrapper for interactive handlers: while one call is in
 * flight, additional taps are ignored (return undefined) so repeated taps
 * cannot open two share sheets or enqueue duplicate clipboard writes.
 */
export function singleFlight<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>
): (...args: A) => Promise<unknown> | undefined {
  let inFlight = false;
  return (...args: A) => {
    if (inFlight) return undefined;
    inFlight = true;
    return fn(...args).finally(() => {
      inFlight = false;
    });
  };
}
