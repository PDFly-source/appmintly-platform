/**
 * C4 Stage 2 gate — public publisher verification copy.
 *
 * Asserts the three things the owner required:
 *   1. verification wording comes only from the canonical record;
 *   2. anything not explicitly `verified: true` renders neutral publisher
 *      wording and never a verified claim (fail closed);
 *   3. the canonical publisher data and application ownership are untouched,
 *      and the built HTML contains no unsupported verified claim in text,
 *      badge, <title> or JSON-LD.
 *
 * Run: npx tsx scripts/test-publisher-verification.ts
 * The HTML part needs `out/` from a static export and is reported as SKIP when
 * that export is absent, so a green run always says which parts ran.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  getVerificationState,
  isVerifiedPublisher,
  getPublisherVerificationCopy,
} from '../lib/publisher-verification';
import { resolveDeveloper } from '../data/publishers';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// ---------------------------------------------------------------- pure state
check('explicit true -> verified', getVerificationState({ verified: true }) === 'verified');
check('explicit false -> unverified', getVerificationState({ verified: false }) === 'unverified');
check('missing field -> unknown', getVerificationState({}) === 'unknown');
check('null identity -> unknown', getVerificationState(null) === 'unknown');
check('undefined identity -> unknown', getVerificationState(undefined) === 'unknown');

for (const [label, value] of [
  ['string "true"', 'true'],
  ['string "false"', 'false'],
  ['number 1', 1],
  ['number 0', 0],
  ['null field', null],
  ['empty object', {}],
  ['empty array', []],
  ['object {value:true}', { value: true }],
] as const) {
  check(`malformed ${label} -> unknown`, getVerificationState({ verified: value }) === 'unknown');
  check(`malformed ${label} never verified`, isVerifiedPublisher({ verified: value }) === false);
}

check('isVerifiedPublisher only for explicit true', isVerifiedPublisher({ verified: true }) === true);
check('isVerifiedPublisher false for false', isVerifiedPublisher({ verified: false }) === false);

// ------------------------------------------------------------------- copy map
const verifiedCopy = getPublisherVerificationCopy({ verified: true });
check('verified copy shows badge', verifiedCopy.showVerifiedBadge === true);
check('verified eyebrow names verification', /verified/i.test(verifiedCopy.eyebrow), verifiedCopy.eyebrow);
check('verified apps intro claims verification', /verified/i.test(verifiedCopy.appsIntro), verifiedCopy.appsIntro);
check('verified meta descriptor names verification', /verified/i.test(verifiedCopy.metaDescriptor));

for (const [label, identity] of [
  ['unverified', { verified: false }],
  ['missing field', {}],
  ['malformed "yes"', { verified: 'yes' }],
  ['malformed 1', { verified: 1 }],
  ['null identity', null],
] as const) {
  const copy = getPublisherVerificationCopy(identity);
  const blob = `${copy.eyebrow} ${copy.appsIntro} ${copy.metaDescriptor}`;
  check(`neutral (${label}): no badge`, copy.showVerifiedBadge === false);
  check(`neutral (${label}): no verified wording`, !/verified/i.test(blob), blob);
  check(`neutral (${label}): says publisher profile`, copy.eyebrow === 'Publisher Profile', copy.eyebrow);
  check(`neutral (${label}): neutral apps wording`, copy.appsIntro === 'Applications published by this publisher.');
  check(`neutral (${label}): not accusatory`, !/suspicious|unsafe|untrusted|not verified|unverified/i.test(blob), blob);
}

const wording = (c: ReturnType<typeof getPublisherVerificationCopy>) =>
  `${c.showVerifiedBadge}|${c.eyebrow}|${c.appsIntro}|${c.metaDescriptor}`;
check(
  'unverified and unknown render identical wording (state stays diagnostic)',
  wording(getPublisherVerificationCopy({ verified: false })) === wording(getPublisherVerificationCopy({})),
);

// --------------------------------------------------- resolveDeveloper is strict
check('resolveDeveloper: verified publisher', resolveDeveloper({ developerSlug: 'pkd' }).verified === true);
check('resolveDeveloper: unverified publisher', resolveDeveloper({ developerSlug: 'mint-test-lab' }).verified === false);
check('resolveDeveloper: unknown slug is unverified', resolveDeveloper({ developer: 'Nobody', developerSlug: 'ghost-publisher' }).verified === false);

// ------------------------------------------------------- canonical data intact
const repoRoot = path.resolve(import.meta.dirname, '..');
const publishersRaw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/publishers.json'), 'utf8')) as Record<string, unknown>[];
const appsRaw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/apps.json'), 'utf8')) as Record<string, unknown>[];

check('canonical publishers.json is an array', Array.isArray(publishersRaw));
check('every canonical record has exactly slug/name/verified', publishersRaw.every((r) => {
  const keys = Object.keys(r).sort().join(',');
  return keys === 'name,slug,verified';
}), JSON.stringify(publishersRaw.map((r) => Object.keys(r))));
check('no verification evidence fields were invented', publishersRaw.every((r) => !('verifiedAt' in r) && !('evidence' in r) && !('verificationUrl' in r)));

const mint = publishersRaw.find((p) => p.slug === 'mint-test-lab');
const pkd = publishersRaw.find((p) => p.slug === 'pkd');
check('mint-test-lab record still exists', Boolean(mint));
check('mint-test-lab is canonically unverified', getVerificationState(mint) === 'unverified');
check('mint-test-lab copy is neutral', getPublisherVerificationCopy(mint).showVerifiedBadge === false);
check('pkd is canonically verified', getVerificationState(pkd) === 'verified');

// ownership unchanged: every app still points at its original publisher
const ownership = appsRaw.reduce<Record<string, number>>((acc, a) => {
  const slug = String(a.developerSlug ?? '');
  acc[slug] = (acc[slug] ?? 0) + 1;
  return acc;
}, {});
check('ownership: pkd owns 7 catalog apps', ownership.pkd === 7, JSON.stringify(ownership));
check('ownership: mint-test-lab owns 1 catalog app', ownership['mint-test-lab'] === 1);
check('ownership: total developerSlug links = 8', Object.values(ownership).reduce((a, b) => a + b, 0) === 8);

// multi-application publisher keeps verified wording
const pkdCopy = getPublisherVerificationCopy(pkd);
check('multi-app verified publisher keeps verified wording', pkdCopy.showVerifiedBadge && /verified/i.test(pkdCopy.appsIntro));

// zero-application publisher still gets neutral, non-accusatory copy
const zeroAppIdentity = { slug: 'no-apps-yet', name: 'No Apps Yet', verified: false };
const zeroCopy = getPublisherVerificationCopy(zeroAppIdentity);
check('zero-app publisher: neutral eyebrow', zeroCopy.eyebrow === 'Publisher Profile');
check('zero-app publisher: no verified claim', !/verified/i.test(`${zeroCopy.eyebrow} ${zeroCopy.appsIntro} ${zeroCopy.metaDescriptor}`));
check('zero-app publisher: no apps in catalog', !appsRaw.some((a) => a.developerSlug === 'no-apps-yet'));

// ------------------------------------------------------------------ PKD guard
// The dedicated /publisher/pkd route ships hardcoded flagship copy. That copy
// claims verification, so the canonical record must still support it.
const pkdPage = fs.readFileSync(path.join(repoRoot, 'app/publisher/pkd/page.tsx'), 'utf8');
const pkdClaimsVerified = /Verified Developer & Publisher/.test(pkdPage);
check('PKD route copy and canonical state agree', !pkdClaimsVerified || getVerificationState(pkd) === 'verified');

// --------------------------------------------------- rendered static HTML gate
const outDir = path.join(repoRoot, 'out');
const readOut = (rel: string) => {
  const f = path.join(outDir, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};
const stripTags = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
const titleOf = (html: string) => (html.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
const jsonLdOf = (html: string) => (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || '';

const mintHtml = readOut('publisher/mint-test-lab/index.html') ?? readOut('publisher/mint-test-lab.html');
if (!mintHtml) {
  console.log('SKIP  rendered-HTML checks (no static export in out/ — run the build first)');
} else {
  const mintTitle = titleOf(mintHtml);
  const mintText = stripTags(mintHtml);
  const mintLd = jsonLdOf(mintHtml);
  check('rendered: no "Verified" in page title', !/verified/i.test(mintTitle), mintTitle);
  check('rendered: title says Publisher Profile', /Publisher Profile/.test(mintTitle), mintTitle);
  check('rendered: no "Verified Developer & Publisher"', !/Verified Developer & Publisher/i.test(mintHtml));
  check('rendered: no "this verified publisher"', !/this verified publisher/i.test(mintText));
  check('rendered: neutral publisher profile copy present', /Publisher Profile/.test(mintText));
  check('rendered: neutral apps wording present', /Applications published by this publisher/.test(mintText));
  check('rendered: JSON-LD makes no verification claim', !/verified/i.test(mintLd), mintLd.slice(0, 120));
  check('rendered: no accusatory wording', !/suspicious|unsafe|untrusted/i.test(mintText));

  const pkdHtml = readOut('publisher/pkd/index.html') ?? readOut('publisher/pkd.html');
  check('rendered: verified publisher page exists', Boolean(pkdHtml));
  if (pkdHtml) {
    check('rendered: verified publisher keeps verified title', /Verified/.test(titleOf(pkdHtml)), titleOf(pkdHtml));
  }
}

console.log(`\nC4 publisher-verification: ${pass}/${pass + fail} assertions pass`);
if (fail > 0) {
  console.log(`FAILURES: ${fail}`);
  process.exit(1);
}
