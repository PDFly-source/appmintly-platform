import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AppItem, normalizeApp } from '@/data/apps';

const APPS_FILE_PATH = path.join(process.cwd(), 'data', 'apps.json');

function readAppsFromFile(): AppItem[] {
  try {
    if (fs.existsSync(APPS_FILE_PATH)) {
      const fileData = fs.readFileSync(APPS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(fileData);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeApp);
      }
    }
  } catch (err) {
    console.error('[API /catalog] Error reading apps.json:', err);
  }
  return [];
}

function writeAppsToFile(apps: AppItem[]): boolean {
  try {
    fs.writeFileSync(APPS_FILE_PATH, JSON.stringify(apps, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[API /catalog] Error writing apps.json:', err);
    return false;
  }
}

export async function GET() {
  const apps = readAppsFromFile();
  return NextResponse.json({
    success: true,
    total: apps.length,
    apps,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newApps = body?.apps;

    if (!Array.isArray(newApps)) {
      return NextResponse.json(
        { success: false, error: 'Expected { apps: AppItem[] } in request body' },
        { status: 400 }
      );
    }

    const normalized = newApps.map(normalizeApp);
    const ok = writeAppsToFile(normalized);

    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to write apps.json to disk' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: normalized.length,
      message: 'Catalog updated and persisted successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error updating catalog' },
      { status: 500 }
    );
  }
}
