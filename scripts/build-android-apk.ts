import fs from 'node:fs';
import path from 'node:path';
import { runApkBuild, getBuildJob } from '../lib/apk-builder';

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Required build input missing: ${key}`);
  return value;
};

async function main() {
  const appName = required('APP_NAME');
  const slug = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const version = required('VERSION_NAME');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION_NAME must be numeric x.y.z');
  const job = await runApkBuild({
    appId: slug, slug, name: appName, version,
    launchUrl: required('SOURCE_URL'), packageId: required('PACKAGE_ID'),
    iconUrl: process.env.ICON_URL || undefined,
    themeColor: process.env.THEME_COLOR || undefined,
    backgroundColor: process.env.BACKGROUND_COLOR || undefined,
    buildMode: 'webview', authorized: true,
  });
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const state = getBuildJob(job.buildId)!;
    if (state.status === 'failed') throw new Error(`APK build failed: ${state.error}`);
    if (state.status !== 'completed') continue;
    if (!state.validationResult?.valid || !state.sha256 || !state.fileSizeBytes) {
      throw new Error('Build completed without validated binary metadata');
    }
    const apk = path.resolve('public/downloads/apks', state.fileName!);
    const output = path.resolve('dist/apk');
    fs.mkdirSync(output, { recursive: true });
    fs.copyFileSync(apk, path.join(output, state.fileName!));
    const v = state.validationResult;
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({
      buildId: process.env.BUILD_ID || job.buildId,
      signingMode: required('SIGNING_MODE'),
      fileName: state.fileName, sha256: state.sha256,
      fileSizeBytes: state.fileSizeBytes, validation: v,
      // Phase 11.6 Part P: authoritative security evidence stored with the release.
      packageName: v.packageId,
      minSdk: v.minSdkVersion,
      targetSdk: v.targetSdkVersion,
      permissions: v.permissions,
      certificateSubject: v.certificateSubject,
      certificateSha256Fingerprint: v.certificateSha256Fingerprint,
      signatureSchemes: { v1: v.signatures.v1, v2: v.signatures.v2, v3: v.signatures.v3 },
      securityCheck: v.securityCheck,
    }, null, 2));

    // Phase 11.6 Part I: the universal release validator report.
    const gate = v.securityCheck;
    console.log('');
    console.log('APK SECURITY STATUS');
    console.log('===================');
    console.log(`Target SDK:        ${gate.targetSdk}  (${v.targetSdkVersion})`);
    console.log(`Min SDK:           ${gate.minSdk}  (${v.minSdkVersion})`);
    console.log(`Debuggable:        ${gate.debuggable}`);
    console.log(`TestOnly:          ${gate.testOnly}`);
    console.log(`Signing:           ${gate.signing}  (v1=${v.signatures.v1} v2=${v.signatures.v2} v3=${v.signatures.v3})`);
    console.log(`Certificate:       ${gate.certificate}  (CN=${v.certificateSubject})`);
    console.log(`Signature:         ${gate.signature}`);
    console.log(`Permissions:       ${gate.permissions}  (${v.permissions.join(', ') || 'none'})`);
    console.log(`Embedded secrets:  ${gate.embeddedSecrets}`);
    console.log(`Development URLs:  ${gate.developmentUrls}`);
    console.log(`APK structure:    ${gate.apkStructure}`);
    console.log(`Package:           ${gate.packageName}  (${v.packageId})`);
    console.log(`Version:           ${gate.version}  (${v.versionName} / ${v.versionCode})`);
    console.log(`SHA-256:           ${gate.sha256}`);
    console.log('');
    console.log(`Final release eligibility: ${gate.eligible ? 'PASS' : 'FAIL'} (validator ${gate.validatorVersion})`);
    if (!gate.eligible) throw new Error('APK security gate FAILED — build is not eligible for release');
    console.log(`Validated ${state.fileName}: ${state.fileSizeBytes} bytes SHA-256 ${state.sha256}`);
    return;
  }
  throw new Error('APK build timed out after 10 minutes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
