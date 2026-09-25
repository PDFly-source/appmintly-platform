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

      // AndroidManifest.xml
      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${packageId}"
    android:versionCode="${versionCode}"
    android:versionName="${escapeXml(versionName)}">

    <uses-sdk android:minSdkVersion="${MODERN_MIN_SDK}" android:targetSdkVersion="${MODERN_TARGET_SDK}" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.DOWNLOAD_WITHOUT_NOTIFICATION" />

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
        </activity>
    </application>
</manifest>`;
      await fs.promises.writeFile(path.join(buildDir, 'AndroidManifest.xml'), manifestXml, 'utf8');

      // MainActivity.java: Hardened, production-ready WebView wrapper
      const targetOrigin = new URL(options.launchUrl).origin;
      const isTwa = buildMode === 'twa';

      const javaCode = `package ${packageId};

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    private final String ALLOWED_ORIGIN = "${escapeJava(targetOrigin)}";

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
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER);
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
                    return false; // Stay within application origin
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

        webView.loadUrl(TARGET_URL);
        setContentView(webView);
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
      job.stepsCompleted.push('Preparing Android project');

      // ---------------------------------------------------------
      // STAGE 4: Building APK
      // ---------------------------------------------------------
      job.currentStep = 'Building APK';
      job.stageIndex = 3;
      job.progress = 45;

      const androidJar = process.env.ANDROID_JAR!;
      const r8Jar = process.env.R8_JAR!;
      const keystore = process.env.ANDROID_KEYSTORE_PATH!;

      // 4a. Compile Java classes
      await execPromise(
        `javac -cp "${androidJar}" -source 8 -target 8 -d "${classesDir}" "${path.join(srcDir, 'MainActivity.java')}"`,
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
