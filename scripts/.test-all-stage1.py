import os as _os
_PWD = _os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
#!/usr/bin/env python3
"""Stage 1: Login + get plugin list."""
import json, urllib.request, http.cookiejar

BASE = "http://localhost:4321"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "plugin-test/1.0")]

def req(method, path, data=None):
    url = BASE + path
    body = None
    h = {}
    if data is not None:
        if isinstance(data, dict):
            body = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
        else:
            body = data.encode() if isinstance(data, str) else data
            h["Content-Type"] = "application/x-www-form-urlencoded"
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

# Login
st, _ = req("POST", "/api/auth/login", "username=admin&password=" + _PWD + "")
print(f"Login: {st}")

# Plugin manager list
st, body = req("GET", "/admin-ext/api/plugin-manager/list")
data = json.loads(body)
plugins = data.get("plugins", [])
print(f"Plugins: {len(plugins)}")
for p in plugins:
    print(f"  {p.get('name','?'):30s} state={p.get('state','?')}")

# Save for later stages
with open("scripts/.plugin-list.json", "w") as f:
    json.dump(plugins, f, ensure_ascii=False, indent=2)
print("Saved to scripts/.plugin-list.json")
