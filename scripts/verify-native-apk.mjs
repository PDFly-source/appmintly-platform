#!/usr/bin/env node
/**
 * Native APK security gate - the native kernel's equivalent of the WebView
 * security scan. Fail-closed: a missing toolchain is a failure, not a pass.
 *
 * Checks: package identity, version identity, SDK policy, debuggable flag,
 * exported components, dangerous permissions, cleartext traffic, DEX integrity,
 * signing scheme + certificate fingerprint, and the artifact SHA-256.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const ARG = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const APK = ARG('--apk');
const problems = [];
const checks = [];
const record = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) problems.push(`${name}: ${detail}`); };

function tool(name) {
  for (const root of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean)) {
    try {
      const out = execFileSync('bash', ['-lc', `ls ${root}/build-tools/*/${name} 2>/dev/null | tail -1`], { encoding: 'utf8' }).trim();
      if (out) return out;
    } catch { /* fall through */ }
  }
  try { return execFileSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (!APK || !existsSync(APK)) { console.error(`FAIL apk not found: ${APK}`); process.exit(1); }

const aapt2 = tool('aapt2');
const apksigner = tool('apksigner');
const unzip = tool('unzip');

if (!aapt2 || !apksigner || !unzip) {
  record('toolchain', false, `missing ${[!aapt2 && 'aapt2', !apksigner && 'apksigner', !unzip && 'unzip'].filter(Boolean).join(', ')} - refusing to pass an unverified native APK`);
  console.log(JSON.stringify({ ok: false, checks, problems }, null, 2));
  process.exit(1);
}

// 1-2. identity
const badging = run(aapt2, ['dump', 'badging', APK]);
const pkgLine = badging.split('\n')[0] || '';
const gotPackage = (pkgLine.match(/package: name='([^']+)'/) || [])[1];
const gotCode = (pkgLine.match(/versionCode='([^']+)'/) || [])[1];
const gotName = (pkgLine.match(/versionName='([^']+)'/) || [])[1];
const wantPackage = ARG('--package');
const wantCode = ARG('--version-code');
const wantName = ARG('--version-name');
record('package-identity', !!wantPackage && gotPackage === wantPackage, `apk=${gotPackage} expected=${wantPackage}`);
record('version-identity', gotCode === String(wantCode) && (!wantName || gotName === wantName), `apk=${gotCode}/${gotName} expected=${wantCode}/${wantName}`);

// 3. SDK policy
const minSdk = Number((badging.match(/sdkVersion:'(\d+)'/) || [])[1] || 0);
const targetSdk = Number((badging.match(/targetSdkVersion:'(\d+)'/) || [])[1] || 0);
const wantMin = Number(ARG('--min-sdk') || 0);
const wantTarget = Number(ARG('--target-sdk') || 0);
record('sdk-compliance', (!wantMin || minSdk >= wantMin) && (!wantTarget || targetSdk >= wantTarget), `min=${minSdk} target=${targetSdk} policy>=${wantMin}/${wantTarget}`);

// 4-7. manifest posture
const tree = run(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', APK]);
const debugFlag = /debuggable\(.*\)=\(type 0x12\)0xffffffff|android:debuggable\(.*\)=\(type 0x12\)0x1/i.test(tree) || /debuggable[^\n]*=\(type 0x12\)0x1/.test(tree);
record('not-debuggable', !debugFlag, debugFlag ? 'manifest sets android:debuggable=true' : 'debuggable not set');

const exported = [...tree.matchAll(/E: activity[\s\S]{0,600}?android:exported\(0x01010010\)=\(type 0x12\)0xffffffff[\s\S]{0,400}?android:name\("([^"]+)"\)/g)].map((m) => m[1]);
const allowedExported = list(ARG('--allow-exported'));
const rogueExports = exported.filter((n) => !allowedExported.includes(n));
record('exported-components', rogueExports.length === 0, rogueExports.length ? `undeclared exported components: ${rogueExports.join(', ')}` : `exported=${exported.join(',') || 'none'}`);

const DANGEROUS = new Set(['android.permission.CAMERA','android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION','android.permission.RECORD_AUDIO','android.permission.REQUEST_INSTALL_PACKAGES','android.permission.POST_NOTIFICATIONS','android.permission.CHANGE_WIFI_MULTICAST_STATE','android.permission.FOREGROUND_SERVICE_DATA_SYNC','android.permission.READ_CONTACTS','android.permission.SEND_SMS','android.permission.MANAGE_EXTERNAL_STORAGE','android.permission.QUERY_ALL_PACKAGES','android.permission.NEARBY_WIFI_DEVICES']);
const declared = [...new Set([...tree.matchAll(/(android\.permission\.[A-Z_0-9]+)/g)].map((m) => m[1]))];
const allowedPerms = list(ARG('--allow-permissions'));
const roguePerms = declared.filter((p) => DANGEROUS.has(p) && !allowedPerms.includes(p));
record('dangerous-permissions', roguePerms.length === 0, roguePerms.length ? `not allowed by profile: ${roguePerms.join(', ')}` : `declared dangerous: ${declared.filter((p) => DANGEROUS.has(p)).join(',') || 'none'}`);

const cleartext = /usesCleartextTraffic[^\n]*=\(type 0x12\)0xffffffff/.test(tree);
record('cleartext-traffic', !cleartext || ARG('--cleartext-allowed') === 'true', cleartext ? 'usesCleartextTraffic=true' : 'cleartext not enabled');

// 8. DEX integrity
const listing = run(unzip, ['-l', APK]);
const dexFiles = (listing.match(/classes\d*\.dex/g) || []).length;
record('dex-integrity', dexFiles > 0, `${dexFiles} dex file(s)`);
const markers = list(ARG('--require-dex-strings'));
if (markers.length) {
  const dex = run(unzip, ['-p', APK, 'classes.dex']);
  const missing = markers.filter((m) => !dex.includes(m));
  record('native-code-markers', missing.length === 0, missing.length ? `missing native markers: ${missing.join(', ')}` : `present: ${markers.join(', ')}`);
}

// 9. signature
const certs = run(apksigner, ['verify', '--print-certs', APK]);
const digest = (certs.match(/SHA-256 digest: ([0-9a-f]+)/i) || [])[1] || '';
const schemes = [certs.includes('v1 scheme') && 'v1', certs.includes('v2 scheme') && 'v2', certs.includes('v3 scheme') && 'v3'].filter(Boolean);
record('signature-schemes', schemes.includes('v2') || schemes.includes('v3'), `schemes=${schemes.join('+') || 'none'}`);
const wantFingerprint = (ARG('--expected-fingerprint') || '').replace(/:/g, '').toLowerCase();
if (wantFingerprint) record('signature-fingerprint', digest.replace(/:/g, '').toLowerCase() === wantFingerprint, `apk=${digest} expected=${wantFingerprint}`);

// 10. sha256
const sha256 = createHash('sha256').update(readFileSync(APK)).digest('hex');
record('sha256', true, sha256);

const ok = problems.length === 0;
console.log(JSON.stringify({ ok, apk: APK, sha256, signature: { schemes, certificateSha256: digest }, checks, problems }, null, 2));
process.exit(ok ? 0 : 1);
