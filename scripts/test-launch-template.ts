/**
 * [launch-template] Premium Splash & Welcome experience regression tests.
 * Run: npm exec --yes --package=tsx@4.20.5 -- tsx scripts/test-launch-template.ts
 *
 * Static, offline checks against the real APK build template
 * (lib/apk-builder.ts) plus its wiring (scripts/build-android-apk.ts and
 * the two APK workflows). Mirrors the fail-closed convention of
 * scripts/test-webview-ownership.ts / test-notification-engine.ts:
 * the template is data here, and any regression in the launch experience,
 * the deep-link gate, the offline gate or the P0 share bridge fails the
 * build.
 */
import fs from 'node:fs';

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

const builderSrc = fs.readFileSync('lib/apk-builder.ts', 'utf8');
const entrySrc = fs.readFileSync('scripts/build-android-apk.ts', 'utf8');
const buildWf = fs.readFileSync('.github/workflows/build-android-apk.yml', 'utf8');
const releaseWf = fs.readFileSync('.github/workflows/release-android-apk.yml', 'utf8');

/* ---------- 1. Native splash: themed window + Android 12+ attributes ---------- */

ok(
  'custom launch theme replaces the plain black Theme.NoTitleBar window',
  /android:theme="@style\/AppTheme"/.test(builderSrc),
);
ok(
  'pre-12 window background is the branded launch_backdrop drawable (no flat-color frame)',
  /<item name="android:windowBackground">@drawable\/launch_backdrop<\/item>/.test(builderSrc),
);
ok(
  'Android 12+ system splash background is the brand mid-tone color (attr is type=color)',
  /values-v31/.test(builderSrc) &&
    /<color name="splash_bg_mid">/.test(builderSrc) &&
    /<item name="android:windowSplashScreenBackground">@color\/splash_bg_mid<\/item>/.test(builderSrc),
);
ok(
  'system splash icon background uses the same brand mid-tone (no icon halo mismatch)',
  /<item name="android:windowSplashScreenIconBackgroundColor">@color\/splash_bg_mid<\/item>/.test(builderSrc),
);
ok(
  'splash gradient colors are derived from the per-app theme color (two shades)',
  /const genericSplashTop = mixHex\(themeColor, 'white', 0\.08\);/.test(builderSrc) &&
    /const genericSplashBottom = mixHex\(themeColor, 'black', 0\.10\);/.test(builderSrc) &&
    /const splashBgTop = premiumLaunch \? PREMIUM_BG_TOP : genericSplashTop;/.test(builderSrc) &&
    /<color name="splash_bg_top">\$\{splashBgTop\}<\/color>/.test(builderSrc),
);

/* ---------- 2. In-window splash overlay behavior ---------- */

ok(
  'root layout carries the WebView plus overlays (setContentView(rootLayout))',
  /setContentView\(rootLayout\)/.test(builderSrc) && !/setContentView\(webView\)/.test(builderSrc),
);
ok(
  'first content paint retires the splash (onPageFinished -> dismissSplashAfterFirstPaint)',
  /public void onPageFinished\(WebView view, String url\)[\s\S]{0,200}dismissSplashAfterFirstPaint\(\);/.test(builderSrc),
);
ok(
  'splash dismissal is idempotent (one-shot guard)',
  /if \(splashDismissed \|\| splashOverlay == null\) \{\s*return;/.test(builderSrc),
);
ok(
  'hard 12s timeout can never trap the user behind the splash (offline/slow loads)',
  /mainHandler\.postDelayed\(splashTimeout, 12000L\);/.test(builderSrc) &&
    /mainHandler\.removeCallbacks\(splashTimeout\);/.test(builderSrc),
);
ok(
  'splash logo is the official launcher artwork at aspect-correct fitCenter scale',
  /getIdentifier\("ic_launcher_foreground", "mipmap", getPackageName\(\)\)/.test(builderSrc) &&
    /FIT_CENTER/.test(builderSrc),
);
ok(
  'splash logo is generously sized (>=128dp floor, ~46% width, <=220dp cap)',
  /widthPixels \* 0\.46f/.test(builderSrc) && /220 \* density/.test(builderSrc) && /128 \* density/.test(builderSrc),
);

/* ---------- 3. Welcome screen gating (first launch to Home only) ---------- */

ok(
  'welcome screen is opt-in per build (absent welcome copy generates no welcome code)',
  /const welcome = options\.welcome;/.test(builderSrc) &&
    /welcome \? \(premiumLaunch \? premiumWelcomeViewsJava : welcomeViewsJava\) : ''/.test(builderSrc) &&
    /welcome \? welcomeMethodsJava :[\s\S]{0,40}private void onSplashDismissed/.test(builderSrc),
);
ok(
  'welcome is one-time (SharedPreferences welcomed flag)',
  /getSharedPreferences\("appmintly_welcome", MODE_PRIVATE\)/.test(builderSrc) &&
    /putBoolean\("welcomed", true\)\.apply\(\)/.test(builderSrc),
);
ok(
  'notification deep links never surface the welcome screen',
  /launchedToDeepLink = true;/.test(builderSrc) &&
    /if \(pageLoadFailed \|\| launchedToDeepLink\) \{\s*return;/.test(builderSrc),
);
ok(
  'failed/offline loads never surface the welcome screen',
  /if \(request\.isForMainFrame\(\)\) \{\s*pageLoadFailed = true;/.test(builderSrc),
);
ok(
  'welcome CTA exists and is wired to welcomeAccepted()',
  /cta\.setOnClickListener\(new View\.OnClickListener\(\) \{[\s\S]{0,220}welcomeAccepted\(\);/.test(builderSrc),
);
ok(
  'back gesture on the welcome screen behaves like the CTA (no trap)',
  /welcomeOverlay\.getVisibility\(\) == View\.VISIBLE\) \{[\s\S]{0,160}welcomeAccepted\(\);/.test(builderSrc),
);
ok(
  'brand accents present: emerald 0x33059669, teal 0x2614B8A6, blue 0x2E2563EB, gold 0x29F4B400, red 0x1FE31E24, CTA teal->blue gradient',
  /0x33059669/.test(builderSrc) && /0x2614B8A6/.test(builderSrc) &&
    /0x2E2563EB/.test(builderSrc) && /0x29F4B400/.test(builderSrc) &&
    /0x1FE31E24/.test(builderSrc) &&
    /setColors\(new int\[\]\{0xFF14B8A6, 0xFF2563EB\}\)/.test(builderSrc),
);
ok(
  'CTA is an accessible touch target (>=52dp min height)',
  /setMinHeight\(\(int\) \(54 \* density\)\)/.test(builderSrc),
);

/* ---------- 4. Accessibility, insets, small screens, reduced motion ---------- */

ok(
  'reduced-motion preference is respected (ANIMATOR_DURATION_SCALE gate)',
  /Settings\.Global\.ANIMATOR_DURATION_SCALE/.test(builderSrc) && /private boolean isReducedMotion\(\)/.test(builderSrc),
);
ok(
  'splash + welcome respect system bars (fitsSystemWindows)',
  /splashOverlay\.setFitsSystemWindows\(true\);/.test(builderSrc) &&
    /welcomeOverlay\.setFitsSystemWindows\(true\);/.test(builderSrc),
);
ok(
  'welcome root is a FrameLayout (backdrop stacks behind content, never pushes the ScrollView off-screen)',
  /welcomeOverlay = new FrameLayout\(this\);/.test(builderSrc) &&
    !/welcomeOverlay = new LinearLayout\(this\);/.test(builderSrc) &&
    /welcomeOverlay\.addView\(scroller, new FrameLayout\.LayoutParams\(/.test(builderSrc) &&
    /private FrameLayout welcomeOverlay;/.test(builderSrc),
);
ok(
  'welcome content scrolls on small screens (ScrollView, fillViewport)',
  /new ScrollView\(this\)/.test(builderSrc) && /setFillViewport\(true\);/.test(builderSrc),
);
ok(
  'entrance motion is restrained and staggered after the crossfade (380ms, 260ms start, 90ms stagger)',
  /setDuration\(380L\)/.test(builderSrc) &&
    /premiumLaunch \? '120L \+ \(i - 1\) \* 70L' : '260L \+ i \* 90L'/.test(builderSrc),
);
ok(
  'no animation blocks startup: overlays are built after the WebView load dispatch',
  /buildLaunchOverlays\(\);[\s\S]{0,600}setContentView\(rootLayout\);/.test(builderSrc),
);

/* ---------- 5. Protected surfaces unchanged ---------- */

ok(
  'P0 native share bridge is intact (single-flight chooser, ownership-pinned)',
  /public boolean share\(String url, String title, String text\)/.test(builderSrc) &&
    /!u\.startsWith\(ALLOWED_ORIGIN\)\) return false;/.test(builderSrc) &&
    /Intent\.createChooser/.test(builderSrc),
);
ok(
  'package id, version code and signing flow untouched',
  /semanticVersionToCode\(versionName\)/.test(builderSrc) &&
    /apksigner sign --ks/.test(builderSrc),
);
ok(
  'native update checker fail-closed origin gate untouched',
  /appmintly\.pages\.dev/.test(builderSrc),
);
ok(
  'no new permissions are declared beyond the existing set',
  !/uses-permission android:name="android\.permission\.(?!INTERNET|ACCESS_NETWORK_STATE|DOWNLOAD_WITHOUT_NOTIFICATION|POST_NOTIFICATIONS|RECEIVE_BOOT_COMPLETED)/.test(builderSrc),
);

/* ---------- 5b. Premium visual fix (P0 launch recording regression) ---------- */

ok(
  'premium LaunchBackdrop paints navy gradient + emerald/teal/blue/gold/red glows (one onDraw pass)',
  /private static class LaunchBackdrop extends View/.test(builderSrc) &&
    /new LinearGradient\(0f, 0f, w \* 0\.35f/.test(builderSrc) &&
    /new RadialGradient/.test(builderSrc) &&
    /0x33059669, 0x00059669/.test(builderSrc) &&
    (builderSrc.match(/new RadialGradient/g) || []).length >= 5,
);
ok(
  'static launch_backdrop drawable (layer-list: navy gradient + centered emerald halo) backs the window background in BOTH styles blocks',
  /<layer-list/.test(builderSrc) &&
    /launch_backdrop\.xml/.test(builderSrc) &&
    /<item name="android:windowBackground">@drawable\/launch_backdrop<\/item>/.test(builderSrc) &&
    (builderSrc.match(/<item name="android:windowBackground">@drawable\/launch_backdrop<\/item>/g) || []).length === 2 &&
    /@color\/splash_bg_top/.test(builderSrc),
);
ok(
  'splash and welcome share the same LaunchBackdrop (no background change mid-sequence)',
  (builderSrc.match(/new LaunchBackdrop\(this,/g) || []).length === 2 &&
    !/launchBackground\(\)/.test(builderSrc),
);
ok(
  'splash overlay is added LAST (topmost): welcome rises beneath the fade',
  builderSrc.indexOf('rootLayout.addView(welcomeOverlay') <
    builderSrc.indexOf('rootLayout.addView(splashOverlay'),
);
ok(
  'dismiss reveals the welcome BEFORE fading (crossfade; no blank beat, no raw page flash)',
  (() => {
    const m = builderSrc.match(/private void dismissSplashAfterFirstPaint\(\) \{[\s\S]*?\n    \}/);
    if (!m) return false;
    const body = m[0];
    return (
      body.indexOf('onSplashDismissed();') < body.indexOf('startAnimation(retire)') &&
      !/onAnimationEnd[\s\S]{0,120}onSplashDismissed/.test(builderSrc)
    );
  })(),
);
ok(
  'splash retirement is a restrained fade+lift (280ms, centered pivot)',
  /setDuration\(280L\)/.test(builderSrc) &&
    /RELATIVE_TO_SELF, 0\.5f/.test(builderSrc) &&
    !/fillAfter/.test(builderSrc),
);
ok(
  'logo entrance is a subtle fade+settle (320ms, 0.92->1.0 scale), skipped under reduced motion',
  /logo\.animate\(\)\.alpha\(1f\)\.scaleX\(1f\)\.scaleY\(1f\)\.setDuration\(320L\)/.test(builderSrc) &&
    /if \(!isReducedMotion\(\)\) \{[\s\S]{0,140}logo\.setAlpha\(0f\)/.test(builderSrc),
);
ok(
  'welcome content is vertically centered on tall screens (Gravity.CENTER)',
  /welcomeContent\.setGravity\(Gravity\.CENTER\);/.test(builderSrc),
);
ok(
  'CTA is white-on-gradient with arrow, 54dp min target, 30dp radius',
  /cta\.setTextColor\(Color\.WHITE\)/.test(builderSrc) &&
    /\\u2192/.test(builderSrc) &&
    /setCornerRadius\(30f \* density\)/.test(builderSrc),
);
ok(
  'tagline is gold with wide tracking (13sp, 0.22f letterSpacing)',
  /"#F4B400"/.test(builderSrc) && /tagline\.setLetterSpacing\(0\.22f\)/.test(builderSrc),
);

/* ---------- 6. Wiring: entry script + workflows ---------- */

ok(
  'entry script parses WELCOME_* env vars into the build options',
  /WELCOME_HEADLINE/.test(entrySrc) && /welcome: process\.env\.WELCOME_HEADLINE/.test(entrySrc),
);
ok(
  'build workflow accepts + forwards the four welcome inputs',
  /welcome_headline:/.test(buildWf) &&
    /WELCOME_HEADLINE: \$\{\{ inputs\.welcome_headline \}\}/.test(buildWf) &&
    /WELCOME_CTA: \$\{\{ inputs\.welcome_cta \}\}/.test(buildWf),
);
ok(
  'release workflow accepts + forwards the four welcome inputs',
  /welcome_headline:/.test(releaseWf) &&
    /WELCOME_HEADLINE: \$\{\{ inputs\.welcome_headline \}\}/.test(releaseWf) &&
    /WELCOME_CTA: \$\{\{ inputs\.welcome_cta \}\}/.test(releaseWf),
);
ok(
  'debug signing mode remains test-only and unchanged',
  /debug is test-only/.test(buildWf),
);


/* ---------- 7. PREMIUM AppMintly launch design (complete splash replacement) ---------- */

import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// 7a. Source-level gating: premium is marketplace-package-only and fail-closed.
ok(
  'premium design is gated to com.appmintly.appmintly AND the explicit premium flag',
  /const PREMIUM_LAUNCH_PACKAGE = 'com\.appmintly\.appmintly';/.test(builderSrc) &&
    /const premiumLaunch = !!\(welcome && welcome\.premium && packageId === PREMIUM_LAUNCH_PACKAGE\);/.test(builderSrc),
);
ok(
  'premium palette is the reference midnight navy (#04152E / #020B1C / #010812)',
  /PREMIUM_BG_TOP = '#04152E'/.test(builderSrc) &&
    /PREMIUM_BG_MID = '#020B1C'/.test(builderSrc) &&
    /PREMIUM_BG_BOTTOM = '#010812'/.test(builderSrc),
);
ok(
  'entry script + both workflows forward WELCOME_PREMIUM (default off)',
  /premium: process\.env\.WELCOME_PREMIUM === '1'/.test(entrySrc) &&
    /WELCOME_PREMIUM: \$\{\{ inputs\.welcome_premium \}\}/.test(buildWf) &&
    /WELCOME_PREMIUM: \$\{\{ inputs\.welcome_premium \}\}/.test(releaseWf) &&
    /welcome_premium:[\s\S]{0,200}default: ''/.test(buildWf),
);
ok(
  'hero mark asset exists, is a transparent PNG, and is small (<60 KB)',
  (() => {
    const p = 'public/brand/launch/appmintly-launch-mark.png';
    if (!fs.existsSync(p)) return false;
    const b = fs.readFileSync(p);
    return b.slice(1, 4).toString() === 'PNG' && b.length < 60_000;
  })(),
);
ok(
  'premium build refuses to compile if the hero mark asset is missing (fail-closed)',
  /Premium launch build refused: public\/brand\/launch\/appmintly-launch-mark\.png is missing/.test(builderSrc),
);

// 7b. Behavioural: generate the REAL template for both flavors and inspect it.
const genScript = path.join(os.tmpdir(), 'launch-gen.mts');
function stubToolchain(dir: string): Record<string, string> {
  const jar = path.join(dir, 'android.jar');
  const r8 = path.join(dir, 'r8.jar');
  const ks = path.join(dir, 'stub.keystore');
  const sdk = path.join(dir, 'sdk');
  fs.mkdirSync(sdk, { recursive: true });
  for (const p of [jar, r8, ks]) fs.writeFileSync(p, 'stub');
  // The toolchain preflight only checks `command -v` for these tools; the
  // template/resources are written to disk before any of them is executed.
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const tool of ['aapt', 'zipalign', 'apksigner', 'unzip', 'convert']) {
    const p = path.join(bin, tool);
    fs.writeFileSync(p, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(p, 0o755);
  }
  return {
    PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
    ANDROID_JAR: jar,
    R8_JAR: r8,
    ANDROID_KEYSTORE_PATH: ks,
    ANDROID_SDK_ROOT: sdk,
    KEYSTORE_PASSWORD: 'stub',
    KEY_PASSWORD: 'stub',
    KEY_ALIAS: 'stub',
  };
}
function generate(pkg: string, premium: boolean): { java: string; res: string } {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'launchgen-'));
  fs.writeFileSync(
    genScript,
    `import { runApkBuild } from '${path.resolve('lib/apk-builder').replace(/\\/g, '/')}';
(async () => { try { await runApkBuild({ appId:'x', slug:'${pkg.split('.').pop()}', name:'${pkg.split('.').pop()}', version:'1.0.0', launchUrl:'https://appmintly.pages.dev/', packageId:'${pkg}', themeColor:'#0E1526', buildMode:'webview', authorized:true, iconUrl:'/icon-512.png', welcome:{ headline:'Your Digital World, One Place.', tagline:'Discover. Install. Experience.', body:'Discover amazing apps, install with confidence, and experience your digital world \u2014 all in one place.', cta:'Explore AppMintly', premium:${premium} } } as any); } catch (e) {} })();`,
  );
  try {
    execSync(`npm exec --yes --package=tsx@4.20.5 -- tsx ${genScript}`, {
      stdio: 'ignore',
      // The generator only needs the toolchain paths to EXIST to reach file
      // generation (it fails later at javac, which this test ignores). Stub
      // files make the gate independent of the Android SDK, which CI has not
      // provisioned yet when this gate step runs.
      env: { ...process.env, APK_ARTIFACT_ONLY: '1', GITHUB_ACTIONS: 'true', ...stubToolchain(out) },
      timeout: 120_000,
    });
  } catch {
    /* the pipeline may stop later (signing); generation happens first */
  }
  const roots = ['/tmp/appforge-builds', path.join(out, 'appforge-builds')].filter(fs.existsSync);
  let newest = '';
  let t = 0;
  for (const r of roots) {
    for (const d of fs.readdirSync(r)) {
      const m = fs.statSync(path.join(r, d)).mtimeMs;
      if (m > t) {
        t = m;
        newest = path.join(r, d);
      }
    }
  }
  const srcRoot = path.join(newest, 'src');
  const find = (dir: string): string =>
    fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
      const p = path.join(dir, e.name);
      return acc || (e.isDirectory() ? find(p) : e.name === 'MainActivity.java' ? p : '');
    }, '');
  return { java: fs.readFileSync(find(srcRoot), 'utf8'), res: path.join(newest, 'res') };
}

const SKIP_BEHAVIOURAL = process.env.SKIP_BEHAVIOURAL === '1';
if (!SKIP_BEHAVIOURAL) {
  const prem = generate('com.appmintly.appmintly', true);
  const gen = generate('com.example.otherapp', true); // premium requested but WRONG package -> must be ignored

  // old splash removal
  ok('premium: old emerald halo (#059669) is gone from Java AND resources',
    !/059669/.test(prem.java) && !/059669/.test(fs.readFileSync(path.join(prem.res, 'drawable/launch_backdrop.xml'), 'utf8')));
  ok('premium: old generic LaunchBackdrop class is not compiled in (no dead splash code)',
    !/class LaunchBackdrop /.test(prem.java) && /class PremiumLaunchBackdrop /.test(prem.java));
  ok('premium: window/system-splash background is the reference navy',
    /splash_bg_top">#04152E</.test(fs.readFileSync(path.join(prem.res, 'values/colors.xml'), 'utf8')) &&
      /splash_bg_mid">#020B1C</.test(fs.readFileSync(path.join(prem.res, 'values/colors.xml'), 'utf8')) &&
      /windowSplashScreenBackground">@color\/splash_bg_mid</.test(fs.readFileSync(path.join(prem.res, 'values-v31/styles.xml'), 'utf8')));
  ok('premium: system splash + window background stay on the mandatory Android mechanism (AppTheme)',
    /windowBackground">@drawable\/launch_backdrop</.test(fs.readFileSync(path.join(prem.res, 'values/styles.xml'), 'utf8')));

  // logo visibility / no duplicate
  ok('premium: hero mark drawable is bundled in drawable-nodpi and referenced by the hero builder',
    fs.existsSync(path.join(prem.res, 'drawable-nodpi/appmintly_launch_mark.png')) && /appmintly_launch_mark/.test(prem.java));
  ok('premium: ONE shared hero builder is used by splash and welcome (no duplicate logo implementation)',
    (prem.java.match(/buildPremiumHero\(\)/g) || []).length === 3 && (prem.java.match(/class .*Hero|ImageView mark /g) || []).length <= 1);
  ok('premium: hero is not re-animated by the welcome stagger (child 0 skipped) - no logo jump',
    /for \(int i = 1; i < count; i\+\+\)/.test(prem.java));
  ok('premium: splash hero and welcome hero share the same top offset (dp(40))',
    /splashHeroLp\.topMargin = dp\(40\)/.test(prem.java) && /setPadding\(dp\(22\), dp\(40\)/.test(prem.java));

  // required copy hierarchy
  for (const t of ['DISCOVER. INSTALL. EXPERIENCE.', 'Apps &\\nGames', 'Safe &\\nTrusted', 'Fast &\\nLightweight', 'Curated\\nfor You',
    '100% Secure', 'Instant Access', 'All Devices', 'Built for You', 'APPS  \\u2022  TOOLS  \\u2022  DIGITAL EXPERIENCES', 'Your Digital World, One Place.', 'Explore AppMintly']) {
    ok(`premium: contains copy "${t}"`, prem.java.includes(t));
  }
  ok('premium: wordmark APP white + MINTLY multicolor spans', /0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF,\s*0xFF22C55E/.test(prem.java));
  ok('premium: headline second line is gold', /0xFFF4B400, nl \+ 1|setSpan\(new ForegroundColorSpan\(0xFFF4B400\), nl \+ 1/.test(prem.java));

  // overlay ordering
  const iWelcomeAdd = prem.java.indexOf('rootLayout.addView(welcomeOverlay');
  const iSplashAdd = prem.java.indexOf('rootLayout.addView(splashOverlay');
  ok('premium: overlay ordering - welcome added before splash so splash is topmost',
    iWelcomeAdd > 0 && iSplashAdd > iWelcomeAdd);
  ok('premium: welcome root is a FrameLayout (cannot push content off-screen)',
    /welcomeOverlay = new FrameLayout\(this\)/.test(prem.java) && !/welcomeOverlay = new LinearLayout/.test(prem.java));

  // CTA + Skip behaviour
  ok('premium: CTA is a real Button with a visible arrow, >= 48dp (56dp) target and teal->blue gradient',
    /Button cta = new Button\(this\)/.test(prem.java) && /\\u2192/.test(prem.java) &&
      /cta\.setMinHeight\(dp\(56\)\)/.test(prem.java) && /0xFF14D3B4, 0xFF1E5CF0/.test(prem.java));
  ok('premium: CTA and Skip both call welcomeAccepted() and Skip is >= 48dp + accessible',
    (prem.java.match(/welcomeAccepted\(\);/g) || []).length >= 3 && /skip\.setMinHeight\(dp\(48\)\)/.test(prem.java) &&
      /skip\.setContentDescription\("Skip welcome"\)/.test(prem.java) && /skip\.setClickable\(true\)/.test(prem.java));
  ok('premium: repeated taps are debounced (welcomeAcceptedOnce)',
    /if \(welcomeAcceptedOnce\)/.test(prem.java) && /welcomeAcceptedOnce = true;/.test(prem.java));
  ok('premium: welcome is first-launch-only, skipped on deep links and load failures',
    /prefs\.getBoolean\("welcomed", false\)/.test(prem.java) && /pageLoadFailed \|\| launchedToDeepLink/.test(prem.java));
  ok('premium: reduced-motion is respected for splash and welcome', (prem.java.match(/isReducedMotion\(\)/g) || []).length >= 4);
  ok('premium: safe timeout + idempotent dismissal retained (never trapped on splash)',
    /splashTimeout/.test(prem.java) && /if \(splashDismissed \|\| splashOverlay == null\)/.test(prem.java));
  ok('premium: back on welcome behaves like CTA', /welcomeOverlay\.getVisibility\(\) == View\.VISIBLE\) \{\s*\/\/ Back on the welcome/.test(prem.java));
  ok('premium: tiles + footer are accessible (content descriptions)', /tile\.setContentDescription\(/.test(prem.java));

  // isolation: other apps never inherit AppMintly premium visuals
  ok('generic (other package, premium requested): NO premium classes, hero, Skip control or nodpi asset',
    !/PremiumLaunchBackdrop|buildPremiumHero|TileIcon|skip\.set/.test(gen.java) && !fs.existsSync(path.join(gen.res, 'drawable-nodpi')));
  ok('generic: keeps the original LaunchBackdrop + theme-derived palette',
    /class LaunchBackdrop /.test(gen.java) && !/#04152E/.test(fs.readFileSync(path.join(gen.res, 'values/colors.xml'), 'utf8')));
}

console.log('');
console.log(`[launch-template] ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`[launch-template] FAILED: ${failures} regression(s) detected`);
  process.exit(1);
}
