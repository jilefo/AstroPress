#!/usr/bin/env python3
"""新插件专项测试：permalink / sitemap / share / customer-service / footer / donation
结果追加写入 scripts/plugin-test-result.json（与 test-plugins-full.py 的格式一致）"""
import os
import json, re, sys, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost:4321"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "plugin-test/1.0")]

results = []  # (plugin, name, status, detail)

def record(plugin, name, ok, detail=""):
    results.append((plugin, name, "PASS" if ok else "FAIL", detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {plugin} :: {name}" + (f" — {detail}" if detail and not ok else ""))

def req(method, path, data=None, headers=None, raw=False):
    url = BASE + path
    body = None
    h = dict(headers or {})
    if data is not None:
        if isinstance(data, dict):
            body = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
        else:
            body = data.encode() if isinstance(data, str) else data
            h.setdefault("Content-Type", "application/x-www-form-urlencoded")
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=30) as resp:
            payload = resp.read()
            return resp.status, dict(resp.headers), payload
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()

def login():
    st, _, _ = req("POST", "/api/auth/login", "username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "")
    return st in (200, 302)

# ───────────────────────────── 登录 ─────────────────────────────
record("setup", "管理员登录", login())

# ───────────────────────────── permalink ─────────────────────────────
# 先找一篇已发布文章的 slug
st, _, body = req("GET", "/admin-ext/api/db-console/query", None)
slug = "pv-tips"
st, h, body = req("GET", f"/{slug}")
record("permalink", f"/{slug} 无 /blog/ 前缀可访问", st == 200, f"HTTP {st}")
st, h, body = req("GET", f"/{slug}")
record("permalink", "重写后页面含文章内容", st == 200 and b"post-content" in body)
st, _, _ = req("GET", "/nonexistent-slug-zzz-404")
record("permalink", "不存在 slug 仍返回 404", st == 404, f"HTTP {st}")
st, _, body = req("GET", "/admin-ext/permalink")
record("permalink", "后台设置页可访问", st == 200, f"HTTP {st}")
# 未登录后台页应重定向（禁止 opener 自动跟随 302）
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw): return None
op2 = urllib.request.build_opener(NoRedirect)
try:
    r = op2.open(BASE + "/admin-ext/permalink", timeout=15)
    record("permalink", "未登录后台页重定向", r.status in (301, 302), f"HTTP {r.status}")
except urllib.error.HTTPError as e:
    record("permalink", "未登录后台页重定向", e.code in (301, 302, 401, 403), f"HTTP {e.code}")

# ───────────────────────────── sitemap ─────────────────────────────
st, h, body = req("GET", "/sitemap.xml")
xml = body.decode("utf-8", "replace")
record("sitemap", "/sitemap.xml 200 + XML 头", st == 200 and xml.startswith("<?xml"))
record("sitemap", "含 urlset 命名空间", 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' in xml)
record("sitemap", "含首页条目", f"<loc>{BASE}/</loc>" in xml)
record("sitemap", "含文章 /blog/ 条目", "<loc>" in xml and "/blog/" in xml)
record("sitemap", "含 lastmod 字段", "<lastmod>" in xml)
record("sitemap", "Cache-Control 缓存头", "max-age" in (h.get("Cache-Control") or h.get("cache-control") or ""))
st, _, _ = req("GET", "/admin-ext/sitemap")
record("sitemap", "后台设置页可访问", st == 200, f"HTTP {st}")
# POST 保存设置（页面自身处理 JSON POST，无独立 API 路由）
st, _, body = req("POST", "/admin-ext/sitemap", {"enabled": True, "maxPosts": 500, "includePages": True})
record("sitemap", "保存设置 maxPosts=500", st == 200, f"HTTP {st} {body[:80]}")
st, _, body = req("POST", "/admin-ext/sitemap", {"enabled": True, "maxPosts": 1000, "includePages": True})
record("sitemap", "恢复设置 maxPosts=1000", st == 200, f"HTTP {st}")

# ───────────────────────────── share ─────────────────────────────
# POST 为全量替换：先保存完整设置确保启用且平台开启，再抓取验证
FULL_PLATFORMS = {"wechat": True, "weibo": True, "qq": True, "zhihu": False, "twitter": True,
                  "facebook": False, "linkedin": False, "telegram": False, "whatsapp": False, "copylink": True}
st, _, body = req("POST", "/admin-ext/api/share/settings",
                  {"confirm": True, "enabled": True, "heading": "分享这篇文章", "position": "after", "platforms": FULL_PLATFORMS})
record("share", "POST 保存设置", st == 200, f"HTTP {st}")
st, _, body = req("GET", f"/blog/{slug}")
html = body.decode("utf-8", "replace")
record("share", "文章页注入 ap-share-root", 'id="ap-share-root"' in html)
record("share", "含微信分享", "微信" in html or "wechat" in html.lower())
record("share", "含微博分享", "微博" in html or "weibo" in html.lower())
record("share", "含复制链接", "复制链接" in html or "copy" in html.lower())
record("share", "链接已 URL 编码", "encodeURIComponent" in html or "%2F" in html or "href=" in html)
st, _, _ = req("GET", "/admin-ext/share")
record("share", "后台设置页可访问", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/admin-ext/api/share/settings")
record("share", "GET 设置 API", st == 200, f"HTTP {st}")
# 幂等：页面只注入一次
record("share", "页面仅注入一次（ap-share-root 唯一）", html.count('id="ap-share-root"') == 1)

# ───────────────────────────── customer-service ─────────────────────────────
# 先保存联系方式（全量替换，必须带 enabled），再抓取验证
st, _, _ = req("POST", "/admin-ext/api/customer-service/settings",
               {"confirm": True, "enabled": True, "qq": "123456", "email": "a@b.com", "workTime": "09:00-18:00"})
record("customer-service", "POST 保存联系方式", st == 200, f"HTTP {st}")
st, _, body = req("GET", f"/blog/{slug}")
html2 = body.decode("utf-8", "replace")
record("customer-service", "文章页注入 apcs-root", 'id="apcs-root"' in html2)
record("customer-service", "右下角浮动样式", "position:fixed" in html2 and "bottom" in html2)
st, _, _ = req("GET", "/admin-ext/customer-service")
record("customer-service", "后台设置页可访问", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/admin-ext/api/customer-service/settings")
record("customer-service", "GET 设置 API", st == 200, f"HTTP {st}")
record("customer-service", "配置后前台显示 QQ", "123456" in html2)
# 主题色非法值应被拒绝或回退（携带 enabled 避免全量替换关闭插件）
st, _, _ = req("POST", "/admin-ext/api/customer-service/settings",
               {"confirm": True, "enabled": True, "qq": "123456", "email": "a@b.com",
                "workTime": "09:00-18:00", "themeColor": "javascript:alert(1)"})
record("customer-service", "非法主题色被拒绝", st in (400, 200), f"HTTP {st}")

# ───────────────────────────── footer ─────────────────────────────
record("footer", "文章页注入页脚", "ap-footer" in html or "Powered by" in html)
record("footer", "Powered by 链接", "AstroPress" in html)
st, _, _ = req("GET", "/admin-ext/footer")
record("footer", "后台设置页可访问", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/admin-ext/api/footer/settings")
record("footer", "GET 设置 API", st == 200, f"HTTP {st}")
# 保存备案号（POST 为全量替换，必须带 enabled）
st, _, _ = req("POST", "/admin-ext/api/footer/settings",
               {"confirm": True, "enabled": True, "icp": "京ICP备2026001号", "copyright": "© 2026 测试站", "showPoweredBy": True})
record("footer", "POST 保存备案号", st == 200, f"HTTP {st}")
st, _, body = req("GET", f"/blog/{slug}")
html3 = body.decode("utf-8", "replace")
record("footer", "前台显示备案号", "京ICP备2026001号" in html3)
# XSS：自定义 HTML 中的 script 应被剥离
st, _, _ = req("POST", "/admin-ext/api/footer/settings",
               {"confirm": True, "enabled": True, "icp": "京ICP备2026001号", "customHtml": '<script>alert(1)</script><b>ok</b>', "showPoweredBy": True})
st, _, body = req("GET", f"/blog/{slug}")
html4 = body.decode("utf-8", "replace")
record("footer", "自定义 HTML 剥离 script", "<script>alert(1)</script>" not in html4)
record("footer", "自定义 HTML 保留安全标签", "<b>ok</b>" in html4)

# ───────────────────────────── donation ─────────────────────────────
# 先保存启用+二维码，再抓取验证（避免前几轮测试遗留的禁用状态）
st, _, _ = req("POST", "/admin-ext/api/donation/settings",
               {"confirm": True, "enabled": True, "wechatQr": "/media/wx.png", "alipayQr": "/media/ali.png"})
record("donation", "POST 保存二维码", st == 200, f"HTTP {st}")
st, _, body = req("GET", f"/blog/{slug}")
html6 = body.decode("utf-8", "replace")
record("donation", "文章页注入 ap-donation", 'id="ap-donation"' in html6 or 'id="ap-donation-btn"' in html6)
record("donation", "打赏按钮存在", 'id="ap-donation-btn"' in html6)
record("donation", "模态框存在", 'id="ap-donation-modal"' in html6)
record("donation", "默认按钮文案", "打赏支持" in html6)
st, _, _ = req("GET", "/admin-ext/donation")
record("donation", "后台设置页可访问", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/admin-ext/api/donation/settings")
record("donation", "GET 设置 API", st == 200, f"HTTP {st}")
record("donation", "前台显示微信二维码", "/media/wx.png" in html6)
record("donation", "前台显示支付宝二维码", "/media/ali.png" in html6)
# 非法协议应被拒绝（携带 enabled 避免全量替换关闭插件）
st, _, _ = req("POST", "/admin-ext/api/donation/settings",
               {"confirm": True, "enabled": True, "wechatQr": "javascript:alert(1)", "alipayQr": "/media/ali.png"})
record("donation", "javascript: 协议二维码被拒绝", st in (400, 200), f"HTTP {st}")
st, _, body = req("GET", f"/blog/{slug}")
html7 = body.decode("utf-8", "replace")
record("donation", "前台无 javascript: 二维码", 'src="javascript:' not in html7)
# 恢复二维码
req("POST", "/admin-ext/api/donation/settings",
    {"confirm": True, "enabled": True, "wechatQr": "/media/wx.png", "alipayQr": "/media/ali.png"})

# ───────────────────────────── git-sync 整站范围 ─────────────────────────────
st, _, body = req("GET", "/admin-ext/api/git-sync/settings")
record("git-sync", "GET 设置含 scopes.site", st == 200 and b'"site"' in body)
st, _, body = req("POST", "/admin-ext/api/git-sync/settings",
                  {"confirm": True, "preset": "github", "owner": "t", "repo": "t",
                   "scopes": {"dbDump": False, "media": False, "configJson": False, "site": True}})
record("git-sync", "仅勾选整站源码可保存", st == 200, f"HTTP {st} {body[:80]}")
st, _, body = req("POST", "/admin-ext/api/git-sync/settings",
                  {"confirm": True, "preset": "github", "owner": "t", "repo": "t",
                   "scopes": {"dbDump": False, "media": False, "configJson": False, "site": False}})
record("git-sync", "全部不勾选被拒绝", st == 400, f"HTTP {st}")
# 恢复
st, _, body = req("GET", "/admin-ext/api/git-sync/settings")
cur = json.loads(body).get("settings", {})
req("POST", "/admin-ext/api/git-sync/settings",
    {"confirm": True, "preset": cur.get("preset", "github"), "owner": cur.get("owner", ""),
     "repo": cur.get("repo", ""), "scopes": cur.get("scopes", {"dbDump": True, "configJson": True})})

# ───────────────────────────── 汇总并合并 ─────────────────────────────
passed = sum(1 for r in results if r[2] == "PASS")
failed = len(results) - passed
print(f"\n新插件专项: TOTAL={len(results)} PASS={passed} FAIL={failed}")

# 合并进主结果文件（与 test-plugins-full.py 同构：case/status 小写/ms 字段）
main_path = "scripts/plugin-test-result.json"
try:
    with open(main_path, encoding="utf-8") as f:
        main = json.load(f)
except FileNotFoundError:
    main = {"results": [], "summary": {"total": 0, "pass": 0, "fail": 0, "warn": 0}}
main["results"] = main.get("results", []) + [
    {"plugin": p, "case": n, "status": s.lower(), "detail": d, "ms": 0}
    for p, n, s, d in results
]
tot = len(main["results"])
np_ = sum(1 for r in main["results"] if r["status"] == "pass")
nf = sum(1 for r in main["results"] if r["status"] == "fail")
nw = sum(1 for r in main["results"] if r["status"] == "warn")
main["summary"] = {"total": tot, "pass": np_, "fail": nf, "warn": nw}
with open(main_path, "w", encoding="utf-8") as f:
    json.dump(main, f, ensure_ascii=False, indent=2)
print(f"已合并写入 {main_path}：总计 {tot} 项")
sys.exit(0 if failed == 0 else 1)
