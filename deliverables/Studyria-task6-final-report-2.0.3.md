# Studyria Task 6: native launch splash 2.0.3, final verification report

**Date:** 2026-11-13
**Branch:** `feat/studyria-native-splash-0203` (head `5e3ac1e`), base `origin/main`
**Device matrix:** run [43380208671](https://github.com/PDFly-source/appmintly-platform/actions/runs/43380208671) PASS, **67 checks, 0 failures**
**Release status:** verification only. Nothing merged, tagged, published, catalogued or deployed.

## 1. Result

| Gate | Result |
| --- | --- |
| Device matrix (9 scenarios) | **PASS 67 / 0 failures** (run 43380208671) |
| Launch-template gate | **90/90** (the original 80 unchanged, 10 Studyria checks added) |
| Vitest | **857 passed / 11 failed / 2 skipped**, identical to the 11 known baseline failures (same test names) |
| Analyzer self-tests | 20/20 Studyria profile, CineFlow profile 0 failures |
| APK identity | unchanged bytes from build run 43371074512 |

## 2. The product defect and its root cause

The bar was **drawn at 7% opacity**. `StudyriaSplashView` painted the fill into a layer
whose alpha was reduced to 0.07 while the artwork was in its settle phase, so the
canvas genuinely contained fill pixels (`fillW` 194 px at 1.3 s, 489 px at 2.95 s) while
the composited surface showed cream. Nothing was wrong with the geometry, the timing,
the curves or the capture: the pixels were there, at 7% alpha.
Fix `5bdedd4` restores full opacity for the fill layer only. No design value, duration,
curve, colour, geometry, layout or reduced-motion behaviour was changed.

### Why the two previous verdicts disagreed

* **View route** (the app's own raster) reported 0% fill while the code logged
  `fillW` 166 px: the analyzer was reading a frame decoded from a stale capture, not the
  frame dumped at the instant the progress line reported. Fixed by dumping the frame at
  the reported instant (`471ecdf`) and judging the fill on its contiguous run rather than
  a single sampled row (`9277cb0`).
* **Video route** (SurfaceFlinger composite) reported 0% because the timeline was
  anchored on the first *cream* frame. The recording opens on the previous screen and then
  shows about 3 s of the window background before the starting window hands over, so every
  sampled moment landed on an empty stage, and the track rectangle was placed without the
  `screen=` origin offset. Fixed in `c09cac4` (anchor = first frame that actually carries
  the artwork) and in the `screen=W,H` geometry parse.

### Harness defects fixed (measurement, not product)

| Commit | Defect | Why it failed |
| --- | --- | --- |
| `e118143` | marketplace WebView sampled with one `uiautomator dump` | sampled the instant before a fresh WebView attached to a 2.38 MB site |
| `9828de8`, `2c28be4`, `11fbbc1` | renderer-death scenario "NOT RUN" | `ps` truncates names to 15 chars, and the renderer belongs to the WebView provider, not the app; ownership now read from `/proc/<pid>/cmdline` with a bounded poll |
| `5e3ac1e` | cold settled frame taken after a fixed 4 s sleep | on a slow launch it caught the splash still up (two identical frames, hierarchy `attached`) |
| `5e3ac1e` | rotation burst not re-verified | landscape was confirmed, then the surface fell back to portrait during the burst, so a portrait launch was judged |

No assertion was weakened and no threshold was widened: a splash still up at 12 s, a
missing WebView after HOME, or frames that stay portrait after three attempts still fail.

## 3. Canvas, clip, track and fill evidence (device, 1080x2209 viewport)

| Instant | Track (device px) | Fill drawn (`fillW`) | Fill rendered | Agreement |
| --- | --- | --- | --- | --- |
| 1.2 s | (296, 1942) to (784, 1965) | 194 px (40% of 488) | **193 px**, 40% | 1% off |
| 2.9 s | (296, 1942) to (784, 1965) | 489 px | **488 px**, 100% | 0% off |

Canvas geometry is unchanged from the approved reference: ruled canvas pitch 144.5 px
(21 rules, median deviation −0.35 px), red margin rule at 154 px (258 samples), artwork
column centred at 540.0 vs 540.0 (off by 0.0 px), logo 159,296 ink px and wordmark
51,710 ink px inside their reference boxes, landscape equivalents 62.5 px pitch, rule at
194 px, centre 1264.0 vs 1264.0.

## 4. Screenrecord evidence (independent route, same run)

* recording started 4,833 ms before the attach; the splash view first draws at 4,280 ms of
  the recording, and the first frame that carries artwork is the animation's own t=0.
* bar coverage across the splash: **2% at the anchor, 92% at 1.2 s, 100% at 2.9 s**, peak
  100%, **84 splash frames, never decreasing**.
* fill begins at 0 ms of the splash window (the 450 ms delay is inside the anchor frame
  interval of a variable-rate recording).

The two differences between screenshot and recording are explained and verified rather
than assumed: `screencap` latches the surface (it can return a frame seconds old, which is
why every timing assertion is made on the app's own raster plus the recorded timeline),
and the recording is variable rate (about 7 real frames a second), so it cannot resolve
1.2 s from 2.9 s to better than a couple of frames. It therefore asserts what it can
carry: empty at takeover, further filled at 2.9 s, full by the end, monotonic throughout.

## 5. Full matrix, run 43380208671 (67 PASS, 0 FAIL)

| Scenario | Checks | Evidence highlights |
| --- | --- | --- |
| Install and identity | 2 | versionName 2.0.3 on device |
| Cold launch | 11 | light canvas dimmest mean 229.4, artwork and wordmark in box, canvas pitch 144.5 px, red rule 154 px, bar filled 99%, content replaced splash (delta 57.4) |
| Animation scale | 2 | device scale 1 before the cold pass, restored to null at the end |
| Timed captures | 3 | attach epoch 1794552217054 ms, grabs at 1200/2900 ms targets |
| View-rendered fill | 4 | 193 px vs fillW 194, 488 px vs fillW 489 |
| Screenrecord | 5 | 0→100%, monotonic, 84 frames |
| Landscape | 12 | 2400x1080 confirmed from capture, centre 1264.0 vs 1264.0, pitch 62.5 px |
| Warm relaunch | 3 | splash shown (no warm-start skip), retired, canvas judged |
| Reduced motion | 9 | empty pill, no animation, retired in 2,094 ms |
| HOME during splash | 5 | process alive, no ANR, returns to marketplace |
| Renderer death | 4 | renderer pid 7852 killed, back after one recovery, landed on the page not a second splash |
| Offline launch | 3 | splash shown, retired, process alive |
| Restore | 1 | animation scale back to null |

Observed measurement artifact: the warm-relaunch hierarchy poll reported a clean tree
after 14,993 ms. The 12,000 ms hard timeout is the app's own failsafe and it fired inside
that budget; the poll is an upper bound because `uiautomator` only dumps an idle window
(a documented property of this harness), and the settled-frame check for that pass
confirms the marketplace, not the splash.

## 6. Verification APK

| Field | Value |
| --- | --- |
| File | Studyria-2.0.3.apk |
| Size | 325,765 B (318.1 KB) |
| SHA-256 | `2a90701df960c4b6cf53e1de3fe8c311a6d4bb87c97d8ab53c69b365614a5355` |
| Package / version | com.appforge.studyria / 2.0.3 (versionCode 20003) |
| Signatures | v1 (APPMINTL.SF/RSA), v2 and v3 present |
| Certificate | CN=AppMintly, SHA-256 `dbafc6d389516069518826d1e1320cebcf7970eec9249d749de699b730f61368` (unchanged) |
| SDK | minSdk 21, targetSdk 36 |
| Permissions | none |
| Security gate | 14/14 PASS (targetSdk, minSdk, debuggable, testOnly, signing, certificate, signature, permissions, embedded secrets, development URLs, structure, package, version, sha256), validator 11.6.0 |
| Source identity | the only commits after build `471ecdf` are `scripts/ci/*` (harness and analyzer); no `lib/`, `android/` or `data/` change, so these bytes still correspond to this source |

## 7. Scope and preservation

* Changed files vs `origin/main`: 12 files, +3,053 / −12. Application code is
  `lib/splash/studyria-splash.ts`, `lib/splash/studyria-geometry.ts`,
  `lib/splash/studyria-splash-assets.ts`, `lib/apk-builder.ts`; the rest is the QA
  analyzer, harness, self-tests, workflow and the reference document
  `docs/splash/Studyria_Splash.html`.
* `data/` is untouched on this branch: the catalog, all six app records and every
  release are unmodified. AppMintly, PDFMiniFly, BillCraft, Niramay and CineFlow code,
  releases, catalog records and deployments were not touched.
* Repository identity re-checked: `PDFly-source/appmintly-platform`, branch
  `feat/studyria-native-splash-0203`, no merge into `main`, no tag, no release asset,
  no Pages deploy triggered by this work.

## 8. Standing limits

The device is an API-34 emulator; every visual claim above is emulator evidence. Owner
installation on the physical device remains the only unverified step, and release
(merge, tag, publish, catalog, deploy) still awaits separate explicit authorization.
