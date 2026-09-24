/**
 * Updates marketplace catalog metadata (data/apps.json) after a production
 * release APK has been published AND verified as publicly downloadable.
 *
 * Called only from .github/workflows/release-android-apk.yml after the
 * anonymous byte-for-byte download verification step has passed.
 *
 * Never invents values: URL, SHA-256 and size must be provided by the
 * release workflow from the actual published binary.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
function get(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) {
    throw new Error(`Missing required argument --${name}`);
  }
  return args[i + 1];
}

const packageId = get('package-id');
const fileName = get('file-name');
const apkUrl = get('url');
const sha256 = get('sha256');
const size = parseInt(get('size'), 10);
const versionName = get('version');
const versionCode = parseInt(get('version-code'), 10);
const releaseTag = get('tag');

if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(packageId)) throw new Error(`Invalid package id: ${packageId}`);
if (!/^[\w][\w.-]*\.apk$/.test(fileName)) throw new Error(`Invalid APK file name: ${fileName}`);
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[\w.-]+\/[\w.-]+\.apk$/.test(apkUrl)) {
  throw new Error(`Refusing metadata update: apkUrl is not a GitHub release asset URL: ${apkUrl}`);
}
if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`Invalid SHA-256: ${sha256}`);
if (!Number.isFinite(size) || size < 45000) throw new Error(`Invalid APK size: ${size}`);
if (!/^\d+\.\d+\.\d+$/.test(versionName)) throw new Error(`Invalid version name: ${versionName}`);
if (!Number.isFinite(versionCode) || versionCode < 1) throw new Error(`Invalid version code: ${versionCode}`);

const CATALOG_PATH = 'data/apps.json';
const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
const apps = JSON.parse(raw);
const app = apps.find((a) => a.apk && a.apk.packageId === packageId);
if (!app) throw new Error(`No catalog app found with packageId ${packageId}. Refusing to create a duplicate record.`);

const today = new Date().toISOString().slice(0, 10);
const apk = app.apk;

apk.enabled = true;
apk.buildMode = apk.buildMode || 'webview';
// The catalog must always reflect the ACTUAL binary's versionName AND
// versionCode. A stale versionCode from an earlier release is a truth
// violation. Android updates also require a strictly greater code whenever
// the version name changes.
if (apk.versionCode) {
  if (versionCode < apk.versionCode) {
    throw new Error(`Refusing downgrade: versionCode ${versionCode} < released ${apk.versionCode}`);
  }
  if (versionCode === apk.versionCode && versionName !== apk.versionName) {
    throw new Error(`Refusing same-code rename: versionCode ${versionCode} already released with a different version name`);
  }
}
apk.versionName = versionName;
apk.versionCode = versionCode;
apk.fileName = fileName;
apk.apkUrl = apkUrl;
apk.fileSizeBytes = size;
apk.sha256 = sha256;
apk.releaseTag = releaseTag;
apk.releaseDate = today;
apk.generatedAt = new Date().toISOString();
apk.buildStatus = 'released';
apk.platform = 'android';
apk.architecture = 'universal';
apk.downloadAvailable = true;
apk.verified = true;
apk.authorized = true;

// Keep the top-level download pointer consistent with the apk block.
app.apkUrl = apkUrl;
if (app.version !== versionName) app.version = versionName;
app.lastUpdated = today;

const originalHadTrailingNewline = raw.endsWith('\n');
const updated = JSON.stringify(apps, null, 2) + (originalHadTrailingNewline ? '\n' : '');
fs.writeFileSync(CATALOG_PATH, updated);
console.log(`Updated catalog metadata for ${app.name} (${packageId}) -> ${apkUrl}`);
console.log(`SHA-256: ${sha256} | Size: ${size} bytes | Tag: ${releaseTag} | verified: true`);
