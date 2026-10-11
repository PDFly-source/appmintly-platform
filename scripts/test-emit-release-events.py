#!/usr/bin/env python3
"""Tests for scripts/emit-release-events.py using a local mock Worker +
mock live catalog. Covers: seed emission, idempotent re-run, downgrade
never emits, draft/demo/archived never emit, worker 500 fails closed,
catalog unreachable fails closed, missing secret fails closed, HMAC is
verified by the receiving side.
"""
import hashlib
import hmac
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = "unit-test-emission-secret-0123456789abcdef"
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "emit-release-events.py")

state = {"latest": {}, "bad_publish": False}
sigs_ok = [0, 0]  # [verified, rejected]


def make_catalog(appmintly_version, studyria_version, publish_app2=True):
    apps = [{
        "id": "appmintly", "slug": "appmintly", "name": "AppMintly",
        "type": "android apk", "published": True,
        "apk": {"versionName": appmintly_version},
    }, {
        "id": "studyria", "slug": "studyria", "name": "Studyria",
        "type": "web app", "published": publish_app2, "version": studyria_version,
    }, {
        "id": "draftapp", "slug": "draftapp", "name": "Draft", "status": "draft",
        "published": True, "version": "1.0.0", "apk": {"versionName": "1.0.0"},
    }, {
        "id": "demoapp", "slug": "demoapp", "name": "Demo", "isDemo": True,
        "published": True, "version": "9.9.9", "apk": {"versionName": "9.9.9"},
    }, {
        "id": "archivedapp", "slug": "archivedapp", "name": "Old", "status": "archived",
        "published": True, "version": "2.0.0", "apk": {"versionName": "2.0.0"},
    }]
    return apps


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/catalog"):
            self._send(200, state["catalog"])
        elif self.path.startswith("/events/latest"):
            self._send(200, {"latest": state["latest"]})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/events/publish":
            self._send(404, {"error": "not found"})
            return
        if state["bad_publish"]:
            self._send(500, {"error": "worker down"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        given = self.headers.get("X-AppMintly-Events-Signature", "")
        expect = "sha256=" + hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(given, expect):
            sigs_ok[1] += 1
            self._send(401, {"error": "bad signature"})
            return
        sigs_ok[0] += 1
        ev = json.loads(raw)
        if ev.get("appId") == "draftapp" or ev.get("appId") == "demoapp" or ev.get("appId") == "archivedapp":
            self._send(400, {"error": "should never be emitted"})
            return
        state["emitted"].append(ev)
        app_id, platform, version = ev["appId"], ev["platform"], ev["version"]
        state["latest"].setdefault(app_id, {})[platform] = {"version": version}
        self._send(201, {"status": "stored", "eventId": "test"})


def start_server():
    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run_emitter(env_extra, expect_ok):
    env = dict(os.environ)
    env.update({
        "EMIT_TEST_MODE": "1",
        "EVENT_EMISSION_SECRET": env_extra.get("EVENT_EMISSION_SECRET", SECRET),
        "EMIT_TEST_CATALOG_URL": "http://127.0.0.1:%d/catalog" % PORT[0],
        "EMIT_TEST_WORKER_URL": "http://127.0.0.1:%d" % PORT[0],
        "GITHUB_SHA": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    })
    env.pop("CLOUDFLARE_API_TOKEN", None)
    env.update(env_extra)
    r = subprocess.run([sys.executable, SCRIPT], capture_output=True, text=True, env=env)
    ok = (r.returncode == 0) if expect_ok else (r.returncode != 0)
    return ok, r


PORT = [0]
srv = start_server()
PORT[0] = srv.server_address[1]
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print("PASS " + name)
    else:
        failed += 1
        print("FAIL " + name + (" :: " + detail if detail else ""))


# 1. Seed run: emits for published apps only, correct platforms
state["emitted"] = []
state["catalog"] = make_catalog("1.0.7", "2.0.2")
ok, r = run_emitter({}, True)
check("seed run succeeds", ok, r.stderr[-300:])
ids = sorted((e["appId"], e["platform"]) for e in state["emitted"])
check("seed emits exactly appmintly+studyria", ids == [("appmintly", "android"), ("studyria", "web")], str(ids))
check("draft/demo/archived never emitted",
      all(e["appId"] not in ("draftapp", "demoapp", "archivedapp") for e in state["emitted"]))
check("HMAC verified by receiver", sigs_ok[0] >= 2 and sigs_ok[1] == 0, str(sigs_ok))

# 2. Idempotent re-run: nothing new
state["emitted"] = []
ok, r = run_emitter({}, True)
check("re-run succeeds", ok, r.stderr[-300:])
check("re-run emits nothing", len(state["emitted"]) == 0, str(state["emitted"]))

# 3. Downgrade (rollback) never emits
state["catalog"] = make_catalog("1.0.6", "2.0.2")
state["emitted"] = []
ok, r = run_emitter({}, True)
check("downgrade run succeeds", ok, r.stderr[-300:])
check("downgrade emits nothing", len(state["emitted"]) == 0, str(state["emitted"]))
check("downgrade is logged as skipped", "EMIT-SKIP-DOWNGRADE appmintly" in r.stdout, r.stdout[-300:])

# 4. New version emits
state["catalog"] = make_catalog("1.0.8", "2.0.2")
state["emitted"] = []
ok, r = run_emitter({}, True)
check("upgrade emits one event", ok and len(state["emitted"]) == 1
      and state["emitted"][0]["version"] == "1.0.8", r.stdout[-300:])

# 5. Worker 500 -> fail closed
state["bad_publish"] = True
state["catalog"] = make_catalog("1.0.9", "2.0.2")
ok, r = run_emitter({}, False)
check("worker failure fails the run", ok, r.stderr[-200:])
state["bad_publish"] = False

# 6. Missing secret -> fail closed
ok, r = run_emitter({"EVENT_EMISSION_SECRET": ""}, False)
check("missing secret fails the run", ok, r.stderr[-200:])

# 7. Catalog unreachable -> fail closed
ok, r = run_emitter({"EMIT_TEST_CATALOG_URL": "http://127.0.0.1:1/catalog"}, False)
check("catalog unreachable fails the run", ok, r.stderr[-200:])

srv.shutdown()
print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
