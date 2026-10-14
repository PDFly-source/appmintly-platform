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
  /const splashBgTop = mixHex\(themeColor, 'white', 0\.08\);/.test(builderSrc) &&
    /const splashBgBottom = mixHex\(themeColor, 'black', 0\.10\);/.test(builderSrc) &&
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
    /welcome \? welcomeViewsJava : ''/.test(builderSrc) &&
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
  'welcome content scrolls on small screens (ScrollView, fillViewport)',
  /new ScrollView\(this\)/.test(builderSrc) && /setFillViewport\(true\);/.test(builderSrc),
);
ok(
  'entrance motion is restrained and staggered after the crossfade (380ms, 260ms start, 90ms stagger)',
  /setDuration\(380L\)/.test(builderSrc) && /setStartDelay\(260L \+ i \* 90L\)/.test(builderSrc),
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

console.log('');
console.log(`[launch-template] ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`[launch-template] FAILED: ${failures} regression(s) detected`);
  process.exit(1);
}
