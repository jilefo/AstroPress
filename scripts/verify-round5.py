# -*- coding: utf-8 -*-
"""验证第五轮修复：循环拒绝、版本显示、搜索转义、slug 校验"""
import os
import requests, sys

BASE = "http://localhost:4321"
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")}, allow_redirects=False, timeout=10)
assert r.status_code in (302, 303), f"登录失败 {r.status_code}"

ok, fail = 0, 0
def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  PASS {name} {extra}")
    else: fail += 1; print(f"  FAIL {name} {extra}")

print("== 修复1：plugin-manager 版本显示 ==")
r = s.get(f"{BASE}/admin-ext/api/plugin-manager/state", timeout=10)
plugins = r.json()
with_ver = [p for p in plugins if p.get("version")]
check("版本号非空", len(with_ver) >= 14, f"{len(with_ver)}/{len(plugins)} 有版本")
seo_tools = next((p for p in plugins if p["slug"] == "seo-tools"), None)
check("seo-tools 有描述", bool(seo_tools and seo_tools.get("description")), f"v{seo_tools.get('version') if seo_tools else '?'}")

print("== 修复2：slug 格式校验 ==")
r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state", json={"slug": "BAD SLUG!!", "enabled": False}, timeout=10)
check("非法 slug 拒绝 400", r.status_code == 400, f"[{r.status_code}]")

print("== 修复4：redirect 多跳循环 ==")
r1 = s.post(f"{BASE}/admin-ext/api/redirects", json={"from": "/lc-a", "to": "/lc-b", "type": 301}, timeout=10)
check("创建 /lc-a→/lc-b", r1.status_code == 200, f"[{r1.status_code}]")
r2 = s.post(f"{BASE}/admin-ext/api/redirects", json={"from": "/lc-b", "to": "/lc-a", "type": 301}, timeout=10)
check("创建 /lc-b→/lc-a 被拒(循环)", r2.status_code == 400 and "loop" in r2.text, f"[{r2.status_code}] {r2.text[:60]}")
# 清理
rules = s.get(f"{BASE}/admin-ext/api/redirects", timeout=10).json()
for rule in rules:
    if rule["from"].startswith("/lc-"):
        s.delete(f"{BASE}/admin-ext/api/redirects?id={rule['id']}", timeout=10)

print("== 修复3：搜索双重转义 ==")
r = s.get(f"{BASE}/search", params={"q": "a&b"}, timeout=10)
# Astro 单重转义产物：&amp; 或 &#38;；双重转义会出现 &amp;amp; / &amp;#38;
check("搜索框回填单重转义", ('value="a&amp;b"' in r.text or 'value="a&#38;b"' in r.text) and "&amp;amp;" not in r.text and "&amp;#38;" not in r.text, f"[{r.status_code}]")
# XSS 注入测试：< 在元素内容中必须转义；属性值内 " 必须转义（ Astro 对 < 在引号属性内按字面处理，HTML 规范下惰性）
r = s.get(f"{BASE}/search", params={"q": '<script>alert(1)</script>'}, timeout=10)
check("title 中 < 已转义", "&lt;script&gt;" in r.text, f"[{r.status_code}]")
r = s.get(f"{BASE}/search", params={"q": '"><img src=x onerror=alert(1)>'}, timeout=10)
check("属性内 \" 已转义", "&#34;" in r.text or "&quot;" in r.text, f"[{r.status_code}]")
# 超长截断
r = s.get(f"{BASE}/search", params={"q": "x" * 500}, timeout=10)
check("超长查询 200（截断）", r.status_code == 200, f"[{r.status_code}]")

print(f"\n结果: {ok} 通过, {fail} 失败")
sys.exit(1 if fail else 0)
