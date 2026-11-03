# AppMintly — Production Baseline

> **Before making any AppMintly change, read `docs/PRODUCTION_BASELINE.md` and inspect the current `main` branch. Treat the recorded production state as the reference baseline. Update this document only when new evidence confirms a change.**

Last updated: **2026-11-03 05:10Z** (UTC). Maintained by the release engineer; every figure below cites its evidence source and date.

---

## 1. Project identity

| Item | Value |
|---|---|
| Project | AppMintly — an existing, live production project (not a greenfield build) |
| Public marketplace | https://appmintly.pages.dev/ |
| GitHub Pages mirror | https://pdfly-source.github.io/appmintly-platform/ |
| Publisher Console (private) | https://appmintly-publisher-api.sbn50088.workers.dev/console |
| Repository | `PDFly-source/appmintly-platform` |
| Branch | `main` |
| Catalog of record | `data/apps.json` |
| Release distribution repo | `PDFly-source/appmintly-releases` |

**Two builds, two scopes.** The GitHub Pages mirror is built with `NEXT_PUBLIC_BASE_PATH=/appmintly-platform` and serves under that prefix. Cloudflare Pages serves at the **site root** and must be built **root-scoped**. Crossing these two produces a completely unstyled site. See §4.

Related component documentation (do not duplicate it here):
- `worker/README.md` — the `appmintly-publisher-api` Worker.
- `scripts/automation/react-controlled-input.md` — required reading before automating Publisher Console form fields.

---

## 2. Latest verified production state

| Field | Value | Evidence source |
|---|---|---|
| Live source commit | **`734429e`** (`test(lab): pin roadmap release versions to the shipped catalog version`) | `origin/main`, 2026-11-03 05:05:55 +0000; live `/data/lab-apps.json` and `/data/apps.json` byte-identical to that tree |
| Deploying workflow run | **41581889608** (success) | GitHub Actions API, created 05:06:00Z, completed 05:10:14Z |
| Cloudflare deploy job window | 05:08:03Z → 05:10:13Z | GitHub Actions job metadata |
| Cloudflare deployment ID for `734429e` | **NOT YET RECORDED** | Pages API returns `403 / code 10000` with the agent token; see §3 |
| Previous frontend regression fix | **`c60cfa7`**, preceded by **`3055dbb`** | git history, 2026-11-02 19:37:25 +0000 |

---

## 3. Deployment → commit mapping

| Cloudflare deployment ID | Source commit | Alias | Deployed (UTC) | Assets |
|---|---|---|---|---|
| `56bea799-6746-4f5c-a15e-2e95d8b267d2` | `c60cfa7` | https://56bea799.appmintly.pages.dev | 2026-11-02T19:41:00Z | 301 uploaded |
| **NOT YET RECORDED** | `734429e` | — | ~2026-11-03T05:10Z (job window only) | — |
| `dd594163` | `78e3f40` | https://dd594163.appmintly.pages.dev | 2026-11-01T09:07:37Z | 110 uploaded |

**Do not attribute `56bea799` to `734429e`.** `56bea799` served `c60cfa7`; the metadata commit shipped separately.

How `56bea799 → c60cfa7` was proven (2026-11-03, read-only):
1. Deployment alias homepage was **byte-identical** to `appmintly.pages.dev` (sha256 `a0e22c09a9b8…`), including the same random per-build Next marker `<!--ujZu_kcMvPX_zAnbBc_iQ-->`. That marker is regenerated per build, so identical bytes mean production serves exactly that deployment's artifact.
2. All five shipped data files on the alias were **byte-identical** to the `c60cfa7` tree, and `lab-apps.json` carried `v2.1.3`, which does not exist at `c60cfa7^`.
3. Upload count reconciled exactly: 293 build files + 8 catalog data copies = **301**.
4. Reported timestamp 01:11 IST = `2026-11-02T19:41:00Z`, inside the CF job window.

**To record a missing deployment ID** (owner action, ~30s): Cloudflare Dashboard → Workers & Pages → **appmintly** → **Deployments** → top **Production** row on branch `main`. Capture its **ID**, **Created** time and commit message, then add a row above. The deployment alias follows the pattern `https://<first-8-of-id>.appmintly.pages.dev` and can be used to re-prove identity by byte comparison.

---

## 4. The 2026-11-02 frontend regression (resolved)

**Symptom.** The public site rendered as unstyled HTML: no CSS, broken logos, stacked footer/nav, and taps landing on "Page not found".

**Root cause.** `.github/workflows/events-static-feed.yml` built the site **once** with `NEXT_PUBLIC_BASE_PATH=/appmintly-platform` and then deployed that same `out/` to the Cloudflare Pages project, which serves at the root. Every `/appmintly-platform/_next/*` and `/appmintly-platform/brand/*` request 404'd, so CSS/JS never loaded and `next/link` never hydrated; base-path `href`s then produced the 404 page. `deploy.yml` was never wrong — it has always built twice, once per target.

**Fix.** Commit `3055dbb` gives the feed workflow one build per target (base-path → GitHub Pages, root-scoped → Cloudflare) and adds **fail-closed guards** that abort if a base-path bundle reaches Cloudflare or a root-scoped bundle reaches the mirror. `tests/deploy-scope.test.ts` locks the ordering in. Verified after deploy: **0** base-path references on all twelve routes, **95/95** assets 200 with correct MIME types, 32/32 homepage assets.

**Operational lesson.** A workflow that deploys must build for its own scope; never reuse another workflow's artifact across hosting targets with different prefixes.

---

## 5. PDFMiniFly 2.1.3 — genuine release and metadata

| Field | Value |
|---|---|
| App / package | PDFMiniFly / `com.appforge.pdfminifly` |
| Version | 2.1.3 (versionCode 20103) |
| Artifact | `PDFMiniFly-2.1.3.apk`, 313,198 bytes |
| SHA-256 | `822c54a76c7ae3ca2fee4e62fe1a1380d9546a6b299a5b25c352dde34feb5055` (matches catalog exactly) |
| Signing | `META-INF/APPMINTL.RSA` + `.SF` present; new code confirmed inside `classes.dex` |
| Release run / catalog commit | `41504332741` / `d9136b4` |
| Release event ID | `804733e4be8cac3476e7faf43a2975a7` |

Event traced across all four surfaces on 2026-11-02: Durable Object SQLite (read via `GET /events`, `x-ratelimit-mode: do`), `GET /events`, GitHub `public/data/events.json` (feed run `41504585201`, commit `efc9d32`), and public Pages — identical ID on each, byte-identical JSON between repo and Pages.

**Lab metadata correction.** The Lab card advertised `v2.1.2` after the catalog shipped 2.1.3. `data/upcoming-apps.json` held `releaseVersion: "2.1.2"` for `catalog-pdfminifly`, which feeds `components/UpcomingAppCard.tsx:426` and `releaseVersionOf()` in `lib/notifications/engine`. The automated `lab-sync` commit `d45645c` corrected the value at 2026-11-03 01:00Z, **but that commit was pushed with the default `GITHUB_TOKEN`, which does not trigger other workflows, so no deploy ever shipped it** and production kept serving the old card. Commit `734429e` adds the durable guard, `tests/lab-release-version.test.ts`, and the following deploy shipped both. Live `/lab` now renders `v2.1.3 · Released 1 Mar 2026`, with 0 occurrences of `v2.1.2`.

---

## 6. Verification results (dated)

| Check | Result | Date / method |
|---|---|---|
| Full unit suite | **633/633 pass** | 2026-11-03, `vitest run` on `734429e` |
| TypeScript | clean (`tsc --noEmit` exit 0) | 2026-11-03 |
| ESLint | 0 errors, 14 pre-existing warnings | 2026-11-03 |
| Static export | builds, **293 files** | 2026-11-03, root-scoped `NEXT_OUTPUT=export` after `rm -rf app/api` |
| Lab card version | `v2.1.3`, 0 × `v2.1.2` | 2026-11-03, live HTML + DOM chip + `innerText` |
| Routes | **12/12 → 200**, 0 base-path refs (`/`, `/explore/`, `/categories/`, `/lab/`, `/library/`, `/app/pdfminifly/`, `/app/cineflow/`, `/collections/`, `/collections/local-first/`, `/compare/`, `/updates/`, `/about/`) | 2026-11-03, live HTTP |
| Assets | **95/95 → 200**, MIME correct; homepage 32/32 | 2026-11-03, live HTTP across all twelve routes |
| Mobile 390×844 | 0 broken images, 0 console errors, 0 failed requests, 0 horizontal overflow | 2026-11-03, headless Chrome/CDP, fresh + warm + SW-controlled sessions |
| Bottom navigation | exactly Home / Explore / Categories / Lab / Library, fixed bar | 2026-11-03, DOM measurement |
| Catalog integrity | pdfminifly 2.1.3, one record, no duplicate slugs, 7 of 8 apps published | 2026-11-03, live `/data/apps.json` |
| Event feed | 2 events, no duplicate IDs | 2026-11-03, live `/data/events.json` |
| Lab sync invariant | regression test fails 2/4 with the stale value, passes 4/4 with the fix | 2026-11-03, negative control |

---

## 7. Production architecture and protected systems

**Do not modify without explicit owner approval:** the Cloudflare Worker (`appmintly-publisher-api`), its Durable Object, KV bindings, secrets, billing/plan, Android signing configuration, or the release/event architecture.

| System | State of record |
|---|---|
| Worker deployment / version | `fc513b0a` / `f7bf00de`, 100% traffic, created 2026-11-02T18:18:59Z |
| Bindings | `EVENTS` (KV, **legacy but required**), `EVENTS_ADMISSION` (DO), `ADMIN`, `SUBMISSIONS` |
| Secrets (names only) | `APPMINTLY_EVENTS_EMISSION_SECRET`, `APPMINTLY_EXPORT_KEY`, `APPMINTLY_GITHUB_TOKEN`, `APPMINTLY_PUBLISH_KEY`, `ADMIN_SESSION_SECRET` |
| Event ingress | `POST /events/publish`, HMAC-SHA256 over the exact raw body (`x-appmintly-events-signature`) |
| Event ID | `sha256(appId\|platform\|version\|catalogRevision)`, hex, first 32 chars — retries are inherently idempotent (`201 stored` / `200 duplicate`) |
| Hosting | Cloudflare Pages project `appmintly`, free tier |

**`EVENTS` KV must stay bound.** `handleEventsPublish` opens with `if (!env.EVENTS) eventsError(503, …)` (`worker/worker.js:2317`); nothing is written there any more, but removing the namespace 503s every event route.

**Free-only requirement.** The account is Workers Free with no payment method. Never enable paid services, overages or billing changes.

---

## 8. Known limitations and pending manual items

1. **Cloudflare deployment IDs are unreadable by the agent token** — the Pages API answers `403 / code 10000`, and `wrangler pages deployment list` needs Pages read. IDs must be recorded manually from the dashboard (§3).
2. **`734429e` deployment ID: NOT YET RECORDED.**
3. **Automated `lab-sync` / data commits do not deploy — and its own header says otherwise.** `sync-lab.yml` documents "The committed data/** change then triggers the standard Pages deploy (deploy.yml) — no separate deployment path exists." That is **false in practice**: the workflow checks out with plain `actions/checkout@v4` (no PAT) and pushes with the default `GITHUB_TOKEN`, and GitHub deliberately does not let `GITHUB_TOKEN` pushes trigger other workflows. Verified 2026-11-03: no `deploy.yml` run exists for `d45645c` even though it changed three `data/**` files that match the deploy paths; the only workflow run at 01:01:47Z was `events-static-feed` with `event=schedule`, not `push`. Consequence: automated data corrections sit in `main` but never reach production until a human dispatches `deploy.yml` or another qualifying push lands. Check this first whenever an automated data fix appears to have no effect.
4. `/data/upcoming-apps.json` returns 404 by design — the deploy copies eight data files, and `/lab` bakes the roadmap at build time.
5. Cloudflare plan/usage cannot be read via API with the current token; the free tier is owner-verified in the dashboard, not machine-verified here.
6. There is no root `README.md`; this document is the entry point.

---

## 9. Rules for future agents (mandatory)

1. AppMintly is an **existing production project**. Never rebuild, overwrite or redesign working features without explicit authorization.
2. Preserve the public bottom navigation exactly: **Home / Explore / Categories / Lab / Library**.
3. Keep the Publisher Console **private**; never expose it or its credentials publicly.
4. Never touch the Worker, Durable Objects, KV bindings or secrets without explicit approval. Never rotate a secret on your own initiative.
5. Preserve the genuine release and event-emission architecture described in §5 and §7.
6. Respect the **₹0 / free-only** requirement. No paid services, plans, overages or billing changes.
7. **Never claim a test, deployment or verification passed without evidence.** Distinguish **IMPLEMENTED → TESTED → COMMITTED → PUSHED → DEPLOYED → LIVE VERIFIED**, and stop at the stage the evidence supports.
8. Inspect the actual repository and live state before changing anything; do not assume a previous report reflects `main`.
9. Make narrow changes, add tests, review the full diff, and avoid unrelated edits.
10. Check workflow triggers before pushing. `deploy.yml` runs on pushes touching `data/**`, `app/**`, `components/**`, `lib/**`, `public/**`, `next.config.ts`, `package*.json` or itself; a **`docs/**`-only commit does not deploy**.
11. Never force-push, never rewrite published history.
12. When a fix appears live but a value is stale (or vice versa), re-derive the state from hashes and live responses — not from workflow conclusions.

---

## 10. Maintaining this document

- Update **only** with new evidence, and add a dated row to the log below.
- Never invent deployment IDs, timestamps or test results. Unverified items are marked `NOT YET RECORDED`, `BLOCKED` or `PENDING`.
- Keep the document a summary; detail belongs in commit messages and the component READMEs.

### Evidence log

| Date (UTC) | Change / verification | Source |
|---|---|---|
| 2026-11-01 09:07Z | `78e3f40` live, deployment `dd594163`, 110 assets | GitHub run 41291437990 + CF deploy output |
| 2026-11-02 18:18Z | Worker rotated to deployment `fc513b0a` / version `f7bf00de` | Cloudflare deployments API |
| 2026-11-02 18:51Z | PDFMiniFly 2.1.3 released, catalog `d9136b4`, APK sha `822c54a7…` | Release run 41504332741; APK re-downloaded and hashed |
| 2026-11-02 18:54Z | Release event `804733e4be8cac3476e7faf43a2975a7` on all four surfaces | `/events`, `public/data/events.json`, Pages, feed run 41504585201 |
| 2026-11-02 19:41Z | Frontend regression fixed and deployed: `c60cfa7` as `56bea799`, 301 assets, 0 base-path refs | Alias/production byte comparison, data-file hashes, upload-count reconciliation |
| 2026-11-03 01:00Z | `lab-sync d45645c` corrected the Lab version but never deployed: default `GITHUB_TOKEN` push triggers nothing | No `deploy.yml` run for `d45645c`; feed run at 01:01:47Z was `event=schedule`; `sync-lab.yml` uses `actions/checkout@v4` without a PAT |
| 2026-11-03 05:10Z | `734429e` deployed via run 41581889608; Lab card `v2.1.3` live, 633/633 tests | Live HTML/DOM, data-file hashes vs tree, GitHub run metadata |
