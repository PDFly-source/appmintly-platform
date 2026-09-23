import { NextRequest, NextResponse } from 'next/server';
import { getBuildJob } from '@/lib/apk-builder';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildId: string }> }
) {
  const { buildId } = await params;

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
