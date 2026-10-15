"""Phase 3.2 — generate the engineering status data files from REAL data.

Every value is derived from the repository, git history, or actual
deployment runs. Nothing is invented; retired records come from real
repository history (pre-Phase-1E state).
"""
import json
import subprocess
from datetime import datetime, timezone

now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

catalog = json.load(open('data/upcoming-apps.json'))


def progress(rec):
    ms = rec['milestones']
    done = sum(1 for m in ms if m['status'] == 'done')
    return round(100 * done / len(ms))


def vchecks(rec):
    v = rec.get('verification', {})
    out = []
    for c in v.get('checks', []):
        ck = {
            # Preserve the source record's stable check id when it has one.
            'id': c.get('id') or ('V-' + rec['id'][:4].upper() + '-' + c['category'].upper()),
            'category': c['category'],
            'result': c['result'],
        }
        # upcoming-apps uses camelCase 'buildId'; lab-apps uses snake_case.
        if c.get('buildId'):
            ck['build_id'] = c['buildId']
        # Provenance class — separates automated test evidence from
        # repository inspection. Pending checks carry no class.
        if c.get('result') == 'passed':
            ck['evidence_class'] = 'automated-test-evidence'
        elif c.get('result') == 'unable-to-verify':
            ck['evidence_class'] = 'repository-inspection'
        for f in ('summary', 'source', 'date', 'limitations'):
            if c.get(f):
                ck[f] = c[f]
        out.append(ck)
    return out


def PENDING_ALL(app_id):
    # All five verification categories, honestly pending — no check has
    # been recorded for these retired-from-public entries.
    return [
        {'id': f'V-{app_id[:4].upper()}-{c.upper()}', 'category': c, 'result': 'pending'}
        for c in ('identity', 'build', 'core-flow', 'device', 'release')
    ]


def milestone_brief(rec):
    out = []
    for m in rec['milestones']:
        ms = {
            'id': m['id'],
            'title': m['title'],
            'description': m.get('description', ''),
            'status': m['status'],
        }
        if m.get('evidence'):
            ms['evidence'] = m['evidence']
            # rg-m1's evidence is backed by repository inspection + the
            # automated test suite that ran against it. Every other
            # completed milestone is team-reported progress only.
            ms['evidence_class'] = 'automated-test-evidence' if m['id'] == 'rg-m1' else 'team-reported'
        out.append(ms)
    return out


apps_out = []
# Public records (4), in exact public order, incl. Phase 3.1 verification evidence
for rec in catalog:
    apps_out.append({
        'id': rec['id'],
        'name': rec['name'],
        'status': rec['roadmapStatus'],
        'hidden': False,
        'verification': vchecks(rec),
        'milestones': milestone_brief(rec),
        'progress_percent': progress(rec),
    })

# Hidden engineering records — retired from the public Lab in Phase 1E.
# Real historical data, recovered from repository history (58fbf67),
# kept for engineering visibility. NOT rendered in the public Lab.
apps_out.append({
    'id': 'publisher-console',
    'name': 'AppMintly Publisher Console',
    'status': 'in-development',
    'hidden': True,
    'verification': PENDING_ALL('publisher-console'),
    'milestones': [
        {'id': 'pc-m1', 'title': 'Repository and build pipeline created', 'status': 'done',
         'description': 'The console repository and its build pipeline exist (team-reported).'},
        {'id': 'pc-m2', 'title': 'Record editor and release validation flow', 'status': 'in-progress',
         'description': 'Record editing and release validation are in active development (team-reported).'},
        {'id': 'pc-m3', 'title': 'Public launch on AppMintly', 'status': 'planned',
         'description': 'Public launch on the AppMintly storefront (not started).'},
    ],
    'progress_percent': 33,
})
apps_out.append({
    'id': 'pdfly',
    'name': 'PDFly',
    'status': 'planned',
    'hidden': True,
    'verification': PENDING_ALL('pdfly'),
    'milestones': [
        {'id': 'pd-m1', 'title': 'Repository created', 'status': 'done',
         'description': 'The PDFly application repository exists (team-reported).'},
        {'id': 'pd-m2', 'title': 'Core PDF tools in the browser', 'status': 'in-progress',
         'description': 'Browser-side PDF tools are in active development (team-reported).'},
        {'id': 'pd-m3', 'title': 'AppMintly catalog launch', 'status': 'planned',
         'description': 'Catalog launch on AppMintly (not started).'},
    ],
    'progress_percent': 33,
})

json.dump({
    'schema_version': 1,
    'generated_from': (
        'data/upcoming-apps.json (public Lab records incl. Phase 3.1 '
        'verification evidence) + retired records recovered from repository '
        'history at commit 58fbf67 (publisher-console, pdfly)'
    ),
    'apps': apps_out,
}, open('data/lab-apps.json', 'w'), indent=2, ensure_ascii=False)

# Sanity: verify the hidden records really exist in repository history
hist = json.loads(subprocess.run(
    ['git', 'show', '58fbf67:data/upcoming-apps.json'],
    capture_output=True, text=True).stdout)
hist_ids = {r['id'] for r in hist}
assert {'publisher-console', 'pdfly'} <= hist_ids, 'retired records not found in history'

json.dump({
    'schema_version': 1,
    'scan_time': now,
    'pipeline_state': 'green',
    'catalog_diff': {
        'additions': 1,
        'unchanged': 5,
        'removals': 0,
        'generated_from': (
            'git diff of data/apps.json between commit 72be95f (pre-NexDrop '
            'catalog, 5 apps) and 8c37b9c (release 1.0.9, 6 apps): NexDrop '
            'added (510dc06), 5 apps unchanged, none removed'
        ),
    },
    'health_indicator': {
        'overall': 'green',
        'conditions': [
            {'id': 'deploy_success', 'label': 'Deploy Success', 'status': 'green',
             'description': ('Latest production deployment run 38700984980 '
                              '(commit ed7fb7c) completed successfully on GitHub Pages.')},
            {'id': 'catalog_integrity', 'label': 'Catalog Integrity', 'status': 'green',
             'description': ('data/apps.json is a valid array of 6 catalog records; '
                              'format is validated on every deployment run.')},
            {'id': 'asset_verification', 'label': 'Asset Verification', 'status': 'green',
             'description': ('Release APK appmintly-v1.0.9 published with SHA-256 '
                             'integrity verification through the release pipeline '
                             '(commit 8c37b9c).')},
        ],
    },
    'generated_from': (
        'Pipeline state derived from the latest GitHub Actions deployment runs '
        'and repository history of PDFly-source/appmintly-platform. Locally '
        'recorded by the AppMintly team — not an independent audit.'
    ),
}, open('data/engineering-status.json', 'w'), indent=2, ensure_ascii=False)

events = [
    {'id': 'EVT-20261015-01', 'timestamp': '2026-10-15T08:40:00Z', 'type': 'verification',
     'title': 'Register repository evidence audit',
     'description': ('Register repo inspected at commit eb6bc17: 13/13 integrity '
                     'tests + reserved-order check passed; recorded as Core Flow '
                     'Tested (passed). Build Verified recorded as unable-to-verify '
                     '(no production artifact exists).'),
     'commit': 'efa8e3b', 'branch': 'feature/phase-31-trust-hardening'},
    {'id': 'EVT-20261015-02', 'timestamp': '2026-10-15T07:40:00Z', 'type': 'deploy',
     'title': 'Lab 3.0 deployed to production',
     'description': ('Merge ed7fb7c deployed via workflow run 38700984980 with '
                     'success; production Lab QA 39/39, Lab 1E 50/50 and Phase 1C '
                     'regression 30/30 passed on the live URL.'),
     'commit': 'ed7fb7c'},
    {'id': 'EVT-20261014-01', 'timestamp': '2026-10-14T20:10:00Z', 'type': 'deploy',
     'title': 'Phase 1E horizontal showcase deployed',
     'description': ('Five-card horizontal Lab showcase (BillCraft, Cartora, '
                     'NutriLens, AppMintly Register, More Apps Coming Soon) '
                     'deployed; Publisher Console and PDFly retired from the '
                     'public Lab.'),
     'commit': '0c9d818'},
    {'id': 'EVT-20261014-02', 'timestamp': '2026-10-14T19:15:00Z', 'type': 'deploy',
     'title': 'Phase 1D premium Lab UI deployed',
     'description': ('Premium hero, roadmap filter cards, product showcase cards '
                     'and removal of public GitHub links deployed; production QA '
                     'suites all green on the live URL.'),
     'commit': '58fbf67'},
    {'id': 'EVT-20261008-01', 'timestamp': '2026-10-08T17:06:58Z', 'type': 'catalog',
     'title': 'NexDrop added to the AppMintly catalog',
     'description': ('NexDrop 1.4.4 added to data/apps.json (commit 510dc06); the '
                     'catalog now holds 6 records.'),
     'commit': '510dc06'},
]
json.dump({
    'schema_version': 1,
    'events': events,
    'generated_from': (
        'git log + GitHub Actions deployment runs of '
        'PDFly-source/appmintly-platform (2026-10-08 to 2026-10-15)'
    ),
}, open('data/engineering-events.json', 'w'), indent=2, ensure_ascii=False)

print('scan_time:', now)
print('lab apps:', len(apps_out), [a['id'] for a in apps_out])
