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
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({
      buildId: process.env.BUILD_ID || job.buildId,
      signingMode: required('SIGNING_MODE'),
      fileName: state.fileName, sha256: state.sha256,
      fileSizeBytes: state.fileSizeBytes, validation: state.validationResult,
    }, null, 2));
    console.log(`Validated ${state.fileName}: ${state.fileSizeBytes} bytes SHA-256 ${state.sha256}`);
    return;
  }
  throw new Error('APK build timed out after 10 minutes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
