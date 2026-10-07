import os as _os
_PWD = _os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""主题运行时真实测试：逐个激活主题，验证前台渲染 + 插件注入共存。
用法：python scripts/.test-themes-runtime.py（需 dev server 运行于 4321）"""
import json, sys, urllib.request, urllib.error, http.cookiejar
from datetime import datetime

BASE = "http://localhost:4321"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "theme-runtime-test/1.0")]

results = []

def record(theme, item, ok, detail=""):
    results.append({"theme": theme, "item": item, "status": "PASS" if ok else "FAIL", "detail": str(detail)[:200]})
    print(f"  [{'PASS' if ok else 'FAIL'}] {item}" + (f" — {detail}" if not ok and detail else ""))

def req(method, path, data=None, raw=None, ct=None, timeout=20):
    h, body = {}, None
    if raw is not None:
        body = raw.encode(); h["Content-Type"] = ct
    elif data is not None:
        body = json.dumps(data).encode(); h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()

# 登录
st, _ = req("POST", "/api/auth/login", raw="username=admin&password=" + _PWD + "", ct="application/x-www-form-urlencoded")
assert st in (200, 302), f"login failed {st}"

# 取主题列表与原激活主题
st, body = req("GET", "/api/themes")
themes = json.loads(body)["themes"]
st, cfg = req("GET", "/api/themes/config")
try:
    orig_active = json.loads(cfg).get("activeTheme") or json.loads(cfg).get("active")
except Exception:
    orig_active = None
print(f"主题数: {len(themes)}  原激活: {orig_active}")

# 取一篇已发布文章 slug
post_slug = None
st, body = req("GET", "/api/posts?type=post&status=publish&perPage=1")
try:
    d = json.loads(body)
    posts = d.get("posts") or d.get("data") or []
    if not posts and isinstance(d, list):
        posts = d
    if posts:
        post_slug = posts[0].get("slug")
except Exception:
    pass
print(f"测试文章 slug: {post_slug}")

# 前台插件注入标识（应为 blog 文章页出现的节点）
INJECTIONS = {
    "comments(#ap-comments)": lambda h: 'id="ap-comments"' in h,
    "share(.ap-share)": lambda h: "ap-share" in h,
    "donation(#ap-donation)": lambda h: 'id="ap-donation"' in h,
    "customer-service(#apcs-root)": lambda h: "apcs-root" in h,
    "search-fab(#ap-search-fab)": lambda h: "ap-search-fab" in h,
    "related-posts(#related-posts-block)": lambda h: "related-posts-block" in h,
}

for t in themes:
    name = t["name"]; tid = t["id"]
    print(f"\n▸ {name} ({tid})")
    st, body = req("POST", f"/api/themes/{tid}")
    if st not in (200, 201):
        record(name, "激活", False, f"HTTP {st}")
        continue
    record(name, "激活", True)

    # 首页
    st, body = req("GET", "/")
    html = body.decode("utf-8", "replace")
    record(name, "首页 200", st == 200, f"HTTP {st}")
    record(name, "首页含主题 CSS 注入", "<style" in html and ("--ap-" in html or "ap-block" in html or tid in html or t["name"].lower().replace(" ", "") in html.lower().replace(" ", "")))
    record(name, "首页无致命错误文本", "Internal server error" not in html and "AstroError" not in html)

    # 文章页 + 插件注入
    if post_slug:
        st, body = req("GET", f"/blog/{post_slug}")
        html = body.decode("utf-8", "replace")
        record(name, "文章页 200", st == 200, f"HTTP {st}")
        if st == 200:
            for label, fn in INJECTIONS.items():
                record(name, f"文章页插件注入: {label}", fn(html))
            record(name, "文章页无致命错误文本", "Internal server error" not in html and "AstroError" not in html)
            # 主题 CSS 不应隐藏插件节点
            hide_rules = [sel for sel in ("#ap-comments", "#ap-donation", "#apcs-root", "#ap-search-fab", "#related-posts-block") if f"{sel}{{display:none" in html.replace(" ", "")]
            record(name, "主题 CSS 未隐藏插件节点", not hide_rules, f"hidden={hide_rules}")

# 恢复原主题
if orig_active:
    st, _ = req("POST", f"/api/themes/{orig_active}")
    print(f"\n已恢复原激活主题: {orig_active} (HTTP {st})")

total = len(results)
passed = sum(1 for r in results if r["status"] == "PASS")
failed = total - passed
print("\n" + "=" * 60)
print(f"主题运行时测试完成：{total} 项，通过 {passed}，失败 {failed}")

from pathlib import Path
out = Path(__file__).resolve().parent / ".themes-runtime-result.json"
out.write_text(json.dumps({"time": datetime.now().isoformat(), "total": total, "passed": passed, "failed": failed, "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"结果已保存: {out}")
sys.exit(1 if failed else 0)
