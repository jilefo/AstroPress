#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按主题 id 激活主题（测试用）。用法: python scripts/activate-theme.py <id|base-theme>"""
import os
import json, sys, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost:4321"
target = sys.argv[1]
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def req(method, path, data=None, raw=None, ct=None):
    h = {}
    body = None
    if raw is not None:
        body = raw.encode(); h["Content-Type"] = ct
    elif data is not None:
        body = json.dumps(data).encode(); h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=15) as resp: return resp.status, resp.read()
    except urllib.error.HTTPError as e: return e.code, e.read()

st, _ = req("POST", "/api/auth/login", raw="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "", ct="application/x-www-form-urlencoded")
assert st in (200, 302)
st, body = req("GET", "/api/themes")
themes = json.loads(body)["themes"]
tid = target
if not any(t["id"] == target for t in themes):
    hit = next((t for t in themes if target.lower() in t["name"].lower()), None)
    assert hit, f"theme '{target}' not found; have: {[t['name'] for t in themes]}"
    tid = hit["id"]
st, body = req("POST", f"/api/themes/{tid}")
print("activated", tid, st, body.decode()[:120])
