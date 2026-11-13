# Studyria 2.0.3 production release report

**Released:** 2026-11-13 · **Authorization:** owner-approved full production release of the Studyria 2.0.3 native splash migration.

## Release identity

| Item | Value |
| --- | --- |
| Platform merge commit | `6bd8047` (merge of `feat/studyria-native-splash-0203` into `main`) |
| Catalog commit | `744917e` (release bot, only the studyria record) |
| Production branch head (platform) | `c0b80d3` (includes the automated lab-sync commit that followed) |
| Site merge commit | `edf3d19` (`newgols51-pixel/studyria`, merge of `fix/native-splash-suppression-0203`) |
| Production branch head (site) | `ca2b91e` (automated static-page regeneration on top of the merge) |
| Release tag | `studyria-v2.0.3` |
| Release URL | https://github.com/PDFly-source/appmintly-releases/releases/tag/studyria-v2.0.3 |
| Release id / asset id | 443960848 / 742811014 |
| Published APK URL | https://github.com/PDFly-source/appmintly-releases/releases/download/studyria-v2.0.3/Studyria-2.0.3.apk |
| Deploy run | 43390093655 (Deploy AppMintly to GitHub Pages, head `c0b80d3`, success) |

## The published artifact

| Item | Value |
| --- | --- |
| File | Studyria-2.0.3.apk |
| Size | 325,765 B (318.1 KB) |
| SHA-256 | `2a90701df960c4b6cf53e1de3fe8c311a6d4bb87c97d8ab53c69b365614a5355` |
| Package / version | com.appforge.studyria / 2.0.3 (versionCode 20003) |
| Signatures | v1 + v2 + v3 present |
| Certificate | CN=AppMintly, SHA-256 `dbafc6d389516069518826d1e1320cebcf7970eec9249d749de699b730f61368` (unchanged) |
| SDK / permissions | minSdk 21, targetSdk 36, no permissions |
| Security gate | 14/14 PASS, validator 11.6.0 |
| Rebuild | **none.** The bytes published are the exact artifact verified in build run 43371074512; the GitHub asset digest is `sha256:2a90701d…4a5355`, identical to the local verified file and to the anonymously downloaded copy. |

No approved design value changed in this release: reference artwork, the 3,400 ms duration, animation curves, bar geometry, colours, layout dimensions, reduced-motion behaviour and the 12,000 ms hard timeout are untouched.

## Merge and catalog

* Platform merge `6bd8047`: 13 files, all Studyria-scoped (`lib/splash/studyria-splash.ts`, `studyria-geometry.ts`, `studyria-splash-assets.ts`, `lib/apk-builder.ts`, the QA harness and analyzer, the Studyria splash reference, unit tests and the two Task 6 reports). No unrelated commits, no refactors.
* Site merge `edf3d19`: 3 files, +32/−0 (`index.html` bridge gate, `pwa-v3.css` native rule, `pwa-v3.js` `initSplash` guard). The gate fails open, so browsers and installed PWAs keep the website splash exactly as before; live verification below confirms it is serving on both hosts.
* Catalog commit `744917e`: **only the studyria record** changed (version 2.0.3, versionCode 20003, 325,765 B, SHA-256 above, tag `studyria-v2.0.3`, release 443960848, asset 742811014, previousVersion 2.0.2, verified true). All 8 records load and the other 7 records are byte-identical; `data/` carries no other change.

## Anonymous verification

| Check | Result |
| --- | --- |
| Anonymous APK download | HTTP 200, `application/vnd.android.package-archive`, 325,765 B |
| Downloaded SHA-256 vs release artifact | exact match |
| Live `/data/apps.json` | studyria 2.0.3 / 20003 / 325765 / `2a90701d…4a5355`, apkUrl on `studyria-v2.0.3` |
| Live `/app/studyria/` | serves 2.0.3 and the 2.0.3 APK filename (12 version hits, 2 filename hits) |
| Live site gate | `https://studyria.qzz.io/` and the GitHub Pages host both serve the `__studyriaNativeApp` gate and the `html[data-native-app]` CSS rule |
| Other records live | appmintly 1.0.12, pdfminifly 2.3.0, niramay 2.3.0, cineflow 0.3.2, billcraft 0.2.0, nexdrop 1.5.0, distribution-test 1.0.1 — all unchanged |

## Post-deployment QA on the published binary

Run **43392724996** (`apk_url` mode, `source=published-release-asset`, hash gate `2a90701d…` enforced before install): **PASS, 67 checks, 0 failures**. Highlights:

* device reports versionName 2.0.3 on the downloaded APK;
* cold artwork: logo 159,296 ink px, wordmark 51,710 ink px, column centre 540.0 vs 540.0 (0.0 px), bbox 88,703 to 992,1559;
* rendered fill matches the drawing code: 255 px vs 255 px and 488 px vs 489 px;
* screenrecord: 0% at takeover, 92% then 100% by 2900 ms, never decreasing across 67 splash frames;
* reduced motion draws the empty pill; HOME, offline, landscape, warm relaunch all pass;
* renderer death: renderer pid 7720 killed, marketplace back after one recovery, no second splash.

### Attempt 1 failure, reported as it happened

Run 43391095955 returned 64 PASS / 2 FAIL, both in the cold artwork pass: "wordmark missing from its box (0 ink px)" and "artwork column ... off by 3.0px". The log shows why: "the screen grab only caught one state (largest frame delta 2.7)" and "6 frame(s) after 3600ms were not judged as splash frames" — the emulator's latched surface returned an early entry frame (mark at 75% scale, wordmark not yet risen), and the artwork checks judged that frame. Logo ink 151,060 px versus 159,296 px in the settled frame is the same mid-entry measurement. The binary under test was identical (hash gate passed before install), so this is a capture-timing limitation of the emulator surface, not a difference in the app. It is recorded here rather than hidden; the same hash-gated run passed all 67 checks unchanged on attempt 2.

## The five completed apps

Untouched. No code, release, asset, catalog record or deployment was modified for AppMintly, PDFMiniFly, BillCraft, Niramay or CineFlow; their catalog records and release tags are byte-identical to before this release, and the diff for this release touches only Studyria files plus the Jenkins-free QA harness they share.

## Remaining closure gate

Owner installation and open confirmation on the physical device remains the final user-side gate. Everything before it is verified: published bytes, live catalog, live site gate and the published-binary device matrix.
