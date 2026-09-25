import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

/**
 * Modern Android target SDK every AppMintly build must compile against.
 * Keeps generated APKs compatible with current Play Protect expectations
 * and avoids the "built for an older version of Android" install warning.
 */
export const MODERN_TARGET_SDK = 36;

/** Lowest release device floor still supported (Android 5.0, 99%+ of devices). */
export const MODERN_MIN_SDK = 21;

/**
 * Sensitive permissions a plain WebView wrapper must never request.
 * If a future app genuinely needs one, extend `expected` explicitly —
 * the validator fails closed by default.
 */
const FORBIDDEN_PERMISSIONS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BODY_SENSORS',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

/**
 * Credential / development artifacts that must never be embedded in a
 * release APK binary (signing keys, API tokens, dev endpoints).
 */
const FORBIDDEN_BINARY_PATTERNS = [
  'sk-ant-api',
  'sk-proj-',
  'github_pat_',
  'ghp_',
  'gho_',
  'AKIA', // AWS access key id prefix
  'BEGIN PRIVATE KEY',
  'BEGIN RSA PRIVATE KEY',
  'BEGIN EC PRIVATE KEY',
  'BEGIN OPENSSH PRIVATE KEY',
  'publish-key',
  'publishKey',
  'localhost:',
  '127.0.0.1',
  '10.0.2.2', // Android emulator host loopback
  'file:///', // file:// access would break the HTTPS-only navigation model
];

export interface ApkValidationResult {
  valid: boolean;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  sha256: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  applicationLabel?: string;
  signatures: {
    v1: boolean;
    v2: boolean;
    v3: boolean;
  };
  checks: {
    fileExists: boolean;
    validZipHeader: boolean;
    manifestPresent: boolean;
    dexPresent: boolean;
    resourcesPresent: boolean;
    metaInfPresent: boolean;
    signaturesValid: boolean;
    packageIdMatch: boolean;
    versionMatch: boolean;
  };
}

/**
 * Performs rigorous, non-simulated server-side validation of a compiled Android APK binary.
 * Inspects ZIP archive structure, AndroidManifest.xml, Dalvik classes.dex, resources.arsc,
 * cryptographic signature via apksigner, and exact SHA-256 / byte count.
 */
export async function validateApkBinary(
  apkFilePath: string,
  expected?: {
    packageId?: string;
    versionName?: string;
    minSize?: number;
    /**
     * Minimum acceptable targetSdkVersion. Modern builds must target the
     * current Android release; anything older triggers the legacy-app
     * install warning on device. Defaults to MODERN_TARGET_SDK.
     */
    minTargetSdk?: number;
  }
): Promise<ApkValidationResult> {
  const minSize = expected?.minSize || 45000; // minimum realistic APK size in bytes

  // 1. File existence check
  if (!fs.existsSync(apkFilePath)) {
    throw new Error(`APK file not found on disk at: ${apkFilePath}`);
  }

  const stat = await fs.promises.stat(apkFilePath);
  if (!stat.isFile()) {
    throw new Error(`APK path is not a file: ${apkFilePath}`);
  }

  if (stat.size < minSize) {
    throw new Error(`APK file size (${stat.size} bytes) is below minimum valid threshold (${minSize} bytes)`);
  }

  // 2. Read file & check ZIP magic bytes (0x50, 0x4B, 0x03, 0x04)
  const buffer = await fs.promises.readFile(apkFilePath);
  if (buffer.length < 4) {
    throw new Error('APK file is too small to contain a valid header');
  }

  const isZip =
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);

  if (!isZip) {
    // Check if this was an HTML error/cookie-check page
    const snippet = buffer.toString('utf8', 0, Math.min(buffer.length, 300));
    if (snippet.includes('<html') || snippet.includes('<!DOCTYPE') || snippet.includes('Cookie check')) {
      throw new Error('APK binary is invalid: File content is HTML (likely authentication or cookie-check page)');
    }
    throw new Error('APK binary is invalid: File does not have valid ZIP / APK magic header (PK\\x03\\x04)');
  }

  // 3. Inspect archive contents using unzip -l
  let manifestPresent = false;
  let dexPresent = false;
  let resourcesPresent = false;
  let metaInfPresent = false;

  try {
    await execPromise(`unzip -tqq "${apkFilePath}"`);
    const { stdout: zipList } = await execPromise(`unzip -l "${apkFilePath}"`);
    manifestPresent = zipList.includes('AndroidManifest.xml');
    dexPresent = zipList.includes('classes.dex');
    resourcesPresent = zipList.includes('resources.arsc');
    metaInfPresent = zipList.includes('META-INF/') && (zipList.includes('.SF') || zipList.includes('.MF'));
  } catch (err: any) {
    throw new Error(`Failed to inspect APK archive structure: ${err.message}`);
  }

  if (!manifestPresent) {
    throw new Error('APK validation failed: AndroidManifest.xml is missing from package');
  }
  if (!dexPresent) {
    throw new Error('APK validation failed: classes.dex (Dalvik executable) is missing from package');
  }
  if (!resourcesPresent) {
    throw new Error('APK validation failed: resources.arsc (compiled resources) is missing from package');
  }

  // 4. Inspect badging and package info using aapt
  let packageId = '';
  let versionCode = 0;
  let versionName = '';
  let applicationLabel = '';
  let targetSdkVersion = 0;
  let minSdkVersion = 0;
  let applicationDebuggable = false;
  const declaredPermissions: string[] = [];

  try {
    const { stdout: aaptOutput } = await execPromise(`aapt dump badging "${apkFilePath}"`);
    const pkgMatch = aaptOutput.match(/package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'/);
    if (pkgMatch) {
      packageId = pkgMatch[1];
      versionCode = parseInt(pkgMatch[2], 10);
      versionName = pkgMatch[3];
    }
    const labelMatch = aaptOutput.match(/application-label:'([^']+)'/);
    if (labelMatch) {
      applicationLabel = labelMatch[1];
    }
    const targetMatch = aaptOutput.match(/targetSdkVersion:'(\d+)'/);
    if (targetMatch) {
      targetSdkVersion = parseInt(targetMatch[1], 10);
    }
    const minMatch = aaptOutput.match(/sdkVersion:'(\d+)'/);
    if (minMatch) {
      minSdkVersion = parseInt(minMatch[1], 10);
    }
    applicationDebuggable = /application-debuggable/.test(aaptOutput);
    for (const m of aaptOutput.matchAll(/uses-permission:'([^']+)'/g)) {
      declaredPermissions.push(m[1]);
    }
  } catch (err: any) {
    throw new Error(`Failed to extract APK badging with aapt: ${err.message}`);
  }

  if (!packageId) {
    throw new Error('APK validation failed: unable to parse package ID from AndroidManifest');
  }

  let packageIdMatch = true;
  if (expected?.packageId && packageId !== expected.packageId) {
    packageIdMatch = false;
    throw new Error(`Package ID mismatch: expected "${expected.packageId}", found "${packageId}"`);
  }

  let versionMatch = true;
  if (expected?.versionName && versionName !== expected.versionName) {
    versionMatch = false;
    throw new Error(`Version name mismatch: expected "${expected.versionName}", found "${versionName}"`);
  }

  // Modern-target gate: legacy targets trigger the "built for an older
  // version of Android" install warning. Fail closed.
  const minTargetSdk = expected?.minTargetSdk ?? MODERN_TARGET_SDK;
  if (targetSdkVersion < minTargetSdk) {
    throw new Error(
      `Modern Android target gate: APK targets SDK ${targetSdkVersion || 'unknown'}, ` +
        `but the central pipeline requires >= ${minTargetSdk}. Update the APK builder target SDK.`
    );
  }
  if (minSdkVersion < MODERN_MIN_SDK) {
    throw new Error(`minSdkVersion ${minSdkVersion || 'unknown'} is below the supported floor of ${MODERN_MIN_SDK}.`);
  }

  // versionCode validity (Android range)
  if (!Number.isInteger(versionCode) || versionCode <= 0 || versionCode > 2100000000) {
    throw new Error(`versionCode ${versionCode} is invalid (must be 1..2100000000).`);
  }

  // Debug builds must never pass validation
  if (applicationDebuggable) {
    throw new Error('APK is debuggable (android:debuggable=true). Release builds must not be debuggable.');
  }

  // testOnly flag: inspect the compiled manifest tree
  try {
    const { stdout: xmlTree } = await execPromise(`aapt dump xmltree "${apkFilePath}" AndroidManifest.xml`);
    // aapt xmltree prints boolean attributes as (type 0x12)0xffffffff (true)
    // or (type 0x12)0x0 (false), never as literal "true".
    const testOnlyTrue = /android:testOnly\(0x[0-9a-f]+\)=\(type 0x12\)0xffffffff/.test(xmlTree);
    const debuggableTrue = /android:debuggable\(0x[0-9a-f]+\)=\(type 0x12\)0xffffffff/.test(xmlTree);
    if (testOnlyTrue) {
      throw new Error('APK declares android:testOnly=true. Release builds must never be test-only.');
    }
    if (debuggableTrue) {
      throw new Error('APK declares android:debuggable=true. Release builds must never be debuggable.');
    }
  } catch (err: any) {
    if (err.message.includes('test-only') || err.message.includes('debuggable')) throw err;
    throw new Error(`Failed to inspect manifest XML tree: ${err.message}`);
  }

  // Sensitive permission denylist: WebView wrappers must stay minimal
  const forbiddenFound = declaredPermissions.filter((p) => FORBIDDEN_PERMISSIONS.includes(p));
  if (forbiddenFound.length > 0) {
    throw new Error(
      `APK requests forbidden sensitive permissions: ${forbiddenFound.join(', ')}. ` +
        'Plain WebView wrappers must not request them.'
    );
  }

  // Embedded secrets / development artifacts scan across the whole binary
  const asBinary = buffer.toString('latin1');
  for (const pattern of FORBIDDEN_BINARY_PATTERNS) {
    if (asBinary.includes(pattern)) {
      throw new Error(`APK binary contains forbidden credential/development pattern: "${pattern}".`);
    }
  }

  // 5. Verify cryptographic signatures using apksigner
  let v1 = false;
  let v2 = false;
  let v3 = false;

  try {
    const { stdout: verifyOutput } = await execPromise(`apksigner verify --verbose "${apkFilePath}"`);
    if (!verifyOutput.includes('Verifies') && !verifyOutput.includes('Verification successful')) {
      throw new Error(`Cryptographic signature verification failed: ${verifyOutput}`);
    }
    v1 = verifyOutput.includes('Verified using v1 scheme (JAR signing): true');
    v2 = verifyOutput.includes('Verified using v2 scheme (APK Signature Scheme v2): true');
    v3 = verifyOutput.includes('Verified using v3 scheme (APK Signature Scheme v3): true');
  } catch (err: any) {
    throw new Error(`apksigner verification rejected this APK: ${err.message}`);
  }

  // 6. Calculate real cryptographic SHA-256 and byte length from exact binary buffer
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const fileSizeBytes = buffer.length;
  const fileSizeFormatted =
    fileSizeBytes >= 1024 * 1024
      ? `${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(fileSizeBytes / 1024).toFixed(1)} KB`;

  return {
    valid: true,
    fileSizeBytes,
    fileSizeFormatted,
    sha256,
    packageId,
    versionName,
    versionCode,
    applicationLabel,
    signatures: { v1, v2, v3 },
    checks: {
      fileExists: true,
      validZipHeader: true,
      manifestPresent,
      dexPresent,
      resourcesPresent,
      metaInfPresent,
      signaturesValid: true,
      packageIdMatch,
      versionMatch,
    },
  };
}

/**
 * Automated smoke test for testing an APK download endpoint or URL.
 * Strictly verifies HTTP 200, APK MIME type, absence of HTML/cookie check,
 * and complete APK binary structure.
 */
export async function smokeTestApk(
  targetUrl: string,
  expected: {
    packageId: string;
    versionName: string;
    expectedFileName?: string;
  }
): Promise<{
  pass: boolean;
  httpStatus: number;
  contentType: string;
  url: string;
  validation: ApkValidationResult;
}> {
  const tmpPath = path.join('/tmp', `smoke_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.apk`);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AppMintly-ApkSmokeTester/1.0',
        Accept: 'application/vnd.android.package-archive, application/octet-stream',
      },
    });

    if (res.status !== 200) {
      throw new Error(`Smoke test failed: Expected HTTP 200, received ${res.status} (${res.statusText})`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/plain')) {
      throw new Error(
        `Smoke test failed: Invalid content-type "${contentType}". Response is HTML/text, not an Android APK package!`
      );
    }

    const disposition = res.headers.get('content-disposition') || '';
    if (expected.expectedFileName && !disposition.includes(expected.expectedFileName) && !targetUrl.includes(expected.expectedFileName)) {
      console.warn(`Smoke test note: filename "${expected.expectedFileName}" not directly in Content-Disposition header`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save temporarily to disk for aapt & apksigner validation
    await fs.promises.writeFile(tmpPath, buffer);

    const validation = await validateApkBinary(tmpPath, {
      packageId: expected.packageId,
      versionName: expected.versionName,
    });

    return {
      pass: true,
      httpStatus: res.status,
      contentType,
      url: targetUrl,
      validation,
    };
  } finally {
    try {
      if (fs.existsSync(tmpPath)) {
        await fs.promises.unlink(tmpPath);
      }
    } catch (ignored) {}
  }
}
