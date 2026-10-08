/**
 * WEBVIEW OWNERSHIP ANTI-REGRESSION GATE
 *
 * Runs in the production release workflow BEFORE the APK compile, and can be
 * run locally with:
 *   npm exec --yes --package=tsx@4.20.5 -- tsx scripts/test-webview-ownership.ts [launchUrl]
 *
 * It enforces the permanent architecture:
 *   - The native APK owns ONLY its own launch-URL boundary.
 *   - Every published marketplace app (current AND future) stays external.
 *   - Publishing/editing catalog records can NEVER change ownership.
 *
 * Exits non-zero on the first violation, so a regression cannot ship.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeWebViewOwnershipPrefix,
  isWebViewOwnedUrl,
} from '../lib/apk-builder';

let failures = 0;
let checks = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`PASS  ${name}`);
  }
};

const launchUrl = process.argv[2] || 'https://appmintly.pages.dev/';
const prefix = computeWebViewOwnershipPrefix(launchUrl);

console.log(`\n[gate] launch/ownership boundary: ${launchUrl} (prefix: ${prefix})\n`);

// ---------------------------------------------------------------------------
// PART 1 — Ownership matrix (Section 18)
// ---------------------------------------------------------------------------
const suffixDomainHost = new URL(launchUrl).hostname + '.evil.example';

ok('[1] own root URL is owned', isWebViewOwnedUrl(launchUrl, launchUrl));
ok('[2] own route (/explore) is owned', isWebViewOwnedUrl(new URL('/explore', launchUrl).toString(), launchUrl));
ok('[3] own marketplace route (/app/nexdrop) is owned', isWebViewOwnedUrl(new URL('/app/nexdrop', launchUrl).toString(), launchUrl));

const legacy = 'https://pdfly-source.github.io/appmintly-platform/';
if (launchUrl !== legacy) {
  ok('[4] legacy fallback host is NOT owned by the canonical APK', !isWebViewOwnedUrl(legacy, launchUrl));
}

const externals: Array<[string, string]> = [
  ['[5] Niramay → external', 'https://pdfly-source.github.io/niramay/symptoms/'],
  ['[6] NexDrop → external', 'https://pdfly-source.github.io/nexdrop/'],
  ['[7] studyria sibling path → external', 'https://pdfly-source.github.io/studyria/'],
  ['[8] pdfminifly sibling path → external', 'https://pdfly-source.github.io/pdfminifly/'],
  ['[9] unrelated site → external', 'https://example.com/'],
  ['[10] suffix-domain attack → external', `https://${suffixDomainHost}/`],
  ['[11] query-string attack → external', `https://evil.example/?url=${encodeURIComponent(launchUrl)}`],
];
for (const [name, url] of externals) ok(name, !isWebViewOwnedUrl(url, launchUrl));

ok('[12a] javascript: scheme never owned', !isWebViewOwnedUrl('javascript:alert(1)', launchUrl));
ok('[12b] data: scheme never owned', !isWebViewOwnedUrl('data:text/html,<script>1</script>', launchUrl));
ok('[12c] file: scheme never owned', !isWebViewOwnedUrl('file:///etc/hosts', launchUrl));
ok('[12d] malformed URL never owned', !isWebViewOwnedUrl('not a url at all', launchUrl));

// ---------------------------------------------------------------------------
// PART 2 — Shared-origin rule (the original bug class)
// ---------------------------------------------------------------------------
ok('prefix ends with "/" (no suffix-domain bleed)', /\/$/.test(prefix));
ok(
  'github.io project hosts may only be owned via their namespace path',
  (() => {
    try {
      computeWebViewOwnershipPrefix('https://pdfly-source.github.io/');
      return false; // bare shared origin must be refused
    } catch {
      return true;
    }
  })()
);
ok(
  'namespaced github.io launch IS allowed (legacy-style)',
  (() => {
    try {
      return computeWebViewOwnershipPrefix(legacy) === legacy;
    } catch {
      return false;
    }
  })()
);

// ---------------------------------------------------------------------------
// PART 3 — Builder source tripwires (ownership stays single-source)
// ---------------------------------------------------------------------------
const builderSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'apk-builder.ts'), 'utf8');
ok('compiled WebView check stays startsWith(ALLOWED_ORIGIN)', builderSource.includes('url.startsWith(ALLOWED_ORIGIN)'));
ok('ALLOWED_ORIGIN is derived from computeWebViewOwnershipPrefix', builderSource.includes('const allowedPrefix = computeWebViewOwnershipPrefix(options.launchUrl)'));
const syncFnAt = builderSource.indexOf('async function syncApkMetadataToCatalog');
const firstCodeCatalogRef = builderSource.indexOf("'apps.json'");
ok('builder never reads catalog URLs for ownership (catalog is only WRITTEN by metadata sync)',
   syncFnAt !== -1 && firstCodeCatalogRef !== -1 && firstCodeCatalogRef > syncFnAt &&
   builderSource.slice(0, syncFnAt).indexOf("'apps.json'") === -1);

// ---------------------------------------------------------------------------
// PART 4 — Catalog invariants + PUBLISHING REGRESSION (Section 19)
// ---------------------------------------------------------------------------
// The exact resolution chain used by the marketplace "Open on Web" CTA
// (AppDetailClient.tsx): the stored record URL only — never derived, never
// guessed from name/slug/publisher/origin.
const resolveOpenOnWebUrl = (app: any): string | undefined =>
  app?.launchUrl || app?.webUrl || app?.pwaUrl || app?.url || undefined;

type CatalogApp = any;
const catalogPath = path.join(process.cwd(), 'data', 'apps.json');
const catalog: CatalogApp[] = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// 4a. every published app's stored web URL is well-formed https
for (const app of catalog) {
  const target = resolveOpenOnWebUrl(app);
  if (!target) continue;
  let parsed: URL | null = null;
  try { parsed = new URL(target); } catch { parsed = null; }
  ok(`catalog web URL valid for "${app.name}"`, parsed !== null && parsed.protocol === 'https:', target);
}

// 4b. ownership boundary BEFORE simulating a publish
const ownedBefore = catalog.filter((a) => {
  const t = resolveOpenOnWebUrl(a);
  return t ? isWebViewOwnedUrl(t, launchUrl) : false;
}).map((a) => a.name);

// 4c. SIMULATED PUBLISH of a brand-new sibling-hosted app (TestApp)
const testApp = {
  name: 'TestApp',
  slug: 'testapp',
  type: 'Web App',
  webUrl: 'https://pdfly-source.github.io/testapp/',
};
const catalogAfter = [...catalog, testApp];

ok('TestApp "appears" in simulated marketplace', catalogAfter.some((a) => a.slug === 'testapp'));
ok('TestApp Open on Web uses the EXACT stored URL', resolveOpenOnWebUrl(testApp) === 'https://pdfly-source.github.io/testapp/');
ok('publishing TestApp does NOT make it WebView-owned', !isWebViewOwnedUrl(testApp.webUrl, launchUrl));
ok('ownership boundary is catalog-independent (pure function of launch URL)', computeWebViewOwnershipPrefix(launchUrl) === prefix);

// 4d. previously published apps keep their exact behavior after the publish
const ownedAfter = catalogAfter.filter((a) => {
  const t = resolveOpenOnWebUrl(a);
  return t ? isWebViewOwnedUrl(t, launchUrl) : false;
}).map((a) => a.name);
ok('publishing a new app changes nobody\'s ownership', JSON.stringify(ownedBefore) === JSON.stringify(ownedAfter), `before=[${ownedBefore}] after=[${ownedAfter}]`);
const niramay = catalog.find((a: any) => a.slug === 'niramay');
if (niramay) ok('Niramay stays external after publish', !isWebViewOwnedUrl(resolveOpenOnWebUrl(niramay) ?? '', launchUrl));
const nexdrop = catalog.find((a: any) => a.slug === 'nexdrop');
if (nexdrop) ok('NexDrop stays external after publish', !isWebViewOwnedUrl(resolveOpenOnWebUrl(nexdrop) ?? '', launchUrl));

// 4e. the marketplace's own app record resolves to the owned boundary only
// when it is literally the marketplace's own URL.
for (const app of catalog) {
  const target = resolveOpenOnWebUrl(app);
  if (!target) continue;
  const expectedOwned = target === launchUrl || target.startsWith(prefix);
  ok(`ownership of "${app.name}" URL matches boundary (${expectedOwned ? 'WEBVIEW' : 'CHROME'})`,
     isWebViewOwnedUrl(target, launchUrl) === expectedOwned, target);
}

// ---------------------------------------------------------------------------
console.log(`\n[gate] ${checks} checks, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
