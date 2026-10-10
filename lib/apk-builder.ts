import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import {
  validateApkBinary,
  ApkValidationResult,
  MODERN_TARGET_SDK,
  MODERN_MIN_SDK,
} from './apk-validator';

const execPromise = util.promisify(exec);

export interface ApkBuildOptions {
  appId: string;
  slug: string;
  name: string;
  shortName?: string;
  version: string;
  versionCode?: number;
  launchUrl: string;
  iconUrl?: string;
  themeColor?: string;
  backgroundColor?: string;
  buildMode?: 'twa' | 'webview';
  packageId?: string;
  fileName?: string;
  authorized: boolean;
  /**
   * TEST-ONLY (Phase 12.14): overrides the native update alarm interval in
   * milliseconds for a temporary test build. Production builds leave this
   * unset, which keeps the production six-hour interval byte-identical.
   */
  alarmIntervalMs?: number;
  /**
   * TEST-ONLY (Phase 12.14): seeds the update-check fixture (master on,
   * stale tracked versions, empty delivered) into native prefs on the
   * first alarm fire so a genuine eligible event exists against the
   * unchanged production catalog. Production builds leave this unset.
   */
  testFixtureSeed?: boolean;
  /**
   * TEST-ONLY (Phase 12.14): allows a throwaway signing identity during
   * validation for temporary test builds. Production builds leave this
   * unset and the production signing-identity pin stays fail-closed.
   */
  allowTestSigningIdentity?: boolean;
  /**
   * TEST-ONLY (Phase 12.14): preserves the generated MainActivity.java to
   * evidence/generated-MainActivity.java so the test workflow can prove
   * the test build's config differs from the production default ONLY in
   * the alarm interval and the fixture seed. Production builds never set it.
   */
  keepGeneratedSource?: boolean;
}

export type BuildState = 'queued' | 'building' | 'signing' | 'validating' | 'uploading' | 'completed' | 'failed';

export const BUILD_STAGES = [
  'Preparing source',
  'Validating URL',
  'Preparing Android project',
  'Building APK',
  'Signing APK',
  'Validating APK',
  'Calculating SHA-256',
  'Uploading APK',
  'Publishing release',
  'Ready to download',
] as const;

export interface BuildJob {
  buildId: string;
  appId: string;
  slug: string;
  name: string;
  version: string;
  versionCode: number;
  packageId: string;
  buildMode: 'twa' | 'webview';
  status: BuildState;
  currentStep: (typeof BUILD_STAGES)[number] | 'Build failed' | 'Validated artifact (not publicly published)';
  stageIndex: number;
  progress: number;
  stepsCompleted: string[];
  apkUrl?: string;
  fileName?: string;
  sha256?: string;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  validationResult?: ApkValidationResult;
  error?: string;
  startedAt: string;
  completedAt?: string;
  apkMetadata?: any;
}

// Global persistent Map across Next.js route handler bundles
const globalForBuilds = globalThis as unknown as { __appforge_build_jobs?: Map<string, BuildJob> };
if (!globalForBuilds.__appforge_build_jobs) {
  globalForBuilds.__appforge_build_jobs = new Map<string, BuildJob>();
}
const buildJobs = globalForBuilds.__appforge_build_jobs;

/**
 * Validates Android package ID syntax
 */
export function validatePackageId(pkg: string): { valid: boolean; error?: string } {
  if (!pkg || typeof pkg !== 'string') {
    return { valid: false, error: 'Package ID cannot be empty' };
  }
  const trimmed = pkg.trim();
  if (trimmed.length < 5 || trimmed.length > 100) {
    return { valid: false, error: 'Package ID must be between 5 and 100 characters' };
  }
  const parts = trimmed.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Package ID must contain at least one dot (e.g., com.appmintly.myapp)' };
  }
  const validIdentifier = /^[a-z][a-z0-9_]*$/;
  for (const part of parts) {
    if (!validIdentifier.test(part)) {
      return {
        valid: false,
        error: `Segment "${part}" is invalid. Each segment must start with a lowercase letter and contain only lowercase letters, digits, or underscores.`,
      };
    }
  }
  return { valid: true };
}

/**
 * Deterministically generates an Android package ID from an app slug
 */
export function generatePackageId(slug: string): string {
  const cleanSlug = (slug || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
  return `com.appmintly.${cleanSlug || 'app'}`;
}

/**
 * Converts semantic version string to integer versionCode
 */
export function semanticVersionToCode(version: string): number {
  if (!version) return 10000;
  const cleaned = version.replace(/^v/i, '').trim();
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return 10000;
  const major = parseInt(match[1] || '1', 10);
  const minor = parseInt(match[2] || '0', 10);
  const patch = parseInt(match[3] || '0', 10);
  // Support both standard Android 20100 and simplified 210 formats
  return Math.min(2100000000, major * 10000 + minor * 100 + patch);
}

/**
 * WEBVIEW OWNERSHIP BOUNDARY — single source of truth.
 *
 * The native APK keeps a URL inside its own WebView only when it starts with
 * the ownership prefix derived from the app's OWN launch URL. Nothing else is
 * ever owned: NOT sibling paths on shared hosts (e.g. other apps published
 * under the same *.github.io origin), NOT other publishers' domains, NOT URLs
 * that merely contain or reference the owned host.
 *
 * Invariants enforced by scripts/test-webview-ownership.ts (run as a gate in
 * the release workflow before every APK compile):
 *  1. Ownership is a pure function of the launch URL. The marketplace catalog
 *     (data/apps.json) can NEVER expand the WebView ownership boundary.
 *  2. The prefix always ends with "/" so a suffix-domain such as
 *     "https://appmintly.pages.dev.evil.example/" is NOT owned.
 *  3. Launching a shared-origin host (e.g. *.github.io) at its ROOT path is
 *     forbidden — that is the bare-origin rule that captured sibling apps.
 *  4. Malformed URLs and non-http(s) schemes (javascript:, data:, file:)
 *     are never owned.
 */
export function computeWebViewOwnershipPrefix(launchUrl: string): string {
  const parsed = new URL(launchUrl);
  const origin = parsed.origin;
  const pathname = parsed.pathname.replace(/\/+$/, '');
  const prefix = `${origin}${pathname}/`;
  // Shared project-hosting origins (GitHub Pages project sites) host many
  // unrelated apps as sibling PATHS; owning the bare origin would capture
  // them all. Fail closed instead.
  if (/\.github\.io$/i.test(new URL(origin).hostname) && pathname === '') {
    throw new Error(
      `Refusing bare shared-origin WebView ownership "${origin}/": ` +
      `sibling apps on this host would be captured. Launch from the app's own namespace path instead.`
    );
  }
  return prefix;
}

/**
 * Test/query-side mirror of the compiled Android ownership check
 * (shouldOverrideUrlLoading: url.startsWith(ALLOWED_ORIGIN)). Returns true
 * only for URLs inside the app's own ownership boundary.
 */
export function isWebViewOwnedUrl(url: string, launchUrl: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return url.startsWith(computeWebViewOwnershipPrefix(launchUrl));
  } catch {
    return false; // malformed URLs are never owned; handled externally
  }
}

/**
 * Checks eligibility of an application for APK generation
 */
export function checkApkEligibility(options: ApkBuildOptions): { eligible: boolean; reason?: string } {
  if (!options.authorized) {
    return {
      eligible: false,
      reason: 'Distribution Authorization is required. Publisher must confirm they own or have permission to package this application.',
    };
  }

  if (!options.launchUrl || !options.launchUrl.startsWith('https://')) {
    return {
      eligible: false,
      reason: 'Target application must use a secure HTTPS URL.',
    };
  }

  if (!options.name || options.name.trim().length === 0) {
    return {
      eligible: false,
      reason: 'Application name is required for Android app label.',
    };
  }

  const pkgCheck = validatePackageId(options.packageId || generatePackageId(options.slug));
  if (!pkgCheck.valid) {
    return {
      eligible: false,
      reason: pkgCheck.error || 'Invalid package ID format.',
    };
  }

  return { eligible: true };
}

export interface ToolchainPreflightResult {
  valid: boolean;
  javaVersion: string;
  javacVersion: string;
  javaHome: string;
  error?: string;
}

/**
 * Explicit preflight check before APK compilation:
 * 1. java -version
 * 2. javac -version
 * 3. echo $JAVA_HOME
 * If javac is unavailable, fails with a clear actionable error.
 */
export async function checkJavaToolchainPreflight(): Promise<ToolchainPreflightResult> {
  let javaHome = process.env.JAVA_HOME || '';
  if (!javaHome) {
    if (fs.existsSync('/usr/lib/jvm/java-17-openjdk-amd64')) {
      javaHome = '/usr/lib/jvm/java-17-openjdk-amd64';
      process.env.JAVA_HOME = javaHome;
    } else if (fs.existsSync('/usr/lib/jvm/default-java')) {
      javaHome = '/usr/lib/jvm/default-java';
      process.env.JAVA_HOME = javaHome;
    }
  }

  // Ensure $JAVA_HOME/bin is on PATH
  if (javaHome && !process.env.PATH?.includes(path.join(javaHome, 'bin'))) {
    process.env.PATH = `${path.join(javaHome, 'bin')}:${process.env.PATH || ''}`;
  }

  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: javaHome ? `${path.join(javaHome, 'bin')}:${process.env.PATH || ''}` : process.env.PATH,
  };

  // 1. Check java -version
  let javaVersion = '';
  try {
    const { stdout, stderr } = await execPromise('java -version', { env });
    javaVersion = (stderr || stdout || '').trim();
  } catch (err: any) {
    return {
      valid: false,
      javaVersion: '',
      javacVersion: '',
      javaHome,
      error: `Preflight check failed: 'java' binary is not found or not executable. Please ensure OpenJDK 17 is installed. Details: ${err.message}`,
    };
  }

  // 2. Check javac -version
  let javacVersion = '';
  try {
    const { stdout, stderr } = await execPromise('javac -version', { env });
    javacVersion = (stdout || stderr || '').trim();
  } catch (err: any) {
    return {
      valid: false,
      javaVersion,
      javacVersion: '',
      javaHome,
      error: `Preflight check failed: 'javac' compiler is not found or not executable on PATH. A full JDK (such as OpenJDK 17) is required, not only a JRE. Please install openjdk-17-jdk-headless. Details: ${err.message}`,
    };
  }

  // 3. Check JAVA_HOME
  if (!javaHome) {
    return {
      valid: false,
      javaVersion,
      javacVersion,
      javaHome: '',
      error: `Preflight check failed: JAVA_HOME environment variable is not configured. Please set JAVA_HOME to a valid JDK path.`,
    };
  }

  return {
    valid: true,
    javaVersion,
    javacVersion,
    javaHome,
  };
}

/**
 * Ensures Android SDK jar, D8/R8 compiler, and signing keystore exist.
 */
export async function ensureAndroidToolchain(): Promise<void> {
  const requiredFiles = [process.env.ANDROID_JAR, process.env.R8_JAR, process.env.ANDROID_KEYSTORE_PATH];
  if (requiredFiles.some(file => !file || !fs.existsSync(file))) {
    throw new Error('Android toolchain incomplete: ANDROID_JAR, R8_JAR, and ANDROID_KEYSTORE_PATH must point to existing files.');
  }
  if (!process.env.ANDROID_SDK_ROOT || !fs.existsSync(process.env.ANDROID_SDK_ROOT)) {
    throw new Error('ANDROID_SDK_ROOT is missing or invalid.');
  }
  if (!process.env.KEYSTORE_PASSWORD || !process.env.KEY_ALIAS || !process.env.KEY_PASSWORD) {
    throw new Error('Signing credentials missing: KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD are required.');
  }
  for (const tool of ['aapt', 'zipalign', 'apksigner', 'unzip', 'convert']) {
    try { await execPromise(`command -v ${tool}`); }
    catch { throw new Error(`Android build tool missing on PATH: ${tool}`); }
  }
}

export function getBuildJob(buildId: string): BuildJob | undefined {
  return buildJobs.get(buildId);
}

/**
 * Executes a full 10-stage Android APK production pipeline:
 * 1. Preparing source
 * 2. Validating URL
 * 3. Preparing Android project
 * 4. Building APK
 * 5. Signing APK
 * 6. Validating APK
 * 7. Calculating SHA-256
 * 8. Uploading APK
 * 9. Publishing release
 * 10. Ready to download
 */
// Phase 12.14 TEST-ONLY fixture: stale tracked versions against the live
// production catalog (appmintly 1.0.5, studyria 2.0.2 published) so a check
// finds a genuine eligible update event without touching production data.
// Used ONLY when options.testFixtureSeed is explicitly set by the test
// workflow; production builds never reference it.
const TEST_FIXTURE_TRACKED = [
  { appId: 'appmintly', version: '1.0.3' },
  { appId: 'studyria', version: '2.0.1' },
];

export async function runApkBuild(options: ApkBuildOptions): Promise<BuildJob> {
  if (process.env.APK_ARTIFACT_ONLY !== '1' || !process.env.GITHUB_ACTIONS) {
    throw new Error('APK compilation must run in the configured GitHub Actions Android runner.');
  }
  const eligibility = checkApkEligibility(options);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || 'App is not eligible for APK generation');
  }

  const buildId = `build_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const slug = (options.slug || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const packageId = options.packageId || generatePackageId(slug);
  const buildMode = options.buildMode || 'webview';
  const versionName = options.version || '1.0.0';
  const versionCode = options.versionCode || semanticVersionToCode(versionName);
  // Phase 12.14 fail-closed guard: test-only options are accepted only for
  // the native updates package and never leak into production builds.
  if ((options.alarmIntervalMs !== undefined || options.testFixtureSeed === true)
      && packageId !== 'com.appmintly.appmintly') {
    throw new Error('Test-only alarm options are only valid for the native updates package (com.appmintly.appmintly).');
  }
  if (options.alarmIntervalMs !== undefined
      && (!Number.isInteger(options.alarmIntervalMs) || options.alarmIntervalMs < 60000)) {
    throw new Error('Test-only alarm interval must be an integer >= 60000 ms.');
  }
  const appName = options.name.trim();
  const themeColor = options.themeColor || '#17191C';
  const backgroundColor = options.backgroundColor || '#FFFDF8';

  // Canonical filename e.g. PDFMiniFly-2.1.0.apk
  const cleanAppName = appName.replace(/[^a-zA-Z0-9]/g, '');
  const canonicalFileName = options.fileName || `${cleanAppName || 'App'}-${versionName}.apk`;

  const job: BuildJob = {
    buildId,
    appId: options.appId,
    slug,
    name: appName,
    version: versionName,
    versionCode,
    packageId,
    buildMode,
    status: 'building',
    currentStep: 'Preparing source',
    stageIndex: 0,
    progress: 10,
    stepsCompleted: [],
    fileName: canonicalFileName,
    startedAt: new Date().toISOString(),
  };

  buildJobs.set(buildId, job);

  // Run the 10 build stages asynchronously
  (async () => {
    const buildDir = `/tmp/appforge-builds/${buildId}`;
    try {
      // ---------------------------------------------------------
      // TOOLCHAIN PREFLIGHT CHECK (Requirement 4)
      // java -version, javac -version, echo $JAVA_HOME
      // If javac is unavailable, fails with a clear actionable error
      // ---------------------------------------------------------
      const preflight = await checkJavaToolchainPreflight();
      if (!preflight.valid) {
        throw new Error(preflight.error);
      }
      console.log(
        `[ApkBuilder] Toolchain verified: java=${preflight.javaVersion.split('\n')[0]}, javac=${preflight.javacVersion}, JAVA_HOME=${preflight.javaHome}`
      );

      // Ensure Android SDK jar, D8/R8 bytecode compiler, and release keystore exist
      await ensureAndroidToolchain();

      const javaHome = preflight.javaHome;
      const buildEnv = {
        ...process.env,
        JAVA_HOME: javaHome,
        PATH: `${path.join(javaHome, 'bin')}:${process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}`,
      };

      // ---------------------------------------------------------
      // STAGE 1: Preparing source
      // ---------------------------------------------------------
      job.currentStep = 'Preparing source';
      job.stageIndex = 0;
      job.progress = 10;

      await fs.promises.mkdir(buildDir, { recursive: true });
      const pkgPath = packageId.replace(/\./g, '/');
      const srcDir = path.join(buildDir, 'src', pkgPath);
      const resDir = path.join(buildDir, 'res');
      const mipmapMdpi = path.join(resDir, 'mipmap-mdpi');
      const mipmapHdpi = path.join(resDir, 'mipmap-hdpi');
      const mipmapXhdpi = path.join(resDir, 'mipmap-xhdpi');
      const mipmapXxhdpi = path.join(resDir, 'mipmap-xxhdpi');
      const mipmapXxxhdpi = path.join(resDir, 'mipmap-xxxhdpi');
      const valuesDir = path.join(resDir, 'values');
      const classesDir = path.join(buildDir, 'classes');
      const dexDir = path.join(buildDir, 'dex');

      await Promise.all([
        fs.promises.mkdir(srcDir, { recursive: true }),
        fs.promises.mkdir(mipmapMdpi, { recursive: true }),
        fs.promises.mkdir(mipmapHdpi, { recursive: true }),
        fs.promises.mkdir(mipmapXhdpi, { recursive: true }),
        fs.promises.mkdir(mipmapXxhdpi, { recursive: true }),
        fs.promises.mkdir(mipmapXxxhdpi, { recursive: true }),
        fs.promises.mkdir(valuesDir, { recursive: true }),
        fs.promises.mkdir(classesDir, { recursive: true }),
        fs.promises.mkdir(dexDir, { recursive: true }),
      ]);

      // Download / resolve source icon
      let iconBuffer: Buffer | null = null;
      if (options.iconUrl && options.iconUrl.startsWith('http')) {
        try {
          const iconRes = await fetch(options.iconUrl, { headers: { 'User-Agent': 'AppMintly-ApkBuilder/1.0' } });
          if (iconRes.ok) {
            iconBuffer = Buffer.from(await iconRes.arrayBuffer());
          }
        } catch (e) {
          console.warn('[ApkBuilder] Failed to download icon from URL:', e);
        }
      }

      if (!iconBuffer && options.iconUrl && !options.iconUrl.startsWith('http')) {
        const localPath = path.join(process.cwd(), 'public', options.iconUrl.replace(/^\//, ''));
        if (fs.existsSync(localPath)) {
          iconBuffer = await fs.promises.readFile(localPath);
        }
      }

      let ext = 'png';
      if (iconBuffer && iconBuffer.length > 4) {
        if (iconBuffer[0] === 0x89 && iconBuffer[1] === 0x50 && iconBuffer[2] === 0x4e && iconBuffer[3] === 0x47) {
          ext = 'png';
        } else if (iconBuffer[0] === 0x00 && iconBuffer[1] === 0x00 && iconBuffer[2] === 0x01 && iconBuffer[3] === 0x00) {
          ext = 'ico';
        } else if (iconBuffer[0] === 0xff && iconBuffer[1] === 0xd8 && iconBuffer[2] === 0xff) {
          ext = 'jpg';
        } else if (iconBuffer.toString('utf8', 0, 4) === 'RIFF') {
          ext = 'webp';
        }
      }

      const rawIconPath = path.join(buildDir, `source_icon.${ext}`);
      if (iconBuffer) {
        await fs.promises.writeFile(rawIconPath, iconBuffer);
      } else {
        const initial = appName.charAt(0).toUpperCase() || 'A';
        await execPromise(
          `convert -size 512x512 xc:"${themeColor}" -fill "#ffffff" -pointsize 260 -gravity center -draw "text 0,0 '${initial}'" "${rawIconPath}"`
        );
      }

      // Generate all launcher icon densities
      const densities = [
        { dir: mipmapMdpi, size: 48 },
        { dir: mipmapHdpi, size: 72 },
        { dir: mipmapXhdpi, size: 96 },
        { dir: mipmapXxhdpi, size: 144 },
        { dir: mipmapXxxhdpi, size: 192 },
      ];

      const inputSpec = ext === 'ico' ? `"${rawIconPath}[0]"` : `"${rawIconPath}"`;
      for (const d of densities) {
        const outSquare = path.join(d.dir, 'ic_launcher.png');
        const outRound = path.join(d.dir, 'ic_launcher_round.png');
        await execPromise(`convert ${inputSpec} -resize ${d.size}x${d.size}! -background none "${outSquare}"`);
        await execPromise(
          `convert "${outSquare}" \\( +clone -alpha extract -draw "circle ${d.size / 2},${d.size / 2} ${d.size / 2},1" \\) -channel rgba -alpha set -compose DstIn -composite "${outRound}"`
        );
      }

      // Adaptive icon (Android 8+): real artwork foreground sized into the
      // adaptive safe zone over a background layer. Without this, modern
      // launchers render the flat legacy square (excessive white border).
      const anydpiDir = path.join(resDir, 'mipmap-anydpi-v26');
      await fs.promises.mkdir(anydpiDir, { recursive: true });
      const adaptiveForegroundDensities: { dir: string; canvas: number }[] = [
        { dir: mipmapMdpi, canvas: 108 },
        { dir: mipmapHdpi, canvas: 162 },
        { dir: mipmapXhdpi, canvas: 216 },
        { dir: mipmapXxhdpi, canvas: 324 },
        { dir: mipmapXxxhdpi, canvas: 432 },
      ];
      for (const d of adaptiveForegroundDensities) {
        const fgSize = Math.round(d.canvas * 0.75); // keeps artwork content inside the 66/108 safe zone
        await execPromise(
          `convert ${inputSpec} -resize ${fgSize}x${fgSize} -gravity center -background none -extent ${d.canvas}x${d.canvas} "${path.join(d.dir, 'ic_launcher_foreground.png')}"`
        );
      }
      const adaptiveIconXml = (foreground: string) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/${foreground}"/>
</adaptive-icon>
`;
      await fs.promises.writeFile(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveIconXml('ic_launcher_foreground'), 'utf8');
      await fs.promises.writeFile(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveIconXml('ic_launcher_foreground'), 'utf8');
      job.stepsCompleted.push('Launcher icons (legacy + adaptive)');

      job.stepsCompleted.push('Preparing source');

      // ---------------------------------------------------------
      // STAGE 2: Validating URL
      // ---------------------------------------------------------
      job.currentStep = 'Validating URL';
      job.stageIndex = 1;
      job.progress = 20;

      try {
        const urlCheck = await fetch(options.launchUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': 'AppMintly-ApkBuilder/1.0' },
        });
        if (urlCheck.status >= 500) {
          throw new Error(`Target web application returned server error HTTP ${urlCheck.status}`);
        }
      } catch (err: any) {
        console.warn('[ApkBuilder] Source URL validation note:', err.message);
      }
      job.stepsCompleted.push('Validating URL');

      // ---------------------------------------------------------
      // STAGE 3: Preparing Android project
      // ---------------------------------------------------------
      job.currentStep = 'Preparing Android project';
      job.stageIndex = 2;
      job.progress = 30;

      // strings.xml & colors.xml
      const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(appName)}</string>
    <string name="launch_url">${escapeXml(options.launchUrl)}</string>
</resources>`;
      await fs.promises.writeFile(path.join(valuesDir, 'strings.xml'), stringsXml, 'utf8');

      const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="theme_color">${themeColor}</color>
    <color name="bg_color">${backgroundColor}</color>
    <color name="ic_launcher_background">${iconBuffer ? '#FEFEFE' : themeColor}</color>
</resources>`;
      await fs.promises.writeFile(path.join(valuesDir, 'colors.xml'), colorsXml, 'utf8');

      // ----------------------------------------------------------------
      // NATIVE UPDATE CHECKER GATE (AppMintly notifications).
      // ONLY the marketplace's own APK (com.appmintly.appmintly) receives
      // the native update-checker engine; every other app build is
      // byte-identical to before this feature existed.
      // ----------------------------------------------------------------
      const NATIVE_UPDATE_PACKAGE = 'com.appmintly.appmintly';
      const isNativeUpdatesBuild = packageId === NATIVE_UPDATE_PACKAGE;
      let nativeCatalogUrl = '';
      let nativeDeepLinkPrefix = '';
      if (isNativeUpdatesBuild) {
        // Fail closed: the engine bakes the canonical marketplace catalog
        // origin. A different origin for the marketplace's own package is
        // a build configuration error and refuses to compile.
        const catalogOrigin = new URL(options.launchUrl).origin;
        if (catalogOrigin !== 'https://appmintly.pages.dev') {
          throw new Error(
            'Native update checker refused: the AppMintly APK launch URL must be the canonical https://appmintly.pages.dev deployment.'
          );
        }
        nativeCatalogUrl = catalogOrigin + '/data/apps.json';
        nativeDeepLinkPrefix = computeWebViewOwnershipPrefix(options.launchUrl);
      }

      // AndroidManifest.xml
      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${packageId}"
    android:versionCode="${versionCode}"
    android:versionName="${escapeXml(versionName)}">

    <uses-sdk android:minSdkVersion="${MODERN_MIN_SDK}" android:targetSdkVersion="${MODERN_TARGET_SDK}" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.DOWNLOAD_WITHOUT_NOTIFICATION" />${
          isNativeUpdatesBuild
            ? `
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />`
            : ''
        }

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:theme="@android:style/Theme.NoTitleBar"
        android:allowBackup="true"
        android:supportsRtl="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:label="@string/app_name"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>${
          isNativeUpdatesBuild
            ? `

        <receiver
            android:name=".AlarmReceiver"
            android:exported="false" />
        <receiver
            android:name=".BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>`
            : ''
        }
    </application>
</manifest>`;
      await fs.promises.writeFile(path.join(buildDir, 'AndroidManifest.xml'), manifestXml, 'utf8');

      // MainActivity.java: Hardened, production-ready WebView wrapper
      // Keep ONLY the app's own deployment namespace inside the WebView — not the
      // whole origin. On shared-origin hosts (e.g. GitHub Pages project sites) the
      // origin also hosts unrelated sibling apps; routing those into this app's
      // window breaks the expected normal-browser context (history, address bar,
      // Android Back). The prefix is derived from the FULL launch URL path so
      // e.g. "https://host/appmintly-platform/" stays in-app while sibling paths
      // like "/niramay/" or "/nexdrop/" open in the normal browser.
      // Ownership prefix — derived ONLY from this app's own launch URL via the
      // single-source-of-truth helper above. Never from any published app URL.
      const allowedPrefix = computeWebViewOwnershipPrefix(options.launchUrl);

      const isTwa = buildMode === 'twa';

      const javaCode = `package ${packageId};

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;${
          isNativeUpdatesBuild
            ? `
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;`
            : ''
        }
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;
    private final static int FILE_CHOOSER_RESULT_CODE = 1001;
    private final String TARGET_URL = "${escapeJava(options.launchUrl)}";
    private final String ALLOWED_ORIGIN = "${escapeJava(allowedPrefix)}";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Customize status bar color
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Window window = getWindow();
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(Color.parseColor("${escapeJava(themeColor)}"));
            }
        } catch (Exception ignored) {}

        ${
          isTwa
            ? `try {
            Intent customTabIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(TARGET_URL));
            customTabIntent.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", Color.parseColor("${escapeJava(themeColor)}"));
            customTabIntent.putExtra("androidx.browser.customtabs.extra.COLOR_SCHEME", 1);
            if (customTabIntent.resolveActivity(getPackageManager()) != null) {
                startActivity(customTabIntent);
                finish();
                return;
            }
        } catch (Exception ignored) {}`
            : ''
        }

        // Production-Grade Hardened WebView Engine
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ALLOWED_ORIGIN)) {
                    return false; // Stay within this app's own namespace only
                }
                // Open external links safely in external browser
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Unable to open link", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    String errorHtml = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                        + "<style>body{font-family:-apple-system,sans-serif;margin:0;padding:40px 20px;text-align:center;background:#FFFDF8;color:#17191C;}"
                        + "h2{font-size:22px;margin-bottom:8px;font-weight:900;}p{color:#6F6F6F;font-size:14px;line-height:1.5;margin-bottom:24px;}"
                        + "button{background:#17191C;color:#fff;border:none;padding:12px 28px;border-radius:20px;font-weight:bold;font-size:14px;cursor:pointer;}"
                        + "</style></head><body>"
                        + "<h2>Connection Problem</h2>"
                        + "<p>Unable to connect to the server. Please check your internet connection.</p>"
                        + "<button onclick='window.location.reload()'>Retry</button>"
                        + "</body></html>";
                    view.loadDataWithBaseURL(null, errorHtml, "text/html", "UTF-8", null);
                }
            }
        });

        // File Chooser for document / image upload
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Download Listener for generated documents / files
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setMimeType(mimetype);
                    request.allowScanningByMediaScanner();
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Uri.parse(url).getLastPathSegment());
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        dm.enqueue(request);
                        Toast.makeText(MainActivity.this, "Downloading file...", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                }
            }
        });

${
          isNativeUpdatesBuild
            ? `// AppMintly native update checker: expose the JS bridge to the
        // marketplace page (only pages inside the ownership boundary ever
        // load here) and schedule the ~6h background catalog check.
        webView.addJavascriptInterface(new NativeBridge(), "AppMintlyNative");
        UpdateEngine.schedule(this);

        // Notification deep link (cold start): only the app's own ownership
        // prefix is ever honored.
        String deepLink = getIntent().getStringExtra(UpdateEngine.EXTRA_DEEP_LINK);
        if (deepLink == null && getIntent().getDataString() != null) {
            deepLink = getIntent().getDataString();
        }
        if (deepLink != null && deepLink.startsWith(ALLOWED_ORIGIN)) {
            webView.loadUrl(deepLink);
        } else {
            webView.loadUrl(TARGET_URL);
        }`
            : `webView.loadUrl(TARGET_URL);`
        }
        setContentView(webView);
    }

${
          isNativeUpdatesBuild
            ? `
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent == null || webView == null) return;
        String deepLink = intent.getStringExtra(UpdateEngine.EXTRA_DEEP_LINK);
        if (deepLink == null && intent.getDataString() != null) {
            deepLink = intent.getDataString();
        }
        if (deepLink != null && deepLink.startsWith(ALLOWED_ORIGIN)) {
            webView.loadUrl(deepLink);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == UpdateEngine.PERMISSION_REQUEST_CODE) {
            if (grantResults != null && grantResults.length > 0
                    && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(MainActivity.this, "AppMintly notifications enabled", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(MainActivity.this, "Notifications blocked in Android settings", Toast.LENGTH_LONG).show();
            }
        }
    }

    /**
     * JS bridge (marketplace page -> native). Only @JavascriptInterface
     * methods are reachable from the page, and the only page that ever
     * loads in this WebView is the marketplace's own owned deployment.
     */
    private class NativeBridge {

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void requestPermission() {
            final Activity activity = MainActivity.this;
            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    UpdateEngine.requestNotificationPermission(activity);
                }
            });
        }

        @JavascriptInterface
        public void setPreferences(String json) {
            try {
                UpdateEngine.applyPreferences(MainActivity.this, json);
            } catch (Throwable ignored) {
            }
        }

        @JavascriptInterface
        public void setTrackedApps(String json) {
            try {
                UpdateEngine.setTrackedApps(MainActivity.this, json);
            } catch (Throwable ignored) {
            }
        }

        @JavascriptInterface
        public void checkNow() {
            UpdateEngine.checkNow(MainActivity.this);
        }

        @JavascriptInterface
        public String getStatus() {
            try {
                return UpdateEngine.getStatusJson(MainActivity.this);
            } catch (Throwable t) {
                return "{}";
            }
        }
    }
`
            : ''
    }
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (fileUploadCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                }
                fileUploadCallback.onReceiveValue(results);
                fileUploadCallback = null;
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
      await fs.promises.writeFile(path.join(srcDir, 'MainActivity.java'), javaCode, 'utf8');
      if (options.keepGeneratedSource === true) {
        // TEST-ONLY (Phase 12.14): production builds never set this flag.
        await fs.promises.mkdir('evidence', { recursive: true });
        await fs.promises.writeFile(path.join('evidence', 'generated-MainActivity.java'), javaCode, 'utf8');
      }
      job.stepsCompleted.push('Preparing Android project');

      // ----------------------------------------------------------------
      // NATIVE UPDATE CHECKER SOURCES (marketplace APK only).
      // UpdateEngine mirrors lib/notifications/engine.ts exactly:
      // published-only records, real numeric version comparison, explicit
      // publisher-set severity, deterministic dedup keys, silent first-run
      // baseline, offline-skip. No push service of any kind is involved:
      // this is an honest periodic poll (target ~6h, subject to Android
      // batching/Doze), never an instant push.
      // ----------------------------------------------------------------
      if (isNativeUpdatesBuild) {
        const updateEngineJava = `package ${packageId};

import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;

/**
 * AppMintly native update checker (marketplace APK only).
 * Mirrors the TypeScript engine in lib/notifications/engine.ts.
 */
public final class UpdateEngine {

    private UpdateEngine() {
    }

    public static final String EXTRA_DEEP_LINK = "appmintly_deeplink";
    // Dedicated non-MAIN action for notification content intents: on API 36
    // the notification-tap launch path special-cases ACTION_MAIN intents that
    // target the launcher activity, rebuilding a bare launcher intent
    // (act=MAIN cat=[LAUNCHER]) and discarding the app-supplied extras AND
    // data URI. A dedicated action is delivered verbatim (Phase 12.5
    // emulator evidence: run 38029699330 START records).
    public static final String ACTION_OPEN_NOTIFICATION = "${packageId}.ACTION_OPEN_NOTIFICATION";
    public static final int PERMISSION_REQUEST_CODE = 2001;
    public static final String ACTION_CHECK_UPDATES = "${packageId}.ACTION_CHECK_UPDATES";
    private static final String PREFS = "appmintly_updates";
    private static final String CHANNEL_ID = "appmintly_updates";
    private static final long CHECK_INTERVAL_MS = ${options.alarmIntervalMs !== undefined ? `${options.alarmIntervalMs}L` : '6L * 60L * 60L * 1000L'};
    private static final String CATALOG_URL = "${escapeJava(nativeCatalogUrl)}";
    private static final String OWNED_PREFIX = "${escapeJava(nativeDeepLinkPrefix)}";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;
    private static final int MAX_CATALOG_BYTES = 8 * 1024 * 1024;

    /* ---------------- scheduling (~6h inexact repeating alarm) ---------- */

    public static void schedule(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, AlarmReceiver.class);
            i.setAction(ACTION_CHECK_UPDATES);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, 1001, i, flags);
            // Inexact repeating: Android may batch/delay for battery. This
            // is a target cadence, never a guaranteed execution time.
            am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME,
                    SystemClock.elapsedRealtime() + CHECK_INTERVAL_MS, CHECK_INTERVAL_MS, pi);
        } catch (Throwable ignored) {
        }
    }

    public static boolean isEnabled(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return p.getBoolean("master", false);
        } catch (Throwable t) {
            return false;
        }
    }

    /* ---------------- JS bridge surface ---------------- */

    public static void applyPreferences(Context ctx, String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor e = p.edit();
            e.putBoolean("master", o.optBoolean("master", false));
            e.putBoolean("updates", o.optBoolean("updates", true));
            e.putBoolean("newAndroid", o.optBoolean("newAndroid", true));
            e.putBoolean("newWeb", o.optBoolean("newWeb", true));
            e.putBoolean("important", o.optBoolean("important", true));
            e.putBoolean("security", o.optBoolean("security", true));
            e.apply();
        } catch (Throwable ignored) {
        }
    }

    public static void setTrackedApps(Context ctx, String json) {
        try {
            new JSONArray(json); // validate: never store corrupt input
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putString("tracked", json).apply();
        } catch (Throwable ignored) {
        }
    }

    public static void requestNotificationPermission(Activity activity) {
        // Android 13+ runtime notification permission. Called only from an
        // explicit user action in the marketplace notification settings.
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                activity.requestPermissions(
                        new String[]{"android.permission.POST_NOTIFICATIONS"},
                        PERMISSION_REQUEST_CODE);
            } catch (Throwable ignored) {
            }
        }
    }

    public static void checkNow(Context ctx) {
        final Context appCtx = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    doCheck(appCtx);
                } catch (Throwable ignored) {
                }
            }
        }).start();
    }

    public static String getStatusJson(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean granted = true;
            if (Build.VERSION.SDK_INT >= 33) {
                granted = ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                        == PackageManager.PERMISSION_GRANTED;
            }
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            return new JSONObject()
                    .put("installed", true)
                    .put("permissionGranted", granted)
                    .put("notificationsEnabled", nm == null || Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled())
                    .put("lastCheck", p.getLong("lastCheck", 0L))
                    .put("lastCheckState", p.getString("lastCheckState", ""))
                    .put("checkIntervalHours", 6)
                    .toString();
        } catch (Throwable t) {
            return "{}";
        }
    }

    /* ---------------- core check ---------------- */

${options.testFixtureSeed === true ? `    /* TEMPORARY TEST BUILD ONLY (Phase 12.14): seeds the update-check
     * fixture before the master gate, because the WebView preference sync
     * (web -> native) would otherwise overwrite it. Seeded exactly once;
     * the real engine, gating, dedup and delivery paths stay untouched. */
    private static void seedTestFixture(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (p.getBoolean("test_fixture_seeded", false)) return;
            SharedPreferences.Editor e = p.edit();
            e.putBoolean("master", true);
            e.putString("tracked", "${escapeJava(JSON.stringify(TEST_FIXTURE_TRACKED))}");
            e.putString("delivered", "{}");
            e.putBoolean("test_fixture_seeded", true);
            e.apply();
        } catch (Throwable ignored) {
        }
    }

    static void doCheck(Context ctx) throws Exception {
        seedTestFixture(ctx);
        if (!isEnabled(ctx)) {
            return;
        }` : `    static void doCheck(Context ctx) throws Exception {
        if (!isEnabled(ctx)) {
            return;
        }`}
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) {
            // OS-level notification permission denied: skip honestly,
            // record state; never post or claim delivery.
            recordCheck(ctx, "notifications_disabled");
            return;
        }
        if (!isOnline(ctx)) {
            // Offline: no unverified data is ever surfaced. The next
            // scheduled check retries.
            recordCheck(ctx, "offline");
            return;
        }
        byte[] raw = fetchCatalog(CATALOG_URL);
        if (raw == null || raw.length == 0) {
            recordCheck(ctx, "fetch_failed");
            return;
        }
        JSONArray apps = new JSONArray(new String(raw, "UTF-8"));
        if (apps.length() == 0) {
            recordCheck(ctx, "empty_catalog");
            return;
        }

        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject baseline = null;
        try {
            baseline = new JSONObject(p.getString("baseline", ""));
        } catch (Throwable t) {
            baseline = null;
        }
        JSONObject delivered = new JSONObject();
        try {
            delivered = new JSONObject(p.getString("delivered", "{}"));
        } catch (Throwable t) {
            delivered = new JSONObject();
        }
        SharedPreferences.Editor editor = p.edit();

        // First run (or corrupted state): initialize the baseline silently.
        // Existing catalog entries never appear as "new" publications.
        if (baseline == null || baseline.length() == 0) {
            JSONObject fresh = buildBaseline(apps);
            editor.putString("baseline", fresh.toString());
            editor.putLong("lastCheck", System.currentTimeMillis());
            editor.putString("lastCheckState", "initialized");
            editor.apply();
            return;
        }

        JSONArray tracked = new JSONArray(p.getString("tracked", "[]"));
        boolean prefUpdates = p.getBoolean("updates", true);
        boolean prefNewAndroid = p.getBoolean("newAndroid", true);
        boolean prefNewWeb = p.getBoolean("newWeb", true);
        boolean prefImportant = p.getBoolean("important", true);
        boolean prefSecurity = p.getBoolean("security", true);

        JSONObject next = new JSONObject();
        long now = System.currentTimeMillis();
        int posted = 0;

        // Pass 1: baseline snapshot + genuinely-new publication events.
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a == null || !isPublished(a)) {
                continue;
            }
            String id = a.optString("id", "");
            if (id.isEmpty()) id = a.optString("slug", "");
            if (id.isEmpty()) continue;
            String version = releaseVersion(a);
            boolean isAndroidApp = "android apk".equalsIgnoreCase(a.optString("type", "").trim());
            String severity = parseSeverity(a);
            next.put(id, new JSONObject()
                    .put("version", version)
                    .put("android", isAndroidApp)
                    .put("severity", severity));

            if (baseline.has(id)) {
                continue;
            }
            String key = (isAndroidApp ? "new-android-app:" : "new-web-app:") + id + ":" + version;
            if (delivered.has(key)) continue;
            if (isAndroidApp ? !prefNewAndroid : !prefNewWeb) continue;
            String name = a.optString("name", id);
            String deepLink = OWNED_PREFIX + "app/" + id + "/";
            String title;
            String body;
            if (isAndroidApp) {
                title = "New on AppMintly";
                body = "Discover " + name + ", a new Android app now available.";
            } else {
                title = "New Web App on AppMintly";
                body = "Try " + name + "'s latest web experience.";
            }
            if (postNotification(ctx, nm, key, title, body, deepLink)) {
                delivered.put(key, now);
                posted++;
            }
        }

        // Pass 2: version upgrades for user-tracked apps only. Real numeric
        // comparison; downgrades and equal versions never notify.
        for (int t = 0; t < tracked.length(); t++) {
            JSONObject tr = tracked.optJSONObject(t);
            if (tr == null) continue;
            String appId = tr.optString("appId", "");
            String installedVersion = tr.optString("version", "").trim();
            if (appId.isEmpty() || installedVersion.isEmpty()) continue;
            if (!next.has(appId)) continue;
            JSONObject cur = next.optJSONObject(appId);
            if (cur == null) continue;
            String version = cur.optString("version", "");
            if (compareVersions(version, installedVersion) <= 0) continue;

            String severity = cur.optString("severity", "normal");
            String kind;
            if ("security".equals(severity) || "critical".equals(severity)) {
                kind = "security-update";
            } else if ("important".equals(severity)) {
                kind = "important-update";
            } else {
                kind = "app-update";
            }
            String key = kind + ":" + appId + ":" + version;
            if (delivered.has(key)) continue;
            boolean allowed;
            if ("security-update".equals(kind)) {
                allowed = prefSecurity;
            } else if ("important-update".equals(kind)) {
                allowed = prefImportant;
            } else {
                allowed = prefUpdates;
            }
            if (!allowed) continue;

            JSONObject a = findApp(apps, appId);
            String name = a != null ? a.optString("name", appId) : appId;
            String title;
            String body;
            if ("security-update".equals(kind)) {
                if ("critical".equals(severity)) {
                    title = "Critical security update: " + name;
                } else {
                    title = "Important security update";
                }
                body = "A security fix is available for " + name + ". Review the release details.";
            } else if ("important-update".equals(kind)) {
                title = "Important update: " + name;
                body = "Version " + version + " includes an important change. Review the release details.";
            } else {
                title = "Update available: " + name;
                body = "Version " + version + " is available. View the latest changes.";
            }
            String deepLink = OWNED_PREFIX + "app/" + appId + "/";
            if (postNotification(ctx, nm, key, title, body, deepLink)) {
                delivered.put(key, now);
                posted++;
            }
        }

        // Prune the delivered history so it cannot grow unbounded
        // (keep ~90 days).
        if (delivered.length() > 300) {
            JSONObject pruned = new JSONObject();
            long cutoff = now - 90L * 24L * 60L * 60L * 1000L;
            java.util.Iterator<String> it = delivered.keys();
            while (it.hasNext()) {
                String k = it.next();
                long ts = delivered.optLong(k, 0L);
                if (ts >= cutoff) {
                    pruned.put(k, ts);
                }
            }
            delivered = pruned;
        }

        editor.putString("baseline", next.toString());
        editor.putString("delivered", delivered.toString());
        editor.putLong("lastCheck", now);
        editor.putString("lastCheckState", "ok");
        editor.putInt("lastPosted", posted);
        editor.apply();
    }

    /* ---------------- helpers ---------------- */

    private static void recordCheck(Context ctx, String state) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit()
                    .putLong("lastCheck", System.currentTimeMillis())
                    .putString("lastCheckState", state)
                    .apply();
        } catch (Throwable ignored) {
        }
    }

    private static boolean isOnline(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Throwable t) {
            return false;
        }
    }

    private static byte[] fetchCatalog(String url) {
        HttpsURLConnection conn = null;
        try {
            URL u = new URL(url);
            if (!u.getProtocol().equals("https")) return null;
            conn = (HttpsURLConnection) u.openConnection();
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestMethod("GET");
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            InputStream in = conn.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_CATALOG_BYTES) {
                    in.close();
                    return null;
                }
            }
            in.close();
            return out.toByteArray();
        } catch (Throwable t) {
            return null;
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Throwable ignored) { }
            }
        }
    }

    private static boolean isPublished(JSONObject a) {
        if (a.optBoolean("isDemo", false)) return false;
        String status = a.optString("status", "").toLowerCase().trim();
        if ("draft".equals(status) || "archived".equals(status)) return false;
        boolean flag = a.has("published") ? a.optBoolean("published", false) : true;
        return flag && !releaseVersion(a).isEmpty()
                && (a.optString("id", "").length() > 0 || a.optString("slug", "").length() > 0);
    }

    private static String releaseVersion(JSONObject a) {
        JSONObject apk = a.optJSONObject("apk");
        String apkVersion = apk != null ? apk.optString("versionName", "").trim() : "";
        if (!apkVersion.isEmpty()) return apkVersion;
        return a.optString("version", "").trim();
    }

    /** Severity is ONLY read from the explicit publisher-set field. */
    private static String parseSeverity(JSONObject a) {
        String raw = a.optString("releaseSeverity", "");
        if (raw.isEmpty()) {
            JSONObject apk = a.optJSONObject("apk");
            if (apk != null) raw = apk.optString("releaseSeverity", "");
        }
        raw = raw.trim().toLowerCase();
        if ("important".equals(raw) || "security".equals(raw) || "critical".equals(raw)) {
            return raw;
        }
        return "normal";
    }

    private static int compareVersions(String a, String b) {
        String[] pa = String.valueOf(a == null ? "" : a).split("\\\\.");
        String[] pb = String.valueOf(b == null ? "" : b).split("\\\\.");
        int len = Math.max(pa.length, pb.length);
        int na = 0;
        int nb = 0;
        for (int i = 0; i < len; i++) {
            try { na = Integer.parseInt(pa[i]); } catch (Throwable t) { na = 0; }
            try { nb = Integer.parseInt(pb[i]); } catch (Throwable t) { nb = 0; }
            if (na != nb) return na - nb;
        }
        return 0;
    }

    private static JSONObject findApp(JSONArray apps, String id) {
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a == null) continue;
            String aid = a.optString("id", "");
            if (aid.isEmpty()) aid = a.optString("slug", "");
            if (id.equals(aid)) return a;
        }
        return null;
    }

    private static JSONObject buildBaseline(JSONArray apps) throws org.json.JSONException {
        JSONObject out = new JSONObject();
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a == null || !isPublished(a)) continue;
            String id = a.optString("id", "");
            if (id.isEmpty()) id = a.optString("slug", "");
            if (id.isEmpty()) continue;
            out.put(id, new JSONObject()
                    .put("version", releaseVersion(a))
                    .put("android", "android apk".equalsIgnoreCase(a.optString("type", "").trim()))
                    .put("severity", parseSeverity(a)));
        }
        return out;
    }

    private static boolean postNotification(Context ctx, NotificationManager nm,
            String key, String title, String body, String deepLink) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "App updates and new releases",
                        NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Update and release notifications from the AppMintly marketplace.");
                nm.createNotificationChannel(channel);
            }
            Intent open = new Intent(ctx, MainActivity.class);
            open.setAction(ACTION_OPEN_NOTIFICATION);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            // Deep link is validated against the ownership prefix before
            // it is ever honored by MainActivity. It is carried BOTH as an
            // extra and as the intent data; the dedicated action keeps the
            // tap launch out of the launcher-relaunch path that would strip
            // both on API 36.
            open.putExtra(EXTRA_DEEP_LINK, deepLink);
            open.setData(Uri.parse(deepLink));
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent contentIntent = PendingIntent.getActivity(
                    ctx, Math.abs(key.hashCode()) % 100000, open, piFlags);
            Notification n;
            if (Build.VERSION.SDK_INT >= 26) {
                n = new Notification.Builder(ctx, CHANNEL_ID)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new Notification.BigTextStyle().bigText(body))
                        .setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentIntent(contentIntent)
                        .setAutoCancel(true)
                        .build();
            } else {
                n = new Notification.Builder(ctx)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new Notification.BigTextStyle().bigText(body))
                        .setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentIntent(contentIntent)
                        .setAutoCancel(true)
                        .build();
            }
            nm.notify(Math.abs(key.hashCode()) % 100000, n);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }
}
`;
        await fs.promises.writeFile(path.join(srcDir, 'UpdateEngine.java'), updateEngineJava, 'utf8');

        const alarmReceiverJava = `package ${packageId};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Fires the ~6h catalog check. goAsync keeps the process alive just long
 * enough for the network check; the check is skipped entirely when the
 * device is offline (never shows unverified data).
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context context, Intent intent) {
        if (intent == null || !UpdateEngine.ACTION_CHECK_UPDATES.equals(intent.getAction())) return;
        if (!UpdateEngine.isEnabled(context)) return;
        final PendingResult result = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    UpdateEngine.doCheck(context);
                } catch (Throwable ignored) {
                } finally {
                    if (result != null) result.finish();
                }
            }
        }).start();
    }
}
`;
        await fs.promises.writeFile(path.join(srcDir, 'AlarmReceiver.java'), alarmReceiverJava, 'utf8');

        const bootReceiverJava = `package ${packageId};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Alarms do not survive reboot: reschedule the periodic catalog check.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        UpdateEngine.schedule(context);
    }
}
`;
        await fs.promises.writeFile(path.join(srcDir, 'BootReceiver.java'), bootReceiverJava, 'utf8');
      }


      // ---------------------------------------------------------
      // STAGE 4: Building APK
      // ---------------------------------------------------------
      job.currentStep = 'Building APK';
      job.stageIndex = 3;
      job.progress = 45;

      const androidJar = process.env.ANDROID_JAR!;
      const r8Jar = process.env.R8_JAR!;
      const keystore = process.env.ANDROID_KEYSTORE_PATH!;

      // 4a. Compile Java classes. The marketplace's own APK additionally
      // compiles UpdateEngine/AlarmReceiver/BootReceiver (native update
      // checker); every other app build still compiles exactly one source
      // file and produces byte-identical output.
      const javaSources = (await fs.promises.readdir(srcDir))
        .filter((f) => f.endsWith('.java'))
        .sort()
        .map((f) => path.join(srcDir, f));
      await execPromise(
        `javac -cp "${androidJar}" -source 8 -target 8 -d "${classesDir}" ${javaSources
          .map((f) => `"${f}"`)
          .join(' ')}`,
        { env: buildEnv }
      );

      // 4b. Compile Dalvik bytecode (.dex) with D8
      await execPromise(
        `java -cp "${r8Jar}" com.android.tools.r8.D8 --output "${dexDir}" --lib "${androidJar}" "${path.join(classesDir, pkgPath)}"/*.class`,
        { env: buildEnv }
      );

      // 4c. Package Android resources with AAPT
      const unalignedApk = path.join(buildDir, 'unaligned.apk');
      await execPromise(
        `aapt package -f -m -F "${unalignedApk}" -M "${path.join(buildDir, 'AndroidManifest.xml')}" -S "${resDir}" -I "${androidJar}"`,
        { env: buildEnv }
      );

      // 4d. Add classes.dex into unaligned APK (support zip or jar tool from JDK)
      try {
        await execPromise(`cd "${dexDir}" && zip -u "${unalignedApk}" classes.dex`, { env: buildEnv });
      } catch (zipErr) {
        await execPromise(`jar uf "${unalignedApk}" -C "${dexDir}" classes.dex`, { env: buildEnv });
      }

      job.stepsCompleted.push('Building APK');

      // ---------------------------------------------------------
      // STAGE 5: Signing APK
      // ---------------------------------------------------------
      job.status = 'signing';
      job.currentStep = 'Signing APK';
      job.stageIndex = 4;
      job.progress = 60;

      const alignedApk = path.join(buildDir, 'aligned.apk');
      await execPromise(`zipalign -v -p 4 "${unalignedApk}" "${alignedApk}"`, { env: buildEnv });

      const signedApk = path.join(buildDir, 'signed.apk');
      await execPromise(
        `apksigner sign --ks "${keystore}" --ks-key-alias "$KEY_ALIAS" --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEY_PASSWORD --out "${signedApk}" "${alignedApk}"`,
        { env: buildEnv }
      );

      job.stepsCompleted.push('Signing APK');

      // ---------------------------------------------------------
      // STAGE 6: Validating APK
      // ---------------------------------------------------------
      job.status = 'validating';
      job.currentStep = 'Validating APK';
      job.stageIndex = 5;
      job.progress = 70;

      await execPromise(`zipalign -c -v 4 "${signedApk}"`, { env: buildEnv });

      // Rigorous server-side verification: structure, badging, signatures
      const validationResult = await validateApkBinary(signedApk, {
        packageId,
        versionName,
        allowTestSigningIdentity: options.allowTestSigningIdentity === true,
      });

      job.validationResult = validationResult;
      job.stepsCompleted.push('Validating APK');

      // ---------------------------------------------------------
      // STAGE 7: Calculating SHA-256
      // ---------------------------------------------------------
      job.currentStep = 'Calculating SHA-256';
      job.stageIndex = 6;
      job.progress = 80;

      const apkBuffer = await fs.promises.readFile(signedApk);
      const sha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');
      const fileSizeBytes = apkBuffer.length;
      const fileSizeFormatted = validationResult.fileSizeFormatted;

      job.sha256 = sha256;
      job.fileSizeBytes = fileSizeBytes;
      job.fileSizeFormatted = fileSizeFormatted;
      job.stepsCompleted.push('Calculating SHA-256');

      // ---------------------------------------------------------
      // STAGE 8: Uploading APK
      // ---------------------------------------------------------
      job.status = 'uploading';
      job.currentStep = 'Uploading APK';
      job.stageIndex = 7;
      job.progress = 90;

      const publicApksDir = path.join(process.cwd(), 'public', 'downloads', 'apks');
      await fs.promises.mkdir(publicApksDir, { recursive: true });

      // Only the validated artifact is staged. GitHub Actions uploads it separately.
      // No catalog/download URL is published for a private Actions artifact.
      if (process.env.APK_ARTIFACT_ONLY === '1') {
        const targetApkPath = path.join(publicApksDir, canonicalFileName);
        await fs.promises.copyFile(signedApk, targetApkPath);
        job.stepsCompleted.push('Uploading APK');
        job.status = 'completed';
        job.currentStep = 'Validated artifact (not publicly published)';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        await fs.promises.rm(buildDir, { recursive: true, force: true });
        return;
      }

      // Save both canonical filename (e.g. PDFMiniFly-2.1.0.apk) and slug alias
      const targetApkPath = path.join(publicApksDir, canonicalFileName);
      await fs.promises.copyFile(signedApk, targetApkPath);

      const aliasFileName = `${slug}-v${versionName}.apk`;
      if (aliasFileName !== canonicalFileName) {
        await fs.promises.copyFile(signedApk, path.join(publicApksDir, aliasFileName));
      }

      job.stepsCompleted.push('Uploading APK');

      // ---------------------------------------------------------
      // STAGE 9: Publishing release
      // ---------------------------------------------------------
      job.currentStep = 'Publishing release';
      job.stageIndex = 8;
      job.progress = 95;

      const publicReleaseUrl = `https://github.com/${process.env.DISTRIBUTION_REPO || 'PDFly-source/appmintly-releases'}/releases/download/${slug}-v${versionName}/${canonicalFileName}`;
      const backendDownloadUrl = `/api/download-apk/${canonicalFileName}`;

      const apkMetadataRecord = {
        enabled: true,
        buildMode,
        packageId,
        versionName,
        versionCode,
        fileName: canonicalFileName,
        apkUrl: publicReleaseUrl,
        downloadUrl: backendDownloadUrl,
        fileSizeBytes,
        fileSizeFormatted,
        sha256,
        generatedAt: new Date().toISOString(),
        buildStatus: 'ready',
        authorized: true,
      };

      job.apkMetadata = apkMetadataRecord;

      await syncApkMetadataToCatalog({
        appId: options.appId,
        slug,
        packageId,
        versionName,
        versionCode,
        fileName: canonicalFileName,
        apkUrl: publicReleaseUrl,
        sha256,
        fileSizeBytes,
        fileSizeFormatted,
        buildMode,
        buildId,
      });

      job.stepsCompleted.push('Publishing release');

      // ---------------------------------------------------------
      // STAGE 10: Ready to download
      // ---------------------------------------------------------
      job.status = 'completed';
      job.currentStep = 'Ready to download';
      job.stageIndex = 9;
      job.progress = 100;
      job.apkUrl = backendDownloadUrl;
      job.completedAt = new Date().toISOString();
      job.stepsCompleted.push('Ready to download');

      // Cleanup temp build directory
      try {
        await fs.promises.rm(buildDir, { recursive: true, force: true });
      } catch (ignored) {}

    } catch (err: any) {
      console.error('[ApkBuilder] Build failed at stage:', job.currentStep, err);
      job.status = 'failed';
      job.currentStep = 'Build failed';
      job.error = err.message || 'An unexpected error occurred during APK build';
      job.completedAt = new Date().toISOString();
    }
  })();

  return job;
}

/**
 * Updates an app's APK record in data/apps.json
 */
async function syncApkMetadataToCatalog(info: {
  appId: string;
  slug: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  fileName: string;
  apkUrl: string;
  sha256: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  buildMode: 'twa' | 'webview';
  buildId: string;
}) {
  try {
    const catalogPath = path.join(process.cwd(), 'data', 'apps.json');
    if (!fs.existsSync(catalogPath)) return;

    const content = await fs.promises.readFile(catalogPath, 'utf8');
    const apps = JSON.parse(content);
    if (!Array.isArray(apps)) return;

    const idx = apps.findIndex(
      (a: any) =>
        (a.id && a.id.toLowerCase() === info.appId.toLowerCase()) ||
        (a.slug && a.slug.toLowerCase() === info.slug.toLowerCase())
    );

    if (idx !== -1) {
      const app = apps[idx];
      app.apkUrl = info.apkUrl;
      app.size = info.fileSizeFormatted;
      app.version = info.versionName;
      app.apk = {
        enabled: true,
        buildMode: info.buildMode,
        packageId: info.packageId,
        versionName: info.versionName,
        versionCode: info.versionCode,
        fileName: info.fileName,
        apkUrl: info.apkUrl,
        fileSizeBytes: info.fileSizeBytes,
        sha256: info.sha256,
        generatedAt: new Date().toISOString(),
        buildStatus: 'ready',
        buildId: info.buildId,
        authorized: true,
      };

      await fs.promises.writeFile(catalogPath, JSON.stringify(apps, null, 2), 'utf8');
      console.log(`[ApkBuilder] Catalog updated with validated APK metadata for ${app.name}`);
    }
  } catch (err) {
    console.error('[ApkBuilder] Failed to sync APK metadata to catalog:', err);
  }
}

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeJava(unsafe: string): string {
  return (unsafe || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
