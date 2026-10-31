/**
 * Phase 10.9 — distribution model: authoritative release evidence.
 *
 * An app is distributed as an "Android APK" ONLY when a real, authoritative
 * production APK release exists: the release pipeline (release-android-apk
 * workflow) is the only writer of apk release evidence (verified, sha256,
 * apkUrl, versionCode…). A listing without that evidence is a Web App /
 * installable web experience — the UI must never fabricate or imply an APK
 * (no fake package IDs, version codes, or signature claims).
 *
 * Shared by AppCard, the app detail page and the APK install sheet so every
 * surface answers the same question consistently:
 *   hasAuthoritativeApkRelease(app) === true  → "Get App" (APK download)
 *   hasAuthoritativeApkRelease(app) === false → "Open on Web"
 */

interface AppLike {
  apk?: {
    enabled?: boolean;
    verified?: boolean;
    sha256?: string;
    apkUrl?: string;
  } | null;
  apkUrl?: string;
}

/**
 * True only when the canonical record carries REAL release evidence written
 * by the production release pipeline: apk.enabled + apk.verified + a release
 * checksum + a downloadable release asset URL.
 */
export function hasAuthoritativeApkRelease(app: AppLike | undefined | null): boolean {
  if (!app) return false;
  const apk = app.apk;
  return Boolean(
    apk &&
      apk.enabled === true &&
      apk.verified === true &&
      typeof apk.sha256 === 'string' &&
      apk.sha256.length > 0 &&
      Boolean(apk.apkUrl || app.apkUrl)
  );
}


/**
 * Tracked download endpoint (AppMintly 2.0, Item 5).
 *
 * The publisher Worker's /dl/<slug> route answers with the release asset that
 * the PUBLISHED catalog record declares — it is not an open redirect, and it
 * re-checks the authoritative release evidence (enabled + verified + checksum)
 * on every request. Routing the download action through it is what makes
 * download *requests* observable server-side. It records a request and a
 * redirect; it never claims an installation.
 */
export const TRACKED_DOWNLOAD_BASE = 'https://appmintly-publisher-api.sbn50088.workers.dev';

export function trackedDownloadUrl(slug: string | undefined | null): string | null {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(slug)) return null;
  return `${TRACKED_DOWNLOAD_BASE}/dl/${slug}`;
}

/**
 * The URL a "Get App" APK action should navigate to.
 *
 * Order of preference:
 *   1. tracked endpoint — same official GitHub asset as its 302 destination,
 *      and the only path that can be counted;
 *   2. the direct official release asset — unchanged behaviour whenever the
 *      listing lacks authoritative release evidence or the slug is unusable.
 * Never returns a caller-supplied arbitrary URL.
 */
export function apkDownloadUrl(
  app: (AppLike & { slug?: string }) | undefined | null
): string | null {
  if (!hasAuthoritativeApkRelease(app)) return null;
  const direct = (app?.apk?.apkUrl || app?.apkUrl) as string;
  const tracked = trackedDownloadUrl(app?.slug);
  return tracked || direct || null;
}
