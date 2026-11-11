/**
 * Native artifact distribution channel — single deterministic resolution rule.
 *
 * A catalog record can describe TWO independent Android channels:
 *
 *   1. `nativeArtifact` — the app's own signed native release (built and
 *      published from the app's own repository, with the app's own signing
 *      identity). Authoritative when present and usable.
 *   2. `apk` — the platform WebView-wrapper build (preserved exactly as the
 *      release pipeline wrote it, including its checksum and asset URL).
 *
 * The public UI must never blend them. When a usable native artifact exists
 * the NATIVE release is the primary installable app (version, build number,
 * package, size, checksum, download asset, updated date). The wrapper record
 * is kept verbatim under `wrapperArtifact` so the web experience and the
 * wrapper channel stay available and auditable.
 *
 * The rule is data-driven: nothing here names an app or a version string.
 */

export interface NativeArtifactLike {
  enabled?: boolean;
  kind?: string;
  buildProfile?: string;
  packageId?: string;
  versionName?: string;
  versionCode?: number;
  minSdk?: number;
  targetSdk?: number;
  sha256?: string;
  fileSizeBytes?: number;
  apkUrl?: string;
  releaseTag?: string;
  releasePublishedAt?: string;
  releaseDate?: string;
  sourceRepository?: string;
  sourceCommit?: string;
  signingCertificateSha256?: string;
  signatureSchemes?: string[];
  verified?: boolean;
  verifiedAt?: string;
  replacesWebViewWrapper?: boolean;
  [key: string]: unknown;
}

/** Minimal shape the resolver needs; keeps the module free of catalog imports. */
export interface ApkLike {
  enabled?: boolean;
  verified?: boolean;
  buildMode?: string;
  packageId?: string;
  versionName?: string;
  versionCode?: number;
  fileName?: string;
  apkUrl?: string;
  sha256?: string;
  fileSizeBytes?: number;
  releaseTag?: string;
  releaseDate?: string;
  minSdk?: number;
  targetSdk?: number;
  certificateSha256Fingerprint?: string;
  signatureSchemes?: unknown;
  wrapperArtifact?: unknown;
}

export interface AppLike {
  slug?: string;
  version?: string;
  lastUpdated?: string;
  updatedAt?: string;
  apk?: ApkLike | null;
  apkUrl?: string;
  nativeArtifact?: NativeArtifactLike | null;
}

/**
 * Usable native artifact = the app's own verified signed release with a
 * downloadable asset. Anything less falls back to the wrapper channel, so a
 * half-written record can never promote itself over a real wrapper release.
 */
export function hasUsableNativeArtifact(app: AppLike | undefined | null): boolean {
  const na = app?.nativeArtifact;
  if (!na || na.enabled === false) return false;
  return Boolean(
    na.verified === true &&
      typeof na.versionName === 'string' &&
      na.versionName.length > 0 &&
      typeof na.versionCode === 'number' &&
      Number.isFinite(na.versionCode) &&
      typeof na.sha256 === 'string' &&
      na.sha256.length > 0 &&
      typeof na.apkUrl === 'string' &&
      /^https:\/\//.test(na.apkUrl)
  );
}

/** ISO date (YYYY-MM-DD) the native release became public. */
export function nativeReleaseDate(app: AppLike | undefined | null): string | null {
  const na = app?.nativeArtifact;
  if (!na) return null;
  const candidates = [na.releasePublishedAt, na.releaseDate, na.verifiedAt];
  for (const value of candidates) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
  }
  return null;
}

export type PrimaryAndroidChannel = 'native' | 'wrapper' | null;

export interface PrimaryAndroidRelease {
  channel: PrimaryAndroidChannel;
  versionName: string;
  versionCode?: number;
  apkUrl?: string;
  sha256?: string;
  fileSizeBytes?: number;
  packageId?: string;
  releaseDate?: string;
  /** Direct verified release asset (native) vs platform-managed URL (wrapper). */
  direct: boolean;
}

/**
 * The single answer to "what is the primary Android release of this app?".
 * Native wins when usable; otherwise the wrapper record is reported as-is.
 */
export function primaryAndroidRelease(
  app: AppLike | undefined | null
): PrimaryAndroidRelease | null {
  if (!app) return null;

  if (hasUsableNativeArtifact(app)) {
    const na = app.nativeArtifact as NativeArtifactLike;
    return {
      channel: 'native',
      versionName: na.versionName as string,
      versionCode: na.versionCode,
      apkUrl: na.apkUrl,
      sha256: na.sha256,
      fileSizeBytes: na.fileSizeBytes,
      packageId: na.packageId,
      releaseDate: nativeReleaseDate(app) ?? undefined,
      direct: true,
    };
  }

  const apk = app.apk;
  const apkUrl = apk?.apkUrl || app.apkUrl;
  if (!apkUrl) return null;

  return {
    channel: 'wrapper',
    versionName: apk?.versionName || app.version || '',
    versionCode: apk?.versionCode,
    apkUrl,
    sha256: apk?.sha256,
    fileSizeBytes: apk?.fileSizeBytes,
    packageId: apk?.packageId,
    releaseDate: apk?.releaseDate,
    direct: false,
  };
}

/**
 * Rewrites a raw catalog record so every consumer (cards, detail page, install
 * sheet, library, publisher page, hash verifier) sees the primary Android
 * channel consistently. Records without a usable native artifact are returned
 * untouched — legacy wrapper-only apps keep their exact existing behaviour.
 */
export function applyPrimaryAndroidRelease<T extends AppLike>(app: T): T {
  if (!hasUsableNativeArtifact(app)) return app;
  const native = primaryAndroidRelease(app) as PrimaryAndroidRelease;
  const na = app.nativeArtifact as NativeArtifactLike;
  const wrapper = app.apk ?? null;

  const promotedApk = {
    ...(wrapper ?? {}),
    // Native channel is authoritative for install metadata…
    enabled: true,
    verified: true,
    buildMode: na.kind === 'native-android' ? 'native' : (wrapper?.buildMode ?? 'native'),
    packageId: native.packageId ?? (wrapper?.packageId as string | undefined),
    versionName: native.versionName,
    versionCode: native.versionCode,
    apkUrl: native.apkUrl,
    sha256: native.sha256,
    fileSizeBytes: native.fileSizeBytes ?? wrapper?.fileSizeBytes,
    releaseTag: na.releaseTag ?? undefined,
    // The asset the browser will actually receive, named from its own URL.
    fileName: (na.apkUrl as string).split('/').pop() ?? wrapper?.fileName,
    releaseDate: native.releaseDate,
    minSdk: na.minSdk,
    targetSdk: na.targetSdk,
    certificateSha256Fingerprint: na.signingCertificateSha256,
    signatureSchemes: na.signatureSchemes,
    // …and the preserved wrapper record stays available, clearly separated.
    wrapperArtifact: wrapper ?? undefined,
  };

  return {
    ...app,
    version: native.versionName,
    apk: promotedApk,
    lastUpdated: native.releaseDate ?? app.lastUpdated,
    androidChannel: 'native' as const,
    wrapperApk: wrapper ?? undefined,
  } as unknown as T;
}

/**
 * URL a "Get App" action must use.
 *
 * Native: the verified release asset itself (the exact browser_download_url of
 * the release). No tracked redirect in between, because the platform Worker's
 * download route answers with the record's wrapper channel.
 * Wrapper-only apps keep the existing behaviour supplied by the caller.
 */
export function nativeDownloadUrl(app: AppLike | undefined | null): string | null {
  const release = primaryAndroidRelease(app);
  if (!release || release.channel !== 'native') return null;
  return release.apkUrl ?? null;
}
