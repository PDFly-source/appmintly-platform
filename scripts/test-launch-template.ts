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
  'pre-12 window background is the brand splash color (no black flash frame)',
  /<item name="android:windowBackground">@color\/splash_bg_bottom<\/item>/.test(builderSrc),
);
ok(
  'Android 12+ system splash background is branded (values-v31)',
  /values-v31/.test(builderSrc) &&
    /<item name="android:windowSplashScreenBackground">@color\/splash_bg_bottom<\/item>/.test(builderSrc),
);
ok(
  'system splash icon background is branded too (no icon halo mismatch)',
  /<item name="android:windowSplashScreenIconBackgroundColor">@color\/splash_bg_bottom<\/item>/.test(builderSrc),
);
ok(
  'splash gradient colors are derived from the per-app theme color (two shades)',
  // AppMintly's own APK swaps in the owner-supplied light canvas; every other
  // build still derives both shades from its theme color.
  // Any package with an owner-supplied splash spec gets that canvas colour;
  // every other build still derives both shades from its theme color.
  /const splashBgTop = splashSpec \? splashSpec\.bg : mixHex\(themeColor, 'white', 0\.08\);/.test(builderSrc) &&
    /const splashBgBottom = splashSpec \? splashSpec\.bg : mixHex\(themeColor, 'black', 0\.10\);/.test(builderSrc) &&
    /bg: APPMINTLY_SPLASH_BG/.test(builderSrc) &&
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
  (/mainHandler\.postDelayed\(splashTimeout, 12000L\);/.test(builderSrc) ||
    /mainHandler\.postDelayed\(splashTimeout, \$\{splashHardTimeoutMs\}L\);/.test(builderSrc)) &&
    /hardTimeoutMs: APPMINTLY_SPLASH_HARD_TIMEOUT_MS/.test(builderSrc) &&
    /export const PDFMINIFLY_SPLASH_HARD_TIMEOUT_MS = 12000;/.test(
      fs.readFileSync('lib/splash/pdfminifly-splash.ts', 'utf8'),
    ) &&
    /export const APPMINTLY_SPLASH_HARD_TIMEOUT_MS = 12000;/.test(
      fs.readFileSync('lib/splash/appmintly-splash.ts', 'utf8'),
    ) &&
    /mainHandler\.removeCallbacks\(splashTimeout\);/.test(builderSrc),
);
ok(
  'splash logo is the official launcher artwork at aspect-correct fitCenter scale',
  /getIdentifier\("ic_launcher_foreground", "mipmap", getPackageName\(\)\)/.test(builderSrc) &&
    /FIT_CENTER/.test(builderSrc),
);
ok(
  'splash logo size is bounded (<=38% width, <=176dp; no oversized logo)',
  /widthPixels \* 0\.38f/.test(builderSrc) && /176 \* density/.test(builderSrc),
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
  'brand copy uses the design tokens: gold #F4B400 tagline, teal #14B8A6 CTA, ink #0E1526 text',
  /"#F4B400"/.test(builderSrc) && /"#14B8A6"/.test(builderSrc) && /"#0E1526"/.test(builderSrc),
);
ok(
  'CTA is an accessible touch target (>=52dp min height)',
  /setMinHeight\(\(int\) \(52 \* density\)\)/.test(builderSrc),
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
  'entrance motion is a restrained staggered fade+rise (<=340ms, <=70ms stagger)',
  /setDuration\(340L\)/.test(builderSrc) && /setStartDelay\(140L \+ i \* 70L\)/.test(builderSrc),
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

/* ---------- 7. AppMintly splash replacement (owner-supplied design) ----------
 * The marketplace's own APK no longer ships the gradient + launcher-icon
 * overlay: it ships the owner-supplied AppMintly_Splash.html design as a native
 * Canvas view. Every other app keeps the launch experience above, byte for
 * byte, so these checks are additive and gated on the package id.
 */
const splashModule = fs.readFileSync('lib/splash/appmintly-splash.ts', 'utf8');
const splashAssets = fs.readFileSync('lib/splash/appmintly-splash-assets.ts', 'utf8');
/* eslint-disable @typescript-eslint/no-var-requires */
const {
  appmintlySplashJava,
  appmintlySplashStylesV31Xml,
  appmintlySplashStylesXml,
  APPMINTLY_SPLASH_HARD_TIMEOUT_MS,
} = require('../lib/splash/appmintly-splash');

ok(
  'owner-supplied splashes are scoped per package id, not switched on globally',
  /export const APPMINTLY_SPLASH_PACKAGE = 'com\.appmintly\.appmintly';/.test(splashModule) &&
    /packageId === APPMINTLY_SPLASH_PACKAGE/.test(builderSrc) &&
    /packageId === PDFMINIFLY_SPLASH_PACKAGE/.test(builderSrc) &&
    /: null;/.test(builderSrc),
);
const splashJava = appmintlySplashJava('com.appmintly.appmintly');
ok(
  'the owner-supplied splash is reproduced natively (no WebView, no remote asset)',
  /public class AppMintlySplashView extends View/.test(splashJava) &&
    !/WebView|https?:\/\//.test(splashJava),
);
ok(
  'the splash runs for the reference 3400ms',
  /export const APPMINTLY_SPLASH_MS = 3400;/.test(splashModule) &&
    /DURATION_MS = 3400L/.test(splashModule),
);
ok(
  'the reference canvas colour drives window, system splash and overlay',
  /export const APPMINTLY_SPLASH_BG = '#F8FBFF';/.test(splashModule) &&
    /@color\/splash_launch_bg/.test(splashModule) &&
    /bg: APPMINTLY_SPLASH_BG/.test(builderSrc) &&
    /splashOverlay\.setBackgroundColor\(Color\.parseColor\("\$\{splashSpecBg\}"\)\);/.test(builderSrc),
);
const splashV31 = appmintlySplashStylesV31Xml();
ok(
  'Android 12+ system splash draws a neutral surface with no icon or halo',
  /windowSplashScreenBackground">@color\/splash_launch_bg/.test(splashV31) &&
    /windowSplashScreenAnimatedIcon">@drawable\/splash_transparent_icon/.test(splashV31) &&
    !/windowSplashScreenIconBackgroundColor/.test(splashV31) &&
    !/splash_bg_bottom/.test(appmintlySplashStylesXml()),
);
ok(
  'both reference images are bundled byte-for-byte and drawn with multiply semantics',
  /appmintlySplashMarkJpeg\(\)/.test(builderSrc) &&
    /appmintlySplashWordJpeg\(\)/.test(builderSrc) &&
    /splash_mark/.test(splashModule) &&
    /multiplyMatte/.test(splashModule) &&
    /data:image\/jpeg;base64,/.test(splashAssets.replace(/BASE64 =\s*'/g, 'data:image/jpeg;base64,')),
);
ok(
  'the splash retires only after BOTH the animation and the first content paint',
  /splashContentReady = true;/.test(builderSrc) &&
    /if \(!splashTimedOut && !\(splashContentReady && splashAnimationDone\)\) \{/.test(builderSrc),
);
ok(
  'the 12s startup safety timeout still overrides the animation gate',
  /splashTimedOut = true;/.test(builderSrc) &&
    /mainHandler\.postDelayed\(splashTimeout, \$\{splashHardTimeoutMs\}L\);/.test(builderSrc) &&
    /hardTimeoutMs: APPMINTLY_SPLASH_HARD_TIMEOUT_MS/.test(builderSrc) &&
    /hardTimeoutMs: PDFMINIFLY_SPLASH_HARD_TIMEOUT_MS/.test(builderSrc) &&
    APPMINTLY_SPLASH_HARD_TIMEOUT_MS === 12000,
);
ok(
  'reduced motion is honoured inside the splash view as well',
  /ANIMATOR_DURATION_SCALE/.test(splashModule) &&
    /final boolean animate = !reducedMotion;/.test(splashModule),
);
{
  const start = builderSrc.indexOf('// --- owner-supplied launch splash (native Canvas view) ---');
  const end = builderSrc.indexOf('splashOverlay.addView(splashView', start);
  const appmintlyBranch = start > -1 && end > start ? builderSrc.slice(start, end) : '';
  ok(
    'the AppMintly overlay carries no old gradient, launcher icon or ImageView',
    appmintlyBranch.length > 200 &&
      !/launchBackground\(|ic_launcher|ImageView|GradientDrawable/.test(appmintlyBranch) &&
      /setBackgroundColor\(Color\.parseColor\("\$\{splashSpecBg\}"\)\)/.test(appmintlyBranch),
  );
}
ok(
  'splash resources are emitted only for a package with a splash design',
  /if \(splashSpec\) \{[\s\S]{0,1400}drawable-nodpi/.test(builderSrc) &&
    /javaFile: 'AppMintlySplashView\.java'/.test(builderSrc) &&
    /javaFile: 'PdfMiniFlySplashView\.java'/.test(builderSrc) &&
    !/drawable-nodpi[\s\S]{0,200}if \(!splashSpec\)/.test(builderSrc),
);
/* ---------- PDFMiniFly (Task 2): its own owner-supplied splash ---------- */
const pdfModule = fs.readFileSync('lib/splash/pdfminifly-splash.ts', 'utf8');
const {
  PDFMINIFLY_SPLASH_HARD_TIMEOUT_MS: PDF_MINIFLY_TIMEOUT,
  PDFMINIFLY_SPLASH_PACKAGE: PDF_MINIFLY_PACKAGE,
  pdfminiflySplashJava,
  pdfminiflySplashStylesV31Xml,
} = require('../lib/splash/pdfminifly-splash');
ok(
  'PDFMiniFly splash is scoped to its own package id',
  PDF_MINIFLY_PACKAGE === 'com.appforge.pdfminifly' &&
    /packageId === PDFMINIFLY_SPLASH_PACKAGE/.test(builderSrc),
);
const pdfJava = pdfminiflySplashJava(PDF_MINIFLY_PACKAGE);
ok(
  'the PDFMiniFly splash is reproduced natively (no WebView, no remote asset)',
  /public class PdfMiniFlySplashView extends View/.test(pdfJava) &&
    !/WebView|https?:\/\//.test(pdfJava),
);
ok(
  'the PDFMiniFly launch surface cannot show the old branded splash',
  /windowSplashScreenBackground">@color\/pdfminifly_splash_bg/.test(pdfminiflySplashStylesV31Xml()) &&
    /windowSplashScreenAnimatedIcon">@drawable\/pdfminifly_splash_transparent_icon/.test(
      pdfminiflySplashStylesV31Xml(),
    ) &&
    PDF_MINIFLY_TIMEOUT === 12000,
);
ok(
  'the PDFMiniFly splash follows the reference FINAL cascade (drop + wipe, not zoom/rise)',
  /animation:drop \.95s cubic-bezier\(\.3,\.8,\.3,1\) \.2s both/.test(
    fs.readFileSync('docs/splash/PDFMiniFly_Splash.html', 'utf8'),
  ) &&
    /LOGO_DELAY = 200L, LOGO_DUR = 950L/.test(pdfModule) &&
    /WORD_DELAY = 950L, WORD_DUR = 900L/.test(pdfModule) &&
    /canvas\.clipRect\(/.test(pdfModule),
);
ok(
  'the PDFMiniFly reference artwork is embedded, not redrawn or fetched',
  /PDFMINIFLY_SPLASH_LOGO_JPEG_BASE64/.test(pdfModule) &&
    /mix-blend-mode:multiply/.test(fs.readFileSync('docs/splash/PDFMiniFly_Splash.html', 'utf8')) &&
    /PorterDuff\.Mode\.MULTIPLY/.test(pdfModule),
);
ok(
  'the PDFMiniFly reference HTML is committed as the authoritative design source',
  fs.existsSync('docs/splash/PDFMiniFly_Splash.html') &&
    fs.statSync('docs/splash/PDFMiniFly_Splash.html').size > 60000,
);
ok(
  'AppMintly keeps its own design: the two apps never share a splash view',
  /viewClass: 'AppMintlySplashView'/.test(builderSrc) &&
    /viewClass: 'PdfMiniFlySplashView'/.test(builderSrc) &&
    !/AppMintlySplashView/.test(pdfModule),
);

ok(
  'the reference HTML is committed as the authoritative design source',
  fs.existsSync('docs/splash/AppMintly_Splash.html') &&
    fs.statSync('docs/splash/AppMintly_Splash.html').size > 60000,
);

/* ---------- 8. Download path: no unhandled scheme, no null filename ----------
 * Two real defects lived here until v2.1.3 for PDFMiniFly / any wrapper app:
 *  a) the failure fallback called startActivity() unguarded, and WebView hands
 *     blob:/data: URLs to onDownloadStart for files the page generated, which
 *     no installed app can resolve -> ActivityNotFoundException on the UI thread;
 *  b) a link with no path segment (e.g. /export?format=pdf) produced a null
 *     filename, the request threw, and a downloadable file was bounced to the
 *     browser instead of saved.
 */
ok(
  'download listener refuses non-fetchable schemes before touching DownloadManager',
  /if \(!scheme\.equals\("http"\) && !scheme\.equals\("https"\)\) \{/.test(builderSrc),
);
ok(
  'blob/data downloads tell the user the truth instead of firing a dead intent',
  /generated inside the page and cannot be saved by the app/.test(builderSrc),
);
ok(
  'null or unsafe download filename falls back to a safe name',
  /fileName = "appmintly-download";/.test(builderSrc),
);
ok(
  'download fallback startActivity is wrapped and can never escape the listener',
  /catch \(Throwable failure\) \{[\s\S]{0,400}try \{[\s\S]{0,200}startActivity\(new Intent\(Intent\.ACTION_VIEW, target\)\);[\s\S]{0,200}\} catch \(Throwable unopenable\) \{/.test(builderSrc),
);
ok(
  'download listener catches Throwable, not just Exception',
  /onDownloadStart\(String url[\s\S]{0,3000}catch \(Throwable failure\)/.test(builderSrc),
);

if (failures > 0) {
  console.error(`\n${failures} of ${checks} launch-template checks FAILED`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} launch-template checks passed`);
