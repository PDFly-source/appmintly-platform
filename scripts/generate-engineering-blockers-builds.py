#!/usr/bin/env python3
"""Phase 3.2 — data/engineering-builds.json + blockers in engineering-status.

Regenerates the build/release tracker and blocker records. Every value is
a REAL recorded fact: workflow runs come from the GitHub Actions API for
PDFly-source/appmintly-platform (ids, commits, conclusions, timestamps are
verbatim), and blockers are the limitations documented during Phase
1A–3.1 verification work. Nothing here is invented; if a build has not
been recorded, it does not appear.
"""
import json
from datetime import datetime, timezone

# Real workflow runs (fetched from the GitHub Actions API on 2026-10-15).
BUILDS = [
    {
        'id': 'b-38706256721',
        'kind': 'deploy',
        'name': 'Deploy AppMintly to GitHub Pages (Phase 3.1 release)',
        'commit': '6619731',
        'workflow_run_id': 38706256721,
        'outcome': 'success',
        'timestamp': '2026-10-15T08:31:20Z',
        'scope': 'appmintly-platform production (GitHub Pages)',
        'source': 'GitHub Actions run 38706256721',
    },
    {
        'id': 'b-38700984980',
        'kind': 'deploy',
        'name': 'Deploy AppMintly to GitHub Pages (Lab 3.0)',
        'commit': 'ed7fb7c',
        'workflow_run_id': 38700984980,
        'outcome': 'success',
        'timestamp': '2026-10-15T07:46:09Z',
        'scope': 'appmintly-platform production (GitHub Pages)',
        'source': 'GitHub Actions run 38700984980',
    },
    {
        'id': 'b-38697261156',
        'kind': 'deploy',
        'name': 'Deploy AppMintly to GitHub Pages (Lab 1E showcase)',
        'commit': '0c9d818',
        'workflow_run_id': 38697261156,
        'outcome': 'success',
        'timestamp': '2026-10-15T07:13:03Z',
        'scope': 'appmintly-platform production (GitHub Pages)',
        'source': 'GitHub Actions run 38697261156',
    },
    {
        'id': 'b-38618387766',
        'kind': 'deploy',
        'name': 'Deploy AppMintly to GitHub Pages (Phase 1D)',
        'commit': '58fbf67',
        'workflow_run_id': 38618387766,
        'outcome': 'success',
        'timestamp': '2026-10-14T18:49:10Z',
        'scope': 'appmintly-platform production (GitHub Pages)',
        'source': 'GitHub Actions run 38618387766',
    },
    {
        'id': 'b-38533313370',
        'kind': 'release',
        'name': 'Release AppMintly v1.0.9',
        'commit': '4c50bb9',
        'workflow_run_id': 38533313370,
        'outcome': 'success',
        'timestamp': '2026-10-14T08:10:57Z',
        'scope': 'AppMintly Android APK v1.0.9 (signed release build)',
        'source': 'GitHub Actions run 38533313370',
    },
]

# Blockers documented during verified work — no invented blockers.
BLOCKERS = [
    {
        'id': 'blk-apk-server-fetch',
        'app': 'appmintly-platform',
        'reason': 'The GitHub release host blocks browser-side artifact fetches (CORS / HTTP 503), so server-mode APK verification cannot complete in production browsers.',
        'status': 'open',
        'note': 'File-mode verification is the supported fallback; the UI shows an explicit fetch-failure diagnostic. No backend will be added to bypass this.',
        'recorded_at': '2026-10-15',
    },
    {
        'id': 'blk-evidence-billcraft',
        'app': 'billcraft',
        'reason': 'No repository, build artifact, or verification evidence is available to the pipeline yet, so all verification checks remain pending.',
        'status': 'open',
        'note': 'Verification stays honestly pending until real evidence is supplied.',
        'recorded_at': '2026-10-15',
    },
    {
        'id': 'blk-evidence-cartora',
        'app': 'cartora',
        'reason': 'No repository, build artifact, or verification evidence is available to the pipeline yet, so all verification checks remain pending.',
        'status': 'open',
        'note': 'Verification stays honestly pending until real evidence is supplied.',
        'recorded_at': '2026-10-15',
    },
    {
        'id': 'blk-evidence-nutrilens',
        'app': 'nutrilens',
        'reason': 'No repository, build artifact, or verification evidence is available to the pipeline yet, so all verification checks remain pending.',
        'status': 'open',
        'note': 'Verification stays honestly pending until real evidence is supplied.',
        'recorded_at': '2026-10-15',
    },
    {
        'id': 'blk-register-webapp-artifact',
        'app': 'register',
        'reason': 'The register repository contains registry tooling only; no production build artifact for the planned Register webapp exists yet, so Build Verified is unable-to-verify.',
        'status': 'open',
        'note': 'The webapp is in the Planned roadmap stage; the check will move out of unable-to-verify when a real artifact exists.',
        'recorded_at': '2026-10-15',
    },
]

builds = {
    'schema_version': 1,
    'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'builds': BUILDS,
    'generated_from': 'GitHub Actions API runs for PDFly-source/appmintly-platform (verbatim ids, commits, conclusions, timestamps)',
}

with open('data/engineering-builds.json', 'w') as f:
    json.dump(builds, f, indent=2, ensure_ascii=False)
    f.write('\n')

# Blockers live with the engineering status record.
with open('data/engineering-status.json') as f:
    status = json.load(f)
status['blockers'] = BLOCKERS
with open('data/engineering-status.json', 'w') as f:
    json.dump(status, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('builds:', len(BUILDS), '| blockers:', len(BLOCKERS))
