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
    console.error('[API /publish] Error reading apps.json:', err);
  }
  return [];
}

function writeAppsToFile(apps: AppItem[]): boolean {
  try {
    fs.writeFileSync(APPS_FILE_PATH, JSON.stringify(apps, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[API /publish] Error writing apps.json:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawApp = await req.json();

    if (!rawApp || typeof rawApp !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid app payload' },
        { status: 400 }
      );
    }

    const name = (rawApp.name || '').trim();
    const slug = (rawApp.slug || rawApp.id || '').trim();
    const launchUrl = (rawApp.launchUrl || rawApp.url || rawApp.webUrl || rawApp.pwaUrl || rawApp.apkUrl || '').trim();
    const category = (rawApp.category || '').trim();

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'App name is required' },
        { status: 400 }
      );
    }
    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'App slug or ID is required' },
        { status: 400 }
      );
    }
    if (!launchUrl) {
      return NextResponse.json(
        { success: false, error: 'App launch URL is required' },
        { status: 400 }
      );
    }
    if (!category) {
      return NextResponse.json(
        { success: false, error: 'App category is required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const appToSave: AppItem = normalizeApp({
      ...rawApp,
      id: rawApp.id || slug,
      slug: slug,
      name: name,
      category: category,
      launchUrl: launchUrl,
      url: launchUrl,
      status: rawApp.status ? rawApp.status : 'published',
      published: rawApp.status === 'draft' || rawApp.status === 'archived' ? false : true,
      lastUpdated: today,
      updatedAt: now.toISOString(),
      releaseDate: rawApp.releaseDate || today,
      publishedAt: rawApp.publishedAt || now.toISOString(),
      featured: Boolean(rawApp.featured),
      original: Boolean(rawApp.original),
      isDemo: false, // User published apps are never marked as demo
    });

    const apps = readAppsFromFile();
    const existingIndex = apps.findIndex(
      (a) => a.id.toLowerCase() === appToSave.id.toLowerCase() || a.slug.toLowerCase() === appToSave.slug.toLowerCase()
    );

    if (existingIndex >= 0) {
      apps[existingIndex] = appToSave;
    } else {
      // Prepend newly published apps so they appear first in newest listings
      apps.unshift(appToSave);
    }

    const success = writeAppsToFile(apps);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to write updated apps to storage' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      app: appToSave,
      message: 'Published successfully. Your app is now available across the AppMintly marketplace.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while publishing app' },
      { status: 500 }
    );
  }
}
