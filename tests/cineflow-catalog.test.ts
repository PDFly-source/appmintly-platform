/**
 * CineFlow catalog classification regression test.
 *
 * CineFlow is distributed primarily as a verified, signed Android APK
 * (release cineflow-v0.1.0), so its canonical record uses the
 * marketplace's established "Android APK" type — the same convention as
 * NexDrop. This locks the classification against accidental reverts to
 * "Web App", which previously surfaced as the primary product type on
 * the detail page ("Web App + Android APK") and misfiled the app under
 * web-first listings, notifications and filters.
 *
 * Scope guard (owner instruction, 2026-10-27): the change is metadata
 * only — the web version, URLs, APK artifact and release evidence are
 * intentionally retained exactly as they are.
 */
import { describe, it, expect } from 'vitest';
import catalog from '../data/apps.json';

const cineflow = (catalog as any[]).find((a) => a.id === 'cineflow');

describe('CineFlow Android APK classification', () => {
  it('is classified as an Android APK (primary product), not a Web App', () => {
    expect(cineflow.type).toBe('Android APK');
  });

  it('is flagged as an Android release by the notification engine', async () => {
    const { isAndroidRelease } = await import('../lib/notifications/engine');
    expect(isAndroidRelease(cineflow)).toBe(true);
  });

  it('has an authoritative verified APK release record', () => {
    expect(cineflow.apk.enabled).toBe(true);
    expect(cineflow.apk.buildStatus).toBe('released');
    expect(cineflow.apk.verified).toBe(true);
    expect(cineflow.apk.securityCheckStatus).toBe('passed');
    expect(cineflow.apk.packageId).toBe('com.appforge.cineflow');
    expect(cineflow.apk.versionName).toBe('0.1.0');
    expect(cineflow.apk.versionCode).toBe(100);
  });

  it('retains the working web version alongside the APK', () => {
    expect(cineflow.url).toBe('https://pdfly-source.github.io/cineflow/');
    expect(cineflow.launchUrl).toBe('https://pdfly-source.github.io/cineflow/');
    expect(cineflow.apkUrl).toContain('releases/download/cineflow-v0.1.0/');
  });

  it('does not alter the classification of other apps', () => {
    const byId = (id: string) => (catalog as any[]).find((a) => a.id === id);
    expect(byId('nexdrop').type).toBe('Android APK');
    expect(byId('billcraft').type).toBe('Web App');
    expect(byId('niramay').type).toBe('Web App');
    expect(byId('studyria').type).toBe('Web App');
  });
});
