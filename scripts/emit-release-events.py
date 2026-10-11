#!/usr/bin/env python3
"""Stage 1 (no FCM) — release-event emitter. Fail-closed and idempotent.

Runs as the final job of deploy.yml, ONLY after both public deployments
succeed. Flow:
  1. Verify the LIVE catalog is actually serving (https GET, retries).
  2. Read the Worker's public latest-event map (what is already recorded).
  3. For every PUBLISHED catalog entry: emit an HMAC-SHA256-signed event
     only when its version is strictly NEWER than the recorded one.
     Re-runs emit nothing; downgrades/rollbacks never emit; draft/demo/
     archived entries never emit.
  4. A failed verification or a rejected event fails this step (visible),
     so a release event can never exist for a failed deployment.

The shared secret lives ONLY in the GitHub repo secret
EVENT_EMISSION_SECRET and the Worker secret APPMINTLY_EVENTS_EMISSION_SECRET.
It is never printed, logged, or written anywhere.
"""
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

CANONICAL_CATALOG_URL = "https://appmintly.pages.dev/data/apps.json"
CANONICAL_WORKER = "https://appmintly-publisher-api.sbn50088.workers.dev"
VERSION_RE = re.compile(r"^\d{1,5}\.\d{1,5}\.\d{1,5}$")
REVISION_RE = re.compile(r"^[0-9a-f]{7,40}$")


def die(msg):
    print("EMIT-ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def fetch_json(url, timeout=30, retries=3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            return e.code, {"error": e.read().decode("utf-8", "replace")[:300]}
        except Exception as e:  # transient network problem: bounded retry
            last = e
            time.sleep(2 ** attempt)
    die("network failure fetching " + url + ": " + repr(last))


def post_event(worker, secret, body):
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    sig = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        worker + "/events/publish",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-AppMintly-Events-Signature": sig,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode("utf-8", "replace")[:300]}


def semver_tuple(v):
    try:
        return tuple(int(x) for x in v.split("."))
    except Exception:
        return ()


def is_published_entry(a):
    if not isinstance(a, dict):
        return False
    if a.get("isDemo", False):
        return False
    status = str(a.get("status", "")).strip().lower()
    if status in ("draft", "archived"):
        return False
    published = a.get("published", True)
    if not published:
        return False
    app_id = str(a.get("id") or a.get("slug") or "")
    return bool(app_id) and app_id.strip() == app_id and app_id == app_id.strip()


def main():
    # Test hooks: only honored in explicit test mode, never in CI.
    test_mode = os.environ.get("EMIT_TEST_MODE") == "1"
    catalog_url = os.environ.get("EMIT_TEST_CATALOG_URL") if test_mode else CANONICAL_CATALOG_URL
    worker = os.environ.get("EMIT_TEST_WORKER_URL") if test_mode else CANONICAL_WORKER

    secret = os.environ.get("EVENT_EMISSION_SECRET", "")
    if len(secret) < 16 or secret != secret.strip() or secret.startswith("$"):
        die("EVENT_EMISSION_SECRET is missing or invalid. Set the GitHub repo "
            "secret to the same value as the Worker secret "
            "APPMINTLY_EVENTS_EMISSION_SECRET (min 16 chars).")

    # 1. The live catalog MUST be serving, or no event may exist.
    status, catalog = fetch_json(catalog_url)
    if status != 200 or not isinstance(catalog, list) or not catalog:
        die("live catalog not verified (HTTP %s) — refusing to emit any event." % status)
    print("EMIT-VERIFIED-CATALOG %s (%d entries)" % (catalog_url, len(catalog)))

    # 2. What the event log already records.
    status, latest = fetch_json(worker + "/events/latest")
    if status != 200 or not isinstance(latest, dict) or not isinstance(latest.get("latest"), dict):
        die("event log latest map unavailable (HTTP %s) — refusing to emit." % status)
    recorded = latest["latest"]

    revision = os.environ.get("GITHUB_SHA", "")
    if not REVISION_RE.match(revision):
        die("GITHUB_SHA not a valid catalog revision: refusing to emit.")
    ts = int(time.time())
    emitted, skipped = 0, 0

    for a in catalog:
        if not is_published_entry(a):
            continue
        app_id = str(a.get("id") or a.get("slug"))
        apk = a.get("apk") if isinstance(a.get("apk"), dict) else {}
        version = str(apk.get("versionName") or a.get("version") or "").strip()
        if not VERSION_RE.match(version):
            continue  # no valid release version -> nothing to notify about
        platform = "android" if str(apk.get("versionName") or "") else "web"
        name = str(a.get("name") or app_id).replace("\n", " ").strip()[:64]
        rec = (recorded.get(app_id) or {}).get(platform) or {}
        rec_version = str(rec.get("version") or "")
        if rec_version == version:
            skipped += 1
            continue  # idempotent re-run
        if rec_version and semver_tuple(rec_version) >= semver_tuple(version):
            skipped += 1
            print("EMIT-SKIP-DOWNGRADE %s %s %s -> %s" % (app_id, platform, rec_version, version))
            continue  # rollback/downgrade: NEVER a release event
        body = {
            "appId": app_id,
            "platform": platform,
            "version": version,
            "name": name,
            "catalogRevision": revision,
            "ts": ts,
        }
        status, resp = post_event(worker, secret, body)
        if status not in (200, 201) or str(resp.get("status")) not in ("stored", "duplicate"):
            die("event rejected for %s %s (HTTP %s): %s" % (app_id, version, status, resp))
        emitted += 1
        print("EMIT-%s %s %s %s" % (str(resp.get("status")).upper(), app_id, platform, version))

    print("EMIT-SUMMARY emitted=%d skipped=%d" % (emitted, skipped))


if __name__ == "__main__":
    main()
