# Studyria 2.0.3 — bar-fill evidence instrumentation and matrix result

Prepared 2026-11-13. Nothing merged, tagged, published, catalogued or deployed.
AppMintly, PDFMiniFly, BillCraft, Niramay, CineFlow and their releases untouched.

## APK under test (unchanged by this work)

| field | value |
|---|---|
| file | Studyria-2.0.3.apk |
| size | 325,765 B |
| SHA-256 | 5c0e8234f59530997e5491eb07b7438337a4ba143d617725495e4f409b809a5a |
| version | 2.0.3 / versionCode 20003 |
| package | com.appforge.studyria |
| certificate | dbafc6d3…f61368 (unchanged) |
| signatures | v1 + v2 + v3 |
| build run | 43360307975 (branch feat/studyria-native-splash-0203) |

Instrument commits: b74e4ee, 2218512, b2544ff, cfe85c5, 9b754f0.

## What the instrumentation does

1. `StudyriaSplashView` logs the bar progress variable it actually draws with
   (throttled to ~4 lines/s) plus one attach line, so the assertion reads the same
   number the pixels come from.
2. The harness force-stops, clears logcat, launches once, reads the attach moment
   from the device clock, maps it onto the host clock, and takes two on-device
   screencaps at 1200 ms and 2900 ms, recording real elapsed time and capture cost.
3. The analyzer judges a capture only if the pixels prove it is the splash (reference
   canvas corner plus artwork ink), then expects a mid fill early and a full fill
   late, corroborated by the native progress and the logged track bounds.
4. An unprovable capture is a FAIL, never a silent pass.

## Native evidence (run 43364928708)

`attach durationMs=3400 reducedMotion=false`, track 296,1942,784,1965.

| t (ms) | progress | fillW (px) |
|---|---|---|
| 75 | 0.000 | 0 |
| 402 | 0.000 | 0 |
| 693 | 0.003 | 2 |
| 953 | 0.063 | 31 |
| 1059 | 0.120 | 58 |
| 1265 | 0.306 | 150 |
| 1536 | 0.592 | 289 |
| 1789 | 0.769 | 376 |
| 2177 | 0.916 | 448 |
| 2463 | 0.968 | 473 |
| 2794 | 0.996 | 486 |
| 3080 | 1.000 | 488 |

## Render evidence (run 43364928708)

| grab | elapsed | surface | fill | native progress |
|---|---|---|---|---|
| 1200 ms | 1208 ms | our splash (corner 251,250,247; ink 2872) | 0 % | 0.120 @ 1059 ms |
| 2900 ms | 2952 ms | our splash (same corner/ink) | 0 % | 0.996 @ 2794 ms |

Both frames are 1080x2400 and are not identical to each other, yet a full scan of
rows 1500..2300 finds no dark horizontal run wider than 200 px in either frame: the
track band at y 1942..1965 reads pure cream (251,250,247). So the capture path still
does not observe the animated fill.

## Run history of the instrument

| run | result | why |
|---|---|---|
| 43360411583 | 49 PASS / 1 FAIL | grabs anchored to the harness clock: 4377 ms and 9945 ms, splash already retired |
| 43361549137 | 51 PASS / 1 FAIL | anchored to attach: 1319 ms (ours by pixels, discarded on a stale `gone` dump) and 6352 ms |
| 43362988847 | 52 PASS / 0 FAIL | **not acceptable**: the grabs landed at 7290 ms and 58277 ms, so the bar was never judged; the unproven-evidence hole is now closed |
| 43364266718 | superseded | ran on cfe85c5 while the ownership fix was being committed |
| 43364928708 | **52 PASS / 2 FAIL** | captures correct at 1208 ms and 2952 ms on proven surfaces; rendered fill reads 0 % |

## Baselines

* Splash unit tests: 19/19.
* Launch gate: 90/90 (the original 80 unchanged, 10 Studyria checks added).
* Analyzer self-tests: Studyria profile PASSED, CineFlow profile PASSED.
* Vitest: 857 pass with the same 11 known failures.
* Emulator `animator_duration_scale=1` recorded before the cold pass; reduced motion
  remains a separate scale=0 pass; device setting restored afterwards.

## Open item

The device gate stays BLOCKED on one question: why does the captured frame show no
drawn fill while the view logs `fillW` 166 at 1295 ms and 488 at 2833 ms at the track
bounds it reports? Either the drawn bar lands at a different screen position than the
logged bounds, or the emulator's screencap still cannot observe this surface. The next
step is a capture route independent of screencap (screenrecord and frame decode) or a
check that maps the reported bounds through the view's canvas transform before
measuring.
