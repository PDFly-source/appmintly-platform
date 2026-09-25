# appmintly-publisher-api — Cloudflare Worker

Independent production backend for the AppMintly Publisher Console
(GitHub Pages static frontend). Replaces the unavailable Base44 HTTP
functions; no Base44 or Supabase dependency.

## Flow

    Publisher Console (browser)
        ↓ HTTPS (publish key in request body, CORS-locked origin)
    appmintly-publisher-api Worker
        ↓ GitHub API (server-side fine-grained PAT)
    GitHub Actions: release-android-apk.yml / Contents API (data/apps.json)
        ↓
    Production APK pipeline + GitHub Pages marketplace

## Endpoints

| Method | Path             | Auth        | Purpose |
| ---    | ---              | ---         | --- |
| GET    | /                | none        | health/config probe |
| POST   | /analyze-url     | rate-limited| server-side app metadata analysis (SSRF-guarded) |
| POST   | /build-apk       | publish key | dispatch `release-android-apk.yml` (real GitHub Actions only) |
| GET    | /build-apk       | rate-limited| real run status: QUEUED / BUILDING / SUCCESS / FAILED (+apkMetadata from catalog) |
| GET    | /publish-catalog | none        | configured status |
| POST   | /publish-catalog | publish key | Contents-API commit of ONLY data/apps.json + Pages deploy dispatch |
| POST   | /upload-screenshot | publish key | Contents-API commit of a screenshot under public/assets/apps/<slug>/screenshots/ (sniffed PNG/JPEG/WebP, ≤10 MB, deterministic filename, idempotent) |

## Secrets (server-side only; never in the frontend, responses or logs)

Set via `wrangler secret put`:

- `APPMINTLY_GITHUB_TOKEN` — fine-grained GitHub PAT scoped to ONLY
  `PDFly-source/appmintly-platform` (Actions: Read and write,
  Contents: Read and write, Metadata: Read-only).
- `APPMINTLY_PUBLISH_KEY` — publisher console key (constant-time verified).

## Deploy

    npx wrangler deploy
    npx wrangler secret put APPMINTLY_GITHUB_TOKEN
    npx wrangler secret put APPMINTLY_PUBLISH_KEY

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the
operator's environment. The Worker is stateless: the buildId returned by
`/build-apk` is a base64url token encoding `{name, version, slug,
packageId}`; status polling resolves the REAL workflow run from the
GitHub API by its `Release <name> v<version>` display title.

## Protections

- CORS restricted to https://pdfly-source.github.io (no wildcard).
- Constant-time publish-key comparison; key never echoed/logged.
- SSRF guards on analyze (HTTPS only; localhost/private ranges/IP literals blocked).
- 409 duplicate-release and in-progress-build protection.
- Compare-and-swap (blob SHA) catalog commit; only data/apps.json.
- Protected APK evidence (sha256, versionCode, release URLs) is never
  browser-writable.
- Rate limits: analyze 20/min, build 6/10min, publish 12/min, poll 120/min
  (best-effort per-isolate; authoritative guards are GitHub-side checks).
