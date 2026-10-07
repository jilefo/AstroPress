# -*- coding: utf-8 -*-
"""AstroPress 新插件冒烟测试：seo-tools / search / redirect / plugin-manager"""
import os
import requests, sys, json

BASE = "http://localhost:4321"
s = requests.Session()
ok, fail = 0, 0

def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  PASS {name} {extra}")
    else: fail += 1; print(f"  FAIL {name} {extra}")

print("== 公开端点（未登录） ==")
r = s.get(f"{BASE}/rss.xml", timeout=10)
check("GET /rss.xml", r.status_code == 200 and "<rss" in r.text and "<item>" in r.text, f"[{r.status_code}] items={r.text.count('<item>')}")

r = s.get(f"{BASE}/robots.txt", timeout=10)
check("GET /robots.txt", r.status_code == 200 and "Sitemap:" in r.text and "Disallow: /admin" in r.text, f"[{r.status_code}]")

r = s.get(f"{BASE}/search?q=seo", timeout=10)
check("GET /search?q=seo", r.status_code == 200, f"[{r.status_code}] len={len(r.text)}")

r = s.get(f"{BASE}/search?q=", timeout=10)
check("GET /search 空查询", r.status_code == 200, f"[{r.status_code}]")

# 登录
print("== 登录 ==")
r = s.post(f"{BASE}/api/auth/login", data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")}, allow_redirects=False, timeout=10)
check("POST 登录", r.status_code in (302, 303), f"[{r.status_code}]")

print("== 管理页 ==")
for path in ["/admin-ext/plugin-manager", "/admin-ext/seo-tools", "/admin-ext/search", "/admin-ext/redirects"]:
    r = s.get(f"{BASE}{path}", timeout=10)
    check(f"GET {path}", r.status_code == 200, f"[{r.status_code}]")

print("== 插件管理器 API ==")
r = s.get(f"{BASE}/admin-ext/api/plugin-manager/state", timeout=10)
plugins = r.json() if r.status_code == 200 else []
check("GET state 列表", r.status_code == 200 and len(plugins) >= 15, f"[{r.status_code}] count={len(plugins)}")
for p in plugins:
    print(f"    - {p['slug']:<18} {'系统' if p.get('system') else ('启用' if p['enabled'] else '禁用')} v{p.get('version','')}")

# 禁用 related-posts → 验证 404 + 前台隐藏
r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state", json={"slug": "related-posts", "enabled": False}, timeout=10)
check("禁用 related-posts", r.status_code == 200 and r.json().get("ok"), f"[{r.status_code}]")

r = s.get(f"{BASE}/ap-related/track?post=1", timeout=10)
check("禁用后 /ap-related/track → 404", r.status_code == 404, f"[{r.status_code}]")

r = s.get(f"{BASE}/blog/seo-guide", timeout=10)
check("前台注入隐藏 CSS", "data-ap-pm" in r.text and "#related-posts-block" in r.text, f"[{r.status_code}]")

# 系统插件保护
r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state", json={"slug": "plugin-manager", "enabled": False}, timeout=10)
check("系统插件拒绝禁用", r.status_code == 400, f"[{r.status_code}]")

# 重新启用
r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state", json={"slug": "related-posts", "enabled": True}, timeout=10)
check("重新启用 related-posts", r.status_code == 200 and r.json().get("ok"), f"[{r.status_code}]")
r = s.get(f"{BASE}/ap-related/track?post=1", timeout=10)
check("启用后 /ap-related/track 恢复", r.status_code == 200, f"[{r.status_code}]")

print("== 重定向 ==")
r = s.post(f"{BASE}/admin-ext/api/redirects", json={"from": "/old-seo", "to": "/blog/seo-guide", "type": 301}, timeout=10)
check("创建重定向", r.status_code == 200, f"[{r.status_code}] {r.text[:100]}")

r = requests.get(f"{BASE}/old-seo", allow_redirects=False, timeout=10)
check("301 生效", r.status_code == 301 and "/blog/seo-guide" in r.headers.get("Location", ""), f"[{r.status_code}] → {r.headers.get('Location','')}")

# 循环保护：/loop-a → /loop-a
s.post(f"{BASE}/admin-ext/api/redirects", json={"from": "/loop-a", "to": "/loop-a", "type": 301}, timeout=10)
r = requests.get(f"{BASE}/loop-a", allow_redirects=False, timeout=10)
check("循环保护放行", r.status_code == 404, f"[{r.status_code}]（应 404 而非重定向循环）")

# 清理测试规则
r = s.get(f"{BASE}/admin-ext/api/redirects", timeout=10)
for rule in r.json():
    if rule["from"] in ("/old-seo", "/loop-a"):
        s.delete(f"{BASE}/admin-ext/api/redirects?id={rule['id']}", timeout=10)
check("清理测试规则", True)

# CSRF 检查（伪造 origin）
r = requests.post(f"{BASE}/admin-ext/api/plugin-manager/state", json={"slug": "x", "enabled": False},
                  headers={"Origin": "http://evil.com", "Cookie": "; ".join(f"{k}={v}" for k, v in s.cookies.items())}, timeout=10)
check("跨域 POST 被 403", r.status_code == 403, f"[{r.status_code}]")

print(f"\n结果: {ok} 通过, {fail} 失败")
sys.exit(1 if fail else 0)
