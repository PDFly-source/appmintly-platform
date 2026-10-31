/**
 * AppMintly Item 8 — App Compatibility & Requirements model (pure).
 *
 * HONESTY CONTRACT
 * ----------------
 * Every field below is either:
 *   - 'apk-metadata'  read from the APK release record produced by the verified
 *                     build/validation pipeline (minSdk, targetSdk, architecture,
 *                     fileSizeBytes, sha256, signature schemes, packageId), or
 *   - 'catalog'       read from the published catalog record, or
 *   - 'publisher'     free text the publisher supplied (offline/storage notes), or
 *   - 'unknown'       not present. Shown as "Not specified" — never guessed.
 *
 * Nothing here claims the visitor's device was tested, and no requirement is
 * inferred from an app's category, type or marketing copy. A universal APK is
 * described as "no ABI split reported", NOT as "works on every device": an
 * Android version floor still applies.
 */

import type { AppItem } from '@/data/apps';

export type FieldSource = 'apk-metadata' | 'catalog' | 'publisher' | 'unknown';

export interface CompatibilityField {
  label: string;
  value: string;
  source: FieldSource;
  /** true only when the value comes from verified release metadata. */
  verified: boolean;
}

export interface CompatibilityModel {
  slug: string;
  name: string;
  /** Whether any verified APK release exists for this app. */
  hasVerifiedApk: boolean;
  android: CompatibilityField[];
  apkInfo: CompatibilityField[];
  storage: CompatibilityField[];
  network: CompatibilityField[];
  offline: CompatibilityField[];
  browser: CompatibilityField[];
  platforms: CompatibilityField[];
  limitations: string[];
  unknownFields: string[];
  sources: string[];
}

/** Android API level → release name. Only listed levels are ever named. */
const ANDROID_BY_API: Record<number, string> = {
  21: '5.0 Lollipop',
  22: '5.1 Lollipop',
  23: '6.0 Marshmallow',
  24: '7.0 Nougat',
  25: '7.1 Nougat',
  26: '8.0 Oreo',
  27: '8.1 Oreo',
  28: '9 Pie',
  29: '10',
  30: '11',
  31: '12',
  32: '12L',
  33: '13',
  34: '14',
  35: '15',
  36: '16',
};

export const UNKNOWN = 'Not specified';

export function isUsableApiLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;
}

/**
 * Format an API level. An unknown or implausible level returns null so callers
 * render "Not specified" instead of a version name that does not exist.
 */
export function androidVersionName(api: unknown): string | null {
  if (!isUsableApiLevel(api)) return null;
  const name = ANDROID_BY_API[api];
  return name ? `Android ${name} (API ${api})` : `API level ${api}`;
}

export function formatBytes(bytes: unknown): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

const ARCH_LABELS: Record<string, string> = {
  universal: 'Universal APK (no ABI split reported)',
  arm64: 'ARM64 (arm64-v8a)',
  'arm64-v8a': 'ARM64 (arm64-v8a)',
  armeabi: 'ARM (armeabi-v7a)',
  'armeabi-v7a': 'ARM (armeabi-v7a)',
  x86: 'x86 (32-bit)',
  x86_64: 'x86_64',
};

export function architectureLabel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = value.trim().toLowerCase();
  return ARCH_LABELS[key] || value.trim();
}

const field = (label: string, value: string | null, source: FieldSource): CompatibilityField => ({
  label,
  value: value && value.trim() ? value.trim() : UNKNOWN,
  source: value && value.trim() ? source : 'unknown',
  verified: Boolean(value && value.trim()) && source === 'apk-metadata',
});

/**
 * Placeholder strings that appear in the catalog as if they were data. They are
 * treated as absent so a field is reported unknown instead of published.
 */
const PLACEHOLDER = /^(not specified|not listed|unknown|n\/a|none|tbd)$/i;

const short = (value: unknown, max = 160): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || PLACEHOLDER.test(text)) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

type AnyApp = AppItem & {
  privacyTech?: Record<string, unknown> | object;
  launchUrl?: string;
  webUrl?: string;
  pwaUrl?: string;
  apk?: object;
};

/** Publications only: an unpublished record never produces a compatibility view. */
export function isCompatibilityEligible(app: unknown): boolean {
  const a = app as AnyApp | null;
  return Boolean(a && a.slug && a.published === true);
}

export function findAppBySlug(apps: unknown[], slug: string): AnyApp | null {
  if (typeof slug !== 'string' || !slug.trim()) return null;
  const list = Array.isArray(apps) ? (apps as AnyApp[]) : [];
  return list.find((a) => a && a.slug === slug && a.published === true) || null;
}

export function buildCompatibility(app: AnyApp | null | undefined): CompatibilityModel | null {
  if (!isCompatibilityEligible(app)) return null;
  const a = app as AnyApp;
  const apk = (a.apk || {}) as Record<string, unknown>;
  const privacy = (a.privacyTech || {}) as Record<string, unknown>;

  const apkVerified = apk.verified === true && apk.enabled === true;
  const minName = apkVerified ? androidVersionName(apk.minSdk) : null;
  const targetName = apkVerified ? androidVersionName(apk.targetSdk) : null;
  const arch = apkVerified ? architectureLabel(apk.architecture) : null;
  const sizeBytes = apkVerified && typeof apk.fileSizeBytes === 'number' ? apk.fileSizeBytes : null;
  const sizeLabel = formatBytes(sizeBytes);

  const webTarget = typeof a.launchUrl === 'string' && /^https?:\/\//.test(a.launchUrl)
    ? a.launchUrl
    : typeof a.webUrl === 'string' && /^https?:\/\//.test(a.webUrl)
      ? a.webUrl
      : null;
  const pwaSupport = typeof privacy.pwaSupport === 'string' ? privacy.pwaSupport : '';
  const pwaVerified = pwaSupport === 'verified-installable';

  const android: CompatibilityField[] = [
    field(
      'Minimum Android version',
      apkVerified ? minName : null,
      'apk-metadata'
    ),
    field('Target Android version', apkVerified ? targetName : null, 'apk-metadata'),
    field('CPU architecture', apkVerified ? arch : null, 'apk-metadata'),
    field(
      'Package name',
      apkVerified && typeof apk.packageId === 'string' ? apk.packageId : null,
      'apk-metadata'
    ),
  ];

  const apkInfo: CompatibilityField[] = [
    field('Release version', apkVerified && typeof apk.versionName === 'string' ? apk.versionName : null, 'apk-metadata'),
    field(
      'Version code',
      apkVerified && typeof apk.versionCode === 'number' ? String(apk.versionCode) : null,
      'apk-metadata'
    ),
    field('APK file', apkVerified && typeof apk.fileName === 'string' ? apk.fileName : null, 'apk-metadata'),
    field('Download size', apkVerified ? sizeLabel : null, 'apk-metadata'),
    field(
      'Release date',
      apkVerified && typeof apk.releaseDate === 'string' ? apk.releaseDate : null,
      'apk-metadata'
    ),
    field(
      'Signature schemes',
      apkVerified && apk.signatureSchemes && typeof apk.signatureSchemes === 'object'
        ? Object.entries(apk.signatureSchemes as Record<string, boolean>)
            .filter(([, on]) => on)
            .map(([k]) => k.toUpperCase())
            .join(', ') || null
        : null,
      'apk-metadata'
    ),
    field(
      'SHA-256 checksum',
      apkVerified && typeof apk.sha256 === 'string' && apk.sha256.length === 64 ? apk.sha256 : null,
      'apk-metadata'
    ),
  ];

  const storageNote = short(privacy.storage, 200);
  const storage: CompatibilityField[] = [
    field(
      'Space needed for the download',
      apkVerified && sizeLabel ? `${sizeLabel} (the APK file itself)` : null,
      'apk-metadata'
    ),
    field('Additional storage after install', storageNote, 'publisher'),
  ];

  const networkRaw = typeof privacy.networkRequirement === 'string' ? privacy.networkRequirement : '';
  const networkLabel =
    networkRaw === 'offline-capable'
      ? 'Works without a connection after first setup'
      : networkRaw === 'online-only'
        ? 'Requires an internet connection'
        : null;

  const network: CompatibilityField[] = [
    field('Internet requirement', networkLabel, 'catalog'),
    field(
      'Documented network behaviour',
      short(privacy.notes, 220),
      'publisher'
    ),
  ];

  const offlineNote = short(privacy.offlineSupport, 220);
  const offline: CompatibilityField[] = [
    field('Offline capability', offlineNote, 'publisher'),
    field(
      'Offline status recorded in the catalog',
      networkRaw === 'offline-capable'
        ? 'Marked offline-capable'
        : networkRaw === 'online-only'
          ? 'Marked online-only'
          : null,
      'catalog'
    ),
  ];

  const browser: CompatibilityField[] = [
    field(
      'Runs in a web browser',
      webTarget ? 'Yes, the publisher lists a web version' : null,
      'catalog'
    ),
    field(
      'Installs as a browser app (PWA)',
      pwaVerified
        ? 'Verified installable'
        : pwaSupport === 'unknown'
          ? 'Not verified'
          : null,
      pwaVerified ? 'catalog' : pwaSupport === 'unknown' ? 'catalog' : 'unknown'
    ),
    field(
      'Verified browser coverage',
      null,
      'unknown'
    ),
  ];

  const platforms: CompatibilityField[] = [
    field('Android device', apkVerified ? 'Supported by a verified APK release' : null, 'apk-metadata'),
    field('Web browser', webTarget ? 'Supported, web version listed' : null, 'catalog'),
    field('iPhone / iPad', null, 'unknown'),
  ];

  const limitations: string[] = [];
  if (apkVerified && apk.architecture === 'universal') {
    limitations.push(
      'The APK is a universal build. No per-ABI split is published, so the exact native libraries it contains are not listed here.'
    );
  }
  if (networkRaw === 'online-only') {
    limitations.push('The publisher documents this app as online-only: no offline mode is listed.');
  }
  if (pwaSupport === 'unknown') {
    limitations.push('Browser installation support has not been verified for this app.');
  }
  if (!apkVerified) {
    limitations.push('No verified Android APK release is published, so Android requirements are unknown.');
  }

  const unknownFields = [...android, ...apkInfo, ...storage, ...network, ...offline, ...browser, ...platforms]
    .filter((f) => f.source === 'unknown')
    .map((f) => f.label);

  const sources: string[] = [];
  if (apkVerified) {
    sources.push('APK release metadata produced by the AppMintly verified build and validation pipeline');
  }
  sources.push('Published catalog record (platform, web and network fields)');
  if (storageNote || offlineNote || typeof privacy.notes === 'string') {
    sources.push('Notes supplied by the publisher and stored with the listing');
  }

  return {
    slug: a.slug,
    name: a.name,
    hasVerifiedApk: apkVerified,
    android,
    apkInfo,
    storage,
    network,
    offline,
    browser,
    platforms,
    limitations,
    unknownFields,
    sources,
  };
}

/** Simple-language installation steps, only for what is actually published. */
export function installationSteps(model: CompatibilityModel | null): string[] {
  if (!model) return [];
  const steps: string[] = [];
  if (model.hasVerifiedApk) {
    steps.push('Download the APK from this page. AppMintly links the exact file whose checksum is published above.');
    steps.push('Open the downloaded file. Android will ask you to allow installs from this browser or file manager the first time.');
    steps.push('Review the permissions Android lists, then confirm the install.');
    steps.push('AppMintly does not verify that the install succeeded on your device. The checksum only proves the file is unchanged.');
  }
  if (model.slug && model.browser.some((f) => f.label === 'Runs in a web browser' && f.source !== 'unknown')) {
    steps.push('To use the web version, open the web link from this page. No install is needed.');
  }
  return steps;
}
