# -*- coding: utf-8 -*-
"""AstroPress 并发压力测试（4路×15轮×5端点，POST 用唯一路径）"""
import os
import requests, concurrent.futures, time, sys

BASE = "http://localhost:4321"
LOGIN = {"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")}

s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", data=LOGIN, allow_redirects=False, timeout=10)
print("登录", r.status_code)

results = {"ok": 0, "fail": 0, "detail": []}

def once(i):
    rs = requests.Session()
    rs.post(f"{BASE}/api/auth/login", data=LOGIN, allow_redirects=False, timeout=10)
    endpoints = [
        ("GET", f"{BASE}/admin-ext/api/plugin-manager/state", None),
        ("GET", f"{BASE}/admin-ext/api/redirects", None),
        ("GET", f"{BASE}/rss.xml", None),
        ("GET", f"{BASE}/search?q=test", None),
        ("POST", f"{BASE}/admin-ext/api/redirects", {"from": f"/stress-{i}", "to": "/blog/seo-guide", "type": 302}),
    ]
    for method, url, body in endpoints:
        try:
            rr = rs.get(url, timeout=10) if method == "GET" else rs.post(url, json=body, timeout=10)
            results["detail"].append((i, method, url, rr.status_code))
            if rr.status_code < 400:
                results["ok"] += 1
            else:
                results["fail"] += 1
        except Exception as e:
            results["detail"].append((i, method, url, str(e)))
            results["fail"] += 1

start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(once, range(15)))
elapsed = time.time() - start

# 清理压力测试规则
rules = s.get(f"{BASE}/admin-ext/api/redirects", timeout=10).json()
for rule in rules:
    if rule["from"].startswith("/stress-"):
        s.delete(f"{BASE}/admin-ext/api/redirects?id={rule['id']}", timeout=10)
print("清理测试规则完成")

print(f"4路并发×15轮×5端点 = {len(results['detail'])} 请求, OK={results['ok']}, FAIL={results['fail']}, 耗时={elapsed:.1f}s")
for i, m, u, c in results["detail"]:
    if c >= 400 or isinstance(c, str):
        print(f"  FAIL seq={i} {m} {u} -> {c}")
sys.exit(1 if results["fail"] else 0)
