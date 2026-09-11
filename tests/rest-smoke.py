"""Read-only integration checks against the existing project's public API."""
import concurrent.futures
import json
import pathlib
import re
import urllib.request
import urllib.error

source = pathlib.Path('app.js').read_text()
url = re.search(r'const SUPABASE_URL = "([^"]+)"', source)[1]
key = re.search(r'const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"', source)[1]
headers = {'apikey': key}
if key.startswith('eyJ'): headers['Authorization'] = 'Bearer '+key

def check(path, expected):
    request = urllib.request.Request(url+path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            status, body = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, body = error.code, json.load(error)
    assert status in expected, (path, status)
    if path.startswith('/rest/v1/') and status == 200:
        assert isinstance(body, list), path
        if any(name in path for name in ['favorites','price_alerts','admin_audit_logs']):
            assert body == [], 'Private data visible to guest'
    print('PASS', path.split('?')[0], status)

paths = [('/rest/v1/deals?select=id,name,currency,status&limit=1',{200}),
         ('/rest/v1/categories?select=id,slug&limit=1',{200}),
         ('/rest/v1/favorites?select=deal_id&limit=1',{200,401,403}),
         ('/rest/v1/price_alerts?select=id&limit=1',{200,401,403}),
         ('/rest/v1/admin_audit_logs?select=id&limit=1',{200,401,403}),
         ('/auth/v1/settings',{200})]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(lambda args: check(*args), paths))
