import { NextRequest, NextResponse } from 'next/server';
import { runApkBuild, getBuildJob, checkApkEligibility, validatePackageId, generatePackageId } from '@/lib/apk-builder';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      appId,
      slug,
      name,
      shortName,
      version = '1.0.0',
      launchUrl,
      iconUrl,
      themeColor = '#17191C',
      backgroundColor = '#FFFDF8',
      buildMode = 'webview',
      packageId,
      authorized = false,
    } = body;

    if (!authorized) {
      return NextResponse.json(
        {
          success: false,
          error: 'Distribution Authorization is required. You must check "I own/control this application or have permission to distribute it."',
        },
        { status: 400 }
      );
    }

    if (!launchUrl || !launchUrl.startsWith('https://')) {
      return NextResponse.json(
        { success: false, error: 'A secure HTTPS launch URL is required to build an Android APK.' },
        { status: 400 }
      );
    }

    if (!name || !slug) {
      return NextResponse.json(
        { success: false, error: 'App name and slug are required.' },
        { status: 400 }
      );
    }

    const resolvedPkg = packageId || generatePackageId(slug);
    const pkgValidation = validatePackageId(resolvedPkg);
    if (!pkgValidation.valid) {
      return NextResponse.json(
        { success: false, error: pkgValidation.error || 'Invalid package ID syntax.' },
        { status: 400 }
      );
    }

    const job = await runApkBuild({
      appId: appId || slug,
      slug,
      name,
      shortName,
      version,
      launchUrl,
      iconUrl,
      themeColor,
      backgroundColor,
      buildMode,
      packageId: resolvedPkg,
      authorized: true,
    });

    return NextResponse.json({
      success: true,
      buildId: job.buildId,
      status: job.status,
      job,
    });
  } catch (err: any) {
    console.error('API /api/build-apk error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to start APK build.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const buildId = searchParams.get('buildId');

  if (!buildId) {
    return NextResponse.json(
      { success: false, error: 'Missing buildId parameter' },
      { status: 400 }
    );
  }

  const job = getBuildJob(buildId);
  if (!job) {
    return NextResponse.json(
      { success: false, error: 'Build job not found or expired' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    job,
  });
}
