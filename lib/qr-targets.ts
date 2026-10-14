/**
 * Phase 1A — QR transfer target builder (pure, testable).
 *
 * Returns the QR target URLs for an app, derived from the CURRENT canonical
 * app record:
 *  - 'detail' (always first): the app's canonical AppMintly page URL —
 *    origin + BASE_PATH + /app/<slug>. Never an expired temporary artifact
 *    URL, never a signed asset link.
 *  - 'web' (optional): the app's own web URL, when the record has one.
 *  - 'apk' (optional): the official release asset URL — ONLY from
 *    authoritative release evidence (lib/distribution.ts). Never fabricated.
 *
 * Kept free of React/JSX so it is directly unit-testable under the node
 * test runner.
 */

import { AppItem } from '@/data/apps';
import { hasAuthoritativeApkRelease } from '@/lib/distribution';
import { BASE_PATH } from '@/lib/api-path';

export interface QrTargetUrl {
  id: 'detail' | 'web' | 'apk';
  label: string;
  url: string;
}

export function canonicalAppUrl(app: AppItem): string {
  return new URL(`${BASE_PATH}/app/${app.slug}`, window.location.origin).toString();
}

export function buildQrTargets(app: AppItem): QrTargetUrl[] {
  const detailUrl = canonicalAppUrl(app);
  const list: QrTargetUrl[] = [
    { id: 'detail', label: 'App page on AppMintly', url: detailUrl },
  ];
  const webUrl = app.launchUrl || app.webUrl || app.pwaUrl || app.url;
  if (webUrl && webUrl !== detailUrl) {
    list.push({
      id: 'web',
      label: 'Open on Web (app itself)',
      url: webUrl,
    });
  }
  // APK target ONLY from authoritative release evidence — never fabricated.
  if (hasAuthoritativeApkRelease(app) && app.apk?.apkUrl) {
    list.push({
      id: 'apk',
      label: 'Download APK (official release)',
      url: app.apk.apkUrl,
    });
  }
  return list;
}
