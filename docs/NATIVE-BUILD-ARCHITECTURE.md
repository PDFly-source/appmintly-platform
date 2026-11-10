# Dual-kernel APK architecture

Two build kernels, one release contract. The catalog never decides how an app is
built; `data/build-profiles.json` does, and the two are validated against each other
before a build runs.

```
workflow_dispatch (slug, artifact, version_code, dry_run)
        │
        ├─ data/build-profiles.json  ──► build-profile.mjs validate / assert-version / assert-repository
        │        (single source of truth)        │
        │                                        ▼
        ├─ webview kernel ─► lib/apk-builder.ts ─┐
        └─ native kernel  ─► gradlew assembleRelease ─┐
                                                      ▼
        identity → security gates → launcher composition → SHA256 → publish → catalog → events
```

## Profiles (authoritative)
`data/build-profiles.json` holds, per app, the kernel, repository allowlist entry,
project path, immutable-ref policy, signing secret namespace and, per artifact, the
package id, catalog slug, Gradle task, SDK policy and the allowlists the native gate
enforces. `data/apps.json` only records published artifact metadata.

## Native gates (`scripts/verify-native-apk.mjs`, fail-closed)
package identity · version identity · SDK compliance · not-debuggable · exported
components · dangerous permissions · cleartext traffic · DEX integrity + native code
markers · signature schemes and certificate SHA-256 · artifact SHA-256.

A missing aapt2/apksigner/unzip is a failure, never a pass.

## Version safety
`assert-version` compares against the catalog on `origin/main`, so a downgrade or a
re-publish of an existing versionCode is refused. `versionCodeFloor` is an additional
minimum, never the primary guard.

## Repository security
Only repositories on `allowedRepositories` are buildable. Release builds require a
40-hex commit SHA; branch refs are accepted only when `dry_run=true`. Only Gradle
tasks named in the profile may run, and the project path must match the profile.

## Separated artifacts
NexDrop phone (`com.nexdrop.ndt1`) and NexDrop TV (`com.nexdrop.tv`) are independent
artifacts: own task, own package id, own catalog slug, own version, own SHA-256.

## Known policy gap
The WebView kernel ships against AppMintly's SDK 36 requirement; NexDrop's native
project is compileSdk/targetSdk 34. `sdk-compliance` reports the real numbers, and the
profile pins `minSdk 26 / targetSdk 34`. Raising it is a source change in the native
project, not a silent workflow override.
