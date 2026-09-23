import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// MIME type explicitly required for Android Package Archive binary
const APK_MIME_TYPE = 'application/vnd.android.package-archive';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename: rawFilename } = await params;
  const filename = decodeURIComponent(rawFilename || '').trim();

  // Basic security and extension validation
  if (!filename || filename.includes('..') || filename.includes('/') || !filename.toLowerCase().endsWith('.apk')) {
    return NextResponse.json(
      { error: 'Invalid APK filename requested. Must end with .apk and contain no path separators.' },
      { status: 400 }
    );
  }

  const apksDir = path.join(process.cwd(), 'public', 'downloads', 'apks');

  // Check multiple candidate filenames (case-insensitive & slug aliases)
  const candidateNames = [
    filename,
    filename.toLowerCase(),
    filename.replace(/-/g, '_'),
    filename.replace(/_/g, '-'),
    filename.toLowerCase().replace(/v(\d)/, '$1'),
    filename.toLowerCase().replace(/(\d)/, 'v$1'),
  ];

  let resolvedPath: string | null = null;
  let resolvedFilename = filename;

  for (const cand of candidateNames) {
    const testPath = path.join(apksDir, cand);
    if (fs.existsSync(testPath)) {
      resolvedPath = testPath;
      resolvedFilename = cand;
      break;
    }
  }

  // Also check if remote URL was provided in query param ?remote=
  const remoteUrl = req.nextUrl.searchParams.get('remote');

  let buffer: Buffer | null = null;

  if (resolvedPath) {
    buffer = await fs.promises.readFile(resolvedPath);
  } else if (remoteUrl && remoteUrl.startsWith('https://')) {
    try {
      const remoteRes = await fetch(remoteUrl, {
        headers: { 'User-Agent': 'APPFORGE-ApkProxy/1.0' },
      });
      if (remoteRes.ok) {
        const arrayBuf = await remoteRes.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      }
    } catch (e) {
      console.error('[DownloadApk] Remote fetch failed:', e);
    }
  }

  if (!buffer || buffer.length === 0) {
    return NextResponse.json(
      {
        error: 'Requested APK binary not found on build server',
        requestedFilename: filename,
      },
      { status: 404 }
    );
  }

  // Strict binary integrity check:
  // Android APKs are ZIP archives. Magic bytes MUST be 0x50, 0x4B, 0x03, 0x04.
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);

  if (!isZip) {
    // Content is NOT a valid APK/ZIP. Prevent returning HTML / text.
    return NextResponse.json(
      {
        error: 'APK validation failed: Stored file does not contain a valid APK/ZIP binary structure',
      },
      { status: 500 }
    );
  }

  // Calculate real SHA-256 from exact binary bytes
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Use the canonical filename for the attachment header
  const attachmentFilename = filename.endsWith('.apk') ? filename : `${filename}.apk`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': APK_MIME_TYPE,
      'Content-Disposition': `attachment; filename="${attachmentFilename}"`,
      'Content-Length': buffer.length.toString(),
      'X-Content-Type-Options': 'nosniff',
      'X-Checksum-Sha256': sha256,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const getRes = await GET(req, { params });
  if (getRes.status !== 200) {
    return getRes;
  }
  return new NextResponse(null, {
    status: 200,
    headers: getRes.headers,
  });
}
