import os, json, sys
import urllib.request

acc = '3cc2a37439a83174231f9d3f617db711'
token = os.environ['CLOUDFLARE_API_TOKEN']
src = open('worker.js', 'rb').read()
meta = {
    "main_module": "worker.js",
    "compatibility_date": "2026-09-01",
    "observability": {"enabled": True},
}
boundary = '----appmintly-deploy-9f2c'
body = (
    f'--{boundary}\r\n'
    'Content-Disposition: form-data; name="metadata"\r\n'
    'Content-Type: application/json\r\n\r\n'
    + json.dumps(meta) + '\r\n'
    f'--{boundary}\r\n'
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
    'Content-Type: application/javascript+module\r\n\r\n'
).encode() + src + f'\r\n--{boundary}--\r\n'.encode()

req = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{acc}/workers/scripts/appmintly-publisher-api",
    data=body,
    method='PUT',
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    },
)
try:
    with urllib.request.urlopen(req) as res:
        d = json.loads(res.read())
        print('status:', res.status, '| success:', d.get('success'))
        if d.get('success'):
            r = d.get('result') or {}
            print('script id:', r.get('id'))
        else:
            print('errors:', d.get('errors'))
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:600])
