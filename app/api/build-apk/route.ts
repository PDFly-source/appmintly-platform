import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { validatePackageId, generatePackageId } from '@/lib/apk-builder';
import { requestAndroidBuild } from '@/lib/github-apk-build';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug, version, launchUrl, packageId, iconUrl, themeColor, backgroundColor, buildMode, authorized } = body;
    if (!authorized || !name || !slug || !version || !launchUrl) throw new Error('Authorization, app name, slug, version and HTTPS URL are required.');
    if (buildMode && buildMode !== 'webview') throw new Error('Only the existing Mode B WebView engine is supported by this Actions build.');
    if (typeof name !== 'string' || name.length > 80 || !/^[a-z0-9-]{1,60}$/.test(slug) ||
        !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid app name, slug or numeric version.');
    const url = new URL(launchUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A secure public HTTPS launch URL is required.');
    const pkg = packageId || generatePackageId(slug);
    if (!validatePackageId(pkg).valid) throw new Error('Invalid Android package ID.');
    const buildId = crypto.randomUUID();
    await requestAndroidBuild({
      app_name: name, source_url: url.href, package_id: pkg, version_name: version,
      icon_url: typeof iconUrl === 'string' ? iconUrl : '',
      theme_color: typeof themeColor === 'string' ? themeColor : '',
      background_color: typeof backgroundColor === 'string' ? backgroundColor : '',
      build_id: buildId,
    });
    return NextResponse.json({ success: true, buildId, status: 'queued',
      job: { buildId, status: 'queued', currentStep: 'Waiting for GitHub Actions runner', progress: 5 } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 503 });
  }
}
