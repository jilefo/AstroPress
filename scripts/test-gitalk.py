#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gitalk 插件快速验证"""
import os
import json, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost:4321"
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

ok = 0
st, _ = req("POST", "/api/auth/login", raw="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "", ct="application/x-www-form-urlencoded")
print("login:", st); ok += st in (200, 302)

st, body = req("GET", "/admin-ext/gitalk")
print("admin page:", st, len(body)); ok += st == 200

st, body = req("GET", "/admin-ext/api/gitalk/settings")
print("settings GET:", st, body[:120]); ok += st == 200

# 保存配置
payload = {"enabled": True, "clientID": "test-client-id", "clientSecret": "s3cr3t", "owner": "octocat",
           "repo": "blog-comments", "admin": "octocat, hubot", "idMode": "pathname", "language": "zh-CN",
           "perPage": 10, "proxy": "", "distractionFreeMode": False, "titleFromPage": True}
st, body = req("POST", "/admin-ext/api/gitalk/settings", data=payload)
d = json.loads(body)
print("settings POST:", st, d.get("settings", {}).get("clientSecret")); ok += st == 200 and d["settings"]["clientSecret"] == "••••••••"

# 往返一致（secret 掩码）
st, body = req("GET", "/admin-ext/api/gitalk/settings")
d = json.loads(body)
ok += d.get("clientID") == "test-client-id" and d.get("repo") == "blog-comments"
print("roundtrip:", d.get("clientID"), d.get("repo"), d.get("clientSecret"))

# secret 掩码提交不覆盖
payload["clientSecret"] = "••••••••"
st, body = req("POST", "/admin-ext/api/gitalk/settings", data=payload)
print("masked no-overwrite:", st)

# 前台注入（已发布文章）
st, body = req("GET", "/pv-tips")
html = body.decode("utf-8", "replace")
has = 'id="gitalk-container"' in html and "gitalk@1" in html and "test-client-id" in html
print("frontend inject /pv-tips:", st, has); ok += has

# Gitalk 纯前端 OAuth 方案需要 clientSecret 在前端可见（官方设计）；
# 建议通过 proxy 走服务端转发缓解。这里验证配置确实包含 secret。
print("frontend config has secret (expected):", "s3cr3t" in html); ok += "s3cr3t" in html

# 禁用后不注入
payload["enabled"] = False; payload["clientSecret"] = "••••••••"
req("POST", "/admin-ext/api/gitalk/settings", data=payload)
import time; time.sleep(16.5)  # 等 15s 缓存过期
st, body = req("GET", "/pv-tips")
html = body.decode("utf-8", "replace")
print("disabled no-inject:", 'id="gitalk-container"' not in html); ok += 'id="gitalk-container"' not in html

print(f"\nRESULT: {ok}/8")
