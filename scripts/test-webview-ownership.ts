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
  ['[18a] path-trick → external', `https://evil.example/${new URL(launchUrl).hostname}/`],
  ['[18b] sibling pages.dev subdomain → external', 'https://another-app.pages.dev/'],
  ['[18c] other pages.dev subdomain → external', 'https://newapp.pages.dev/'],
  ['[18d] evil pages.dev subdomain → external', 'https://evil.pages.dev/'],
  ['[18e] user-site github.io root → external', 'https://foo.github.io/'],
  ['[18f] other user github.io root → external', 'https://newapp.github.io/'],
  ['[18g] bare shared project host root → external', 'https://pdfly-source.github.io/'],
  ['[18h] vercel tenant → external', 'https://someapp.vercel.app/'],
  ['[18i] netlify tenant → external', 'https://someapp.netlify.app/'],
  ['[18j] firebase tenant → external', 'https://someapp.web.app/'],
  ['[18k] workers.dev tenant → external', 'https://someapp.workers.dev/'],
  ['[18l] arbitrary custom domain → external', 'https://another-cloudflare-domain.pages.dev/'],
  ['[18m] custom domain with path → external', 'https://newapp.example.com/'],
  ['[18n] userinfo credential trick → external (fail-closed)', `https://user@${new URL(launchUrl).host}/`],
  ['[18o] bare origin without trailing slash → external (fail-closed)', new URL(launchUrl).origin],
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
// PART 5 — FUTURE-APP PUBLISHING TEST (Section 9) — in-memory only, no dummy
// data is ever written to the real catalog.
// ---------------------------------------------------------------------------
const futureApps: Array<[string, string]> = [
  ['App A (github.io sibling path)', 'https://pdfly-source.github.io/app-a/'],
  ['App B (other pages.dev subdomain)', 'https://newapp.pages.dev/'],
  ['App C (custom domain with path)', 'https://example.com/app/'],
  ['App D (user-site github.io root)', 'https://foo.github.io/'],
  ['App E (another pages.dev subdomain)', 'https://another.pages.dev/'],
];
for (const [name, webUrl] of futureApps) {
  ok(`publishing ${name} → NOT WebView-owned`, !isWebViewOwnedUrl(webUrl, launchUrl), webUrl);
}
const catalogFuture = [...catalog, ...futureApps.map(([name, webUrl], i) => ({ name: name.split(' ')[0], slug: `future-${i}`, webUrl }))];
ok(
  'after publishing Apps A–E, AppMintly own URL REMAINS WebView-owned',
  catalogFuture.filter((a) => {
    const t = resolveOpenOnWebUrl(a);
    return t ? isWebViewOwnedUrl(t, launchUrl) : false;
  }).length === ownedBefore.length
);
ok('no future app became WebView-owned', !futureApps.some(([, webUrl]) => isWebViewOwnedUrl(webUrl, launchUrl)));

// ---------------------------------------------------------------------------
// PART 6 — CATALOG MUTATION + URL-CHANGE INVARIANTS (Sections 10 & 11)
// All in-memory; the real data/apps.json is never modified by this gate.
// ---------------------------------------------------------------------------
const ownedBy = (c: CatalogApp[]) => c.filter((a) => {
  const t = resolveOpenOnWebUrl(a);
  return t ? isWebViewOwnedUrl(t, launchUrl) : false;
}).map((a) => a.name);

const c1 = [...catalog, { name: 'TestApp', slug: 'testapp', type: 'Web App', webUrl: 'https://pdfly-source.github.io/testapp/' }];
ok('after publishing TestApp: AppMintly ownership TRUE, TestApp FALSE',
   JSON.stringify(ownedBy(c1)) === JSON.stringify(ownedBefore) && !isWebViewOwnedUrl('https://pdfly-source.github.io/testapp/', launchUrl));

const c2 = [...c1, { name: 'TestApp2', slug: 'testapp2', type: 'Web App', webUrl: 'https://testapp2.example.com/' }];
ok('after publishing TestApp2: AppMintly TRUE, TestApp FALSE, TestApp2 FALSE',
   JSON.stringify(ownedBy(c2)) === JSON.stringify(ownedBefore) &&
   !isWebViewOwnedUrl('https://pdfly-source.github.io/testapp/', launchUrl) &&
   !isWebViewOwnedUrl('https://testapp2.example.com/', launchUrl));

// Mutating a published app's webUrl must never touch AppMintly ownership.
const c3 = c2.map((a) => (a.slug === 'testapp' ? { ...a, webUrl: 'https://testapp.example.com/' } : a));
ok('changing TestApp webUrl never changes AppMintly ownership',
   JSON.stringify(ownedBy(c3)) === JSON.stringify(ownedBefore));
ok('after webUrl change, Open on Web uses the NEW exact URL',
   resolveOpenOnWebUrl(c3.find((a: any) => a.slug === 'testapp')!) === 'https://testapp.example.com/');
ok('NEW URL after change remains NOT WebView-owned', !isWebViewOwnedUrl('https://testapp.example.com/', launchUrl));

// Editing publisher/category/APK fields is irrelevant to ownership by construction:
// ownership depends only on the launch URL. Prove it stays stable across a full
// catalog field storm.
const c4 = c3.map((a) => ({ ...a, publisher: 'Someone Else', category: 'Changed', apkUrl: 'https://x/y.apk' }));
ok('metadata edits (publisher/category/apkUrl) never change ownership', JSON.stringify(ownedBy(c4)) === JSON.stringify(ownedBefore));

// ---------------------------------------------------------------------------
// PART 7 — MISSING-URL FAIL-SAFE (Section 12)
// ---------------------------------------------------------------------------
const emptyApp = { name: 'NoUrl', slug: 'nourl', type: 'Web App' };
ok('missing URL resolves to undefined, never to AppMintly own URL',
   resolveOpenOnWebUrl(emptyApp) === undefined && resolveOpenOnWebUrl(emptyApp) !== launchUrl);
ok('catalog records resolve to https URL or undefined — never a silent fallback',
   catalog.every((a) => {
     const t = resolveOpenOnWebUrl(a);
     if (t === undefined) return true;
     try { return new URL(t).protocol === 'https:'; } catch { return false; }
   }));

// ---------------------------------------------------------------------------
console.log(`\n[gate] ${checks} checks, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
