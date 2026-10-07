import os as _os
_PWD = _os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
#!/usr/bin/env python3
"""Debug: check admin user's wp_capabilities meta."""
import json, urllib.request, http.cookiejar

BASE = "http://localhost:4321"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

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

# Query wp_usermeta for admin user's capabilities
st, body = req("POST", "/admin-ext/api/db-console/exec", json.dumps({"sql": "SELECT user_id, meta_key, meta_value FROM wp_usermeta WHERE meta_key = 'wp_capabilities' AND user_id = 1", "confirmWrite": False}))
print(f"Query wp_capabilities: HTTP {st}")
print(body.decode("utf-8", "replace")[:500])

# Also check what user data we have
st, body = req("POST", "/admin-ext/api/db-console/exec", json.dumps({"sql": "SELECT ID, user_login, display_name FROM wp_users LIMIT 5", "confirmWrite": False}))
print(f"\nQuery wp_users: HTTP {st}")
print(body.decode("utf-8", "replace")[:500])

# Check all usermeta for user_id=1
st, body = req("POST", "/admin-ext/api/db-console/exec", json.dumps({"sql": "SELECT meta_key, meta_value FROM wp_usermeta WHERE user_id = 1", "confirmWrite": False}))
print(f"\nAll usermeta for user 1: HTTP {st}")
print(body.decode("utf-8", "replace")[:800])
