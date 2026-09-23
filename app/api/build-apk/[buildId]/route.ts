import { NextResponse } from 'next/server';
import { readAndroidBuild } from '@/lib/github-apk-build';

export async function GET(_req: Request, { params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(buildId)) {
    return NextResponse.json({ success: false, error: 'Invalid build ID' }, { status: 400 });
  }
  try {
    const state = await readAndroidBuild(buildId);
    return NextResponse.json({ success: true, job: { buildId, ...state } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 502 });
  }
}
