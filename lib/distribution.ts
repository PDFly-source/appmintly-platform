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
