# AppMintly six-app release report

**Consolidated state as of 2026-11-13.** Every version, size and SHA-256 below was read from the live production catalog and each APK was verified by anonymous download.

## The six AppMintly apps

| App | Version | versionCode | Size (bytes) | SHA-256 | Release tag |
| --- | --- | --- | --- | --- | --- |
| AppMintly | 1.0.12 | 10012 | 333,930 | `c04ee44267409b9df11c09fd4b72911afa542d3f381027c70ffb2e18fc3b093a` | appmintly-v1.0.12 |
| Studyria | 2.0.3 | 20003 | 325,765 | `2a90701df960c4b6cf53e1de3fe8c311a6d4bb87c97d8ab53c69b365614a5355` | studyria-v2.0.3 |
| PDFMiniFly | 2.3.0 | 20300 | 362,635 | `a83a31a1e6eaac966046b8cf26d7cd24a99a23d21bd191cd4b2d114bc629f8a1` | pdfminifly-v2.3.0 |
| Niramay | 2.3.0 | 20300 | 411,778 | `0c1b6deb3f22dbf437e1998c1274243d1c35ce58e116df308abe315cc6523f2c` | niramay-v2.3.0 |
| CineFlow | 0.3.2 | 302 | 411,781 | `a4fd5fad97df605991c37f8e5c6e8445ecdf89a2979c02e05220ab8b76cc7fbd` | cineflow-v0.3.2 |
| BillCraft | 0.2.0 | 200 | 325,768 | `132e13d370dab6023a50de5c57b58501982d7837f92afa31bdef9830df2c3616` | billcraft-v0.2.0 |

All six share the pinned production certificate `dbafc6d389516069518826d1e1320cebcf7970eec9249d749de699b730f61368` (CN=AppMintly), v1+v2+v3 signatures, targetSdk 36, minSdk 21, no permissions, and passed the 14-point APK security gate (validator 11.6.0).

## Additional catalog records

| App | Version | versionCode | Size (bytes) | SHA-256 | Release tag |
| --- | --- | --- | --- | --- | --- |
| NexDrop | 1.5.0 | 10500 | 153,454 | `aa1e698befebd17f9ef826635e1d35e888a50dbf0141c121367c80b62fc4d212` | nexdrop-v1.5.0 |
| AppMintly Distribution Test | 1.0.1 | 10001 | 509,806 | `6e7d3413b862d671a205ff40445be9d3c694687b433cfa528d33e62fc9ce0aa0` | appmintly-distribution-test-v1.0.1 |

## Native splash migration sequence

1. **AppMintly 1.0.12** — native splash, launcher composition gate, 17 launcher resources.
2. **PDFMiniFly 2.3.0** — native splash migration.
3. **BillCraft 0.2.0** — native splash migration.
4. **Niramay 2.3.0** — native splash; later website-only fix removed a second (page-level) splash inside the app without an APK change.
5. **CineFlow 0.3.2** — native film-strip splash with artwork-centring fix; 51-52 device checks.
6. **Studyria 2.0.3** — native StudyriaSplashView plus native-only website suppression; 67 device checks on the published binary (run 43392724996), after the bar-fill gate was traced to a fill layer painted at 7% opacity.

## Studyria 2.0.3 release summary

Merge `6bd8047` (platform) and `edf3d19` (site), catalog `744917e`, tag `studyria-v2.0.3`, release 443960848, asset 742811014, deploy run 43390093655, published-binary QA run 43392724996 PASS 67/0. Full detail in `Studyria-2.0.3-production-release.md`.

## Standing limits

All device evidence is from an API-34 emulator whose compositor latches frames; motion and intermediate states are therefore corroborated by screenrecord plus the app's own timeline, and one published-QA attempt had to be repeated for exactly that reason. Physical-device installation confirmation remains with the owner for every app in the table.
