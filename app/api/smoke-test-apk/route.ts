import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { smokeTestApk, validateApkBinary } from '@/lib/apk-validator';
import APPS from '@/data/apps.json';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get('slug') || searchParams.get('app') || 'pdfminifly').toLowerCase().trim();

  // Find app in catalog
  const app = APPS.find((a: any) => a.slug.toLowerCase() === slug || a.id.toLowerCase() === slug);
  if (!app) {
    return NextResponse.json({ error: `App "${slug}" not found in catalog` }, { status: 404 });
  }

  const packageId = app.apk?.packageId || `com.appforge.${slug}`;
  const versionName = app.apk?.versionName || app.version || '1.0.0';
  const expectedFileName = app.apk?.fileName || `${app.name.replace(/[^a-zA-Z0-9]/g, '')}-${versionName}.apk`;

  // First, check local binary validation
  const localCandidates = [
    path.join(process.cwd(), 'public', 'downloads', 'apks', expectedFileName),
    path.join(process.cwd(), 'public', 'downloads', 'apks', `${slug}-v${versionName}.apk`),
    path.join(process.cwd(), 'public', 'downloads', 'apks', `${slug}-${versionName}.apk`),
  ];

  let localValid = false;
  let localResult: any = null;
  let testedLocalPath = '';

  for (const candidate of localCandidates) {
    try {
      localResult = await validateApkBinary(candidate, { packageId, versionName });
      localValid = true;
      testedLocalPath = candidate;
      break;
    } catch (ignored) {}
  }

  // Second, test the download endpoint via HTTP request
  const origin = req.nextUrl.origin;
  const testUrl = `${origin}/api/download-apk/${expectedFileName}`;

  try {
    const smokeResult = await smokeTestApk(testUrl, {
      packageId,
      versionName,
      expectedFileName,
    });

    return NextResponse.json({
      pass: true,
      app: app.name,
      slug,
      testedUrl: testUrl,
      httpStatus: smokeResult.httpStatus,
      contentType: smokeResult.contentType,
      fileName: expectedFileName,
      fileSizeBytes: smokeResult.validation.fileSizeBytes,
      fileSizeFormatted: smokeResult.validation.fileSizeFormatted,
      sha256: smokeResult.validation.sha256,
      packageId: smokeResult.validation.packageId,
      versionName: smokeResult.validation.versionName,
      versionCode: smokeResult.validation.versionCode,
      signatures: smokeResult.validation.signatures,
      checks: smokeResult.validation.checks,
      localValidation: localValid ? { passed: true, path: testedLocalPath } : { passed: false },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        pass: false,
        app: app.name,
        slug,
        error: err.message,
        localValidation: localValid ? { passed: true, result: localResult } : { passed: false },
      },
      { status: 500 }
    );
  }
}
