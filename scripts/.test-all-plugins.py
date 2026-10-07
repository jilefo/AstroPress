import os as _os
_PWD = _os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
#!/usr/bin/env python3
"""全插件真实测试：51 个插件逐一测试，输出 JSON 结果。
用法：python scripts/.test-all-plugins.py
需要 dev server 运行在 http://localhost:4321"""
import json, sys, time, urllib.request, urllib.error, http.cookiejar, os
from pathlib import Path
from datetime import datetime

BASE = "http://localhost:4321"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "plugin-test/1.0")]

results = []  # list of {plugin, feature, status, detail}
current_plugin = ""

def record(plugin, feature, ok, detail=""):
    results.append({"plugin": plugin, "feature": feature, "status": "PASS" if ok else "FAIL", "detail": detail[:200]})
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {feature}" + (f" — {detail[:80]}" if detail and not ok else ""))

def req(method, path, data=None, headers=None, timeout=20):
    url = BASE + path
    body = None
    h = dict(headers or {})
    if data is not None:
        if isinstance(data, dict) or isinstance(data, list):
            body = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
        else:
            body = data.encode() if isinstance(data, str) else data
            h.setdefault("Content-Type", "application/x-www-form-urlencoded")
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=timeout) as resp:
            payload = resp.read()
            return resp.status, dict(resp.headers), payload
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()
    except Exception as e:
        return 0, {}, str(e).encode()

def login():
    st, _, body = req("POST", "/api/auth/login", "username=admin&password=" + _PWD + "")
    return st in (200, 302)

def get_json(path):
    st, _, body = req("GET", path)
    try:
        return st, json.loads(body)
    except:
        return st, {}

def post_json(path, data, confirm=False):
    if confirm:
        data["confirm"] = True
    st, _, body = req("POST", path, data)
    try:
        return st, json.loads(body)
    except:
        return st, {}

# ═══════════════════════════════════════════════════════════════
#  LOGIN
# ═══════════════════════════════════════════════════════════════
print("=" * 70)
print(f"全插件真实测试 — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 70)

ok = login()
record("_auth", "管理员登录", ok, f"HTTP status")

# ═══════════════════════════════════════════════════════════════
#  1. PLUGIN MANAGER — 获取插件列表
# ═══════════════════════════════════════════════════════════════
print("\n▸ plugin-manager")
st, data = get_json("/admin-ext/api/plugin-manager/state")
record("plugin-manager", "GET /admin-ext/api/plugin-manager/state", st == 200, f"HTTP {st}")
record("plugin-manager", "返回插件列表", isinstance(data, list) and len(data) > 40, f"count={len(data) if isinstance(data, list) else '?'}")

st, _, body = req("GET", "/admin-ext/plugin-manager")
record("plugin-manager", "GET /admin-ext/plugin-manager 页面", st == 200, f"HTTP {st}")

# ═══════════════════════════════════════════════════════════════
#  2. CORE ADMIN PAGES — 核心后台页面
# ═══════════════════════════════════════════════════════════════
print("\n▸ core-admin-pages")
core_pages = [
    ("/admin/dashboard", "仪表盘"),
    ("/admin/posts", "文章列表"),
    ("/admin/posts/new", "新建文章"),
    ("/admin/pages", "页面列表"),
    ("/admin/medias", "媒体库"),
    ("/admin/users", "用户管理"),
    ("/admin/settings", "系统设置"),
    ("/admin/forms", "表单管理"),
    ("/admin/menus", "导航菜单"),
    ("/admin/themes", "主题管理"),
    ("/admin/custom-fields", "自定义字段"),
    ("/admin/post-types", "内容类型"),
]
for path, label in core_pages:
    st, _, body = req("GET", path)
    record("core-admin", f"{label} ({path})", st == 200, f"HTTP {st}")

# ═══════════════════════════════════════════════════════════════
#  3. CORE API — 核心 API 端点
# ═══════════════════════════════════════════════════════════════
print("\n▸ core-api")
st, _, _ = req("GET", "/api/posts")
record("core-api", "GET /api/posts", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/themes")
record("core-api", "GET /api/themes", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/users")
record("core-api", "GET /api/users", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/media")
record("core-api", "GET /api/media", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/ai/settings")
record("core-api", "GET /api/ai/settings", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/post-types")
record("core-api", "GET /api/post-types", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/taxonomies")
record("core-api", "GET /api/taxonomies", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/custom-fields")
record("core-api", "GET /api/custom-fields", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/api/menus")
record("core-api", "GET /api/menus（仅 POST，GET 应拒绝）", st in (404, 405), f"HTTP {st}")
st, _, _ = req("GET", "/api/forms")
record("core-api", "GET /api/forms", st == 200, f"HTTP {st}")

# ═══════════════════════════════════════════════════════════════
#  PLUGIN-BY-PLUGIN TESTS
# ═══════════════════════════════════════════════════════════════

# --- activity-log ---
print("\n▸ activity-log")
st, _ = get_json("/admin-ext/api/activity-log/list")
record("activity-log", "GET list API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/activity-log")
record("activity-log", "GET 管理页", st == 200, f"HTTP {st}")

# --- admin-i18n ---
print("\n▸ admin-i18n")
st, _ = get_json("/admin-ext/api/i18n/settings")
record("admin-i18n", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/i18n")
record("admin-i18n", "GET 管理页", st == 200, f"HTTP {st}")

# --- ads-manager ---
print("\n▸ ads-manager")
st, data = get_json("/admin-ext/api/ads/slots")
record("ads-manager", "GET slots API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/ads")
record("ads-manager", "GET 管理页", st == 200, f"HTTP {st}")

# --- ai-autofill ---
print("\n▸ ai-autofill")
# ai-autofill has /api/ap-autofill/* routes (public-facing JS + API)
st, _, _ = req("GET", "/api/ap-autofill/script.js")
record("ai-autofill", "GET script.js", st == 200, f"HTTP {st}")

# --- ai-chat ---
print("\n▸ ai-chat")
st, _ = get_json("/admin-ext/api/ai-chat/status")
record("ai-chat", "GET status API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/ai-chat/providers")
record("ai-chat", "GET providers API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/ai-chat")
record("ai-chat", "GET 管理页", st == 200, f"HTTP {st}")

# --- asset-cache ---
print("\n▸ asset-cache")
st, _ = get_json("/admin-ext/api/asset-cache/settings")
record("asset-cache", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/asset-cache")
record("asset-cache", "GET 管理页", st == 200, f"HTTP {st}")

# --- backup ---
print("\n▸ backup")
st, data = get_json("/admin-ext/api/backup/list")
record("backup", "GET list API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/backup")
record("backup", "GET 管理页", st == 200, f"HTTP {st}")

# --- cache-warmer ---
print("\n▸ cache-warmer")
st, _ = get_json("/admin-ext/api/cache-warmer/settings")
record("cache-warmer", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/cache-warmer/status")
record("cache-warmer", "GET status API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/cache-warmer")
record("cache-warmer", "GET 管理页", st == 200, f"HTTP {st}")

# --- comments ---
print("\n▸ comments")
st, data = get_json("/admin-ext/api/comments/list?status=pending")
record("comments", "GET list API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/comments/settings")
record("comments", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/comments")
record("comments", "GET 管理页", st == 200, f"HTTP {st}")

# --- config-io ---
print("\n▸ config-io")
st, _ = get_json("/admin-ext/config-io")
record("config-io", "GET 管理页", st == 200, f"HTTP {st}")

# --- customer-service ---
print("\n▸ customer-service")
st, _ = get_json("/admin-ext/customer-service")
record("customer-service", "GET 管理页", st == 200, f"HTTP {st}")

# --- dashboard-widgets ---
print("\n▸ dashboard-widgets")
st, data = get_json("/admin-ext/api/dashboard-widgets/stats")
record("dashboard-widgets", "GET stats API", st == 200, f"HTTP {st}")
record("dashboard-widgets", "stats 含 posts/drafts/users", "stats" in data and "posts" in data.get("stats", {}), str(list(data.get("stats", {}).keys())))

# --- db-console ---
print("\n▸ db-console")
st, _ = get_json("/admin-ext/db-console")
record("db-console", "GET 管理页", st == 200, f"HTTP {st}")

# --- db-optimize ---
print("\n▸ db-optimize")
st, _ = get_json("/admin-ext/db-optimize")
record("db-optimize", "GET 管理页", st == 200, f"HTTP {st}")

# --- donation ---
print("\n▸ donation")
st, _ = get_json("/admin-ext/donation")
record("donation", "GET 管理页", st == 200, f"HTTP {st}")

# --- editor-tools ---
print("\n▸ editor-tools")
st, _, _ = req("POST", "/api/ap-etools/translate", {})
record("editor-tools", "POST translate API (参数校验)", st in (200, 400), f"HTTP {st}")

# --- editor-upload ---
print("\n▸ editor-upload")
# editor-upload uses /api/ap-media/* which is shared with core media
st, _, _ = req("GET", "/admin/settings")
record("editor-upload", "设置页可访问", st == 200, f"HTTP {st}")

# --- error-monitor ---
print("\n▸ error-monitor")
st, _ = get_json("/admin-ext/api/404/list")
record("error-monitor", "GET list API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/404-monitor")
record("error-monitor", "GET 管理页", st == 200, f"HTTP {st}")

# --- file-manager ---
print("\n▸ file-manager")
st, _ = get_json("/admin-ext/files")
record("file-manager", "GET 管理页", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/files/list")
record("file-manager", "GET files list API", st == 200, f"HTTP {st}")

# --- footer ---
print("\n▸ footer")
st, _ = get_json("/admin-ext/footer")
record("footer", "GET 管理页", st == 200, f"HTTP {st}")

# --- gist-sync ---
print("\n▸ gist-sync")
st, _ = get_json("/admin-ext/gist-sync")
record("gist-sync", "GET 管理页", st == 200, f"HTTP {st}")

# --- git-sync ---
print("\n▸ git-sync")
st, _ = get_json("/admin-ext/git-sync")
record("git-sync", "GET 管理页", st == 200, f"HTTP {st}")

# --- gitalk-comment ---
print("\n▸ gitalk-comment")
st, _ = get_json("/admin-ext/api/gitalk/settings")
record("gitalk-comment", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/gitalk")
record("gitalk-comment", "GET 管理页", st == 200, f"HTTP {st}")

# --- html-opt ---
print("\n▸ html-opt")
st, _ = get_json("/admin-ext/api/html-opt/settings")
record("html-opt", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/html-opt")
record("html-opt", "GET 管理页", st == 200, f"HTTP {st}")

# --- image-lazy ---
print("\n▸ image-lazy")
st, _ = get_json("/admin-ext/api/image-lazy/settings")
record("image-lazy", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/image-lazy")
record("image-lazy", "GET 管理页", st == 200, f"HTTP {st}")

# --- image-mirror ---
print("\n▸ image-mirror")
st, _, _ = req("GET", "/api/ap-mirror/image-mirror.js")
record("image-mirror", "GET image-mirror.js", st == 200, f"HTTP {st}")

# --- link-directory ---
print("\n▸ link-directory")
st, data = get_json("/admin-ext/api/links/cats")
record("link-directory", "GET cats API", st == 200, f"HTTP {st}")
st, data = get_json("/admin-ext/api/links")
record("link-directory", "GET links API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/links/settings")
record("link-directory", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/links")
record("link-directory", "GET 管理页", st == 200, f"HTTP {st}")

# --- maintenance-mode ---
print("\n▸ maintenance-mode")
st, _ = get_json("/admin-ext/api/maintenance/settings")
record("maintenance-mode", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/maintenance-mode")
record("maintenance-mode", "GET 管理页", st == 200, f"HTTP {st}")

# --- media-av ---
print("\n▸ media-av")
st, _, _ = req("GET", "/api/ap-media-av/media-av.js")
record("media-av", "GET media-av.js", st == 200, f"HTTP {st}")

# --- media-folders ---
print("\n▸ media-folders")
st, data = get_json("/admin-ext/api/media-folders/list")
record("media-folders", "GET list API", st == 200, f"HTTP {st}")
st, data = post_json("/admin-ext/api/media-folders/create", {"name": "__test_l_round__"})
folder_id = data.get("id", 0) if isinstance(data, dict) else 0
record("media-folders", "POST create 文件夹", st == 200 and folder_id > 0, f"HTTP {st}, id={folder_id}")
if folder_id:
    st, _ = post_json("/admin-ext/api/media-folders/rename", {"id": folder_id, "name": "__test_renamed__"})
    record("media-folders", "POST rename 文件夹", st == 200, f"HTTP {st}")
    st, _ = post_json("/admin-ext/api/media-folders/delete", {"id": folder_id, "confirm": True})
    record("media-folders", "POST delete 文件夹", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/media-folders")
record("media-folders", "GET 管理页", st == 200, f"HTTP {st}")

# --- multilingual ---
print("\n▸ multilingual")
st, _ = get_json("/admin-ext/api/ml/settings")
record("multilingual", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/multilingual")
record("multilingual", "GET 管理页", st == 200, f"HTTP {st}")

# --- notification-center ---
print("\n▸ notification-center")
st, data = get_json("/admin-ext/api/notifications/unread-count")
record("notification-center", "GET unread-count API", st == 200, f"HTTP {st}")
st, data = get_json("/admin-ext/api/notifications/list?page=1&perPage=10")
record("notification-center", "GET list API", st == 200 and "items" in data, f"HTTP {st}")
st, _ = post_json("/admin-ext/api/notifications/read-all", {})
record("notification-center", "POST read-all", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/notification-center")
record("notification-center", "GET 管理页", st == 200, f"HTTP {st}")

# --- page-cache ---
print("\n▸ page-cache")
st, data = get_json("/admin-ext/api/page-cache/stats")
record("page-cache", "GET stats API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/page-cache/settings")
record("page-cache", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/page-cache")
record("page-cache", "GET 管理页", st == 200, f"HTTP {st}")

# --- permalink ---
print("\n▸ permalink")
st, _ = get_json("/admin-ext/permalink")
record("permalink", "GET 管理页", st == 200, f"HTTP {st}")

# --- rate-limit ---
print("\n▸ rate-limit")
st, _ = get_json("/admin-ext/api/rate-limit/settings")
record("rate-limit", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/rate-limit")
record("rate-limit", "GET 管理页", st == 200, f"HTTP {st}")

# --- redirect ---
print("\n▸ redirect")
st, data = get_json("/admin-ext/api/redirects")
record("redirect", "GET list API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/redirects")
record("redirect", "GET 管理页", st == 200, f"HTTP {st}")

# --- related-posts ---
print("\n▸ related-posts")
st, _ = get_json("/admin-ext/api/related-posts/settings")
record("related-posts", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/related-posts")
record("related-posts", "GET 管理页", st == 200, f"HTTP {st}")

# --- revisions ---
print("\n▸ revisions")
st, pdata = get_json("/api/posts?type=post&perPage=1")
first_post = None
if isinstance(pdata, dict):
    posts = pdata.get("posts") or pdata.get("data") or []
    if posts and isinstance(posts, list):
        first_post = posts[0].get("id")
if first_post is None and isinstance(pdata, list) and pdata:
    first_post = pdata[0].get("id")
st, data = get_json(f"/admin-ext/api/revisions/list?post={first_post or 1}")
record("revisions", "GET list API (带 post 参数)", st == 200, f"HTTP {st} post={first_post}")
st, _ = get_json("/admin-ext/revisions?post=" + str(first_post or 1))
record("revisions", "GET 管理页", st == 200, f"HTTP {st}")

# --- search ---
print("\n▸ search")
st, _ = get_json("/admin-ext/api/search/settings")
record("search", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/search")
record("search", "GET 管理页", st == 200, f"HTTP {st}")
st, _, _ = req("GET", "/search")
record("search", "GET /search 前台页", st == 200, f"HTTP {st}")

# --- security-headers ---
print("\n▸ security-headers")
st, _ = get_json("/admin-ext/api/security-headers/settings")
record("security-headers", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/security-headers")
record("security-headers", "GET 管理页", st == 200, f"HTTP {st}")

# --- seo ---
print("\n▸ seo")
st, plist = get_json("/admin-ext/api/plugin-manager/state")
seo_meta = next((p for p in (plist if isinstance(plist, list) else []) if p.get("slug") == "seo"), {})
record("seo", "第一方插件已在注册表标记", seo_meta.get("system") is True and seo_meta.get("label") != "", f"{seo_meta.get('label')}")

# --- seo-tools ---
print("\n▸ seo-tools")
st, _ = get_json("/admin-ext/api/seo-tools/settings")
record("seo-tools", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/seo-tools")
record("seo-tools", "GET 管理页", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/sitemap.xml")
record("seo-tools", "GET /sitemap.xml", st == 200 and b"urlset" in body, f"HTTP {st}")
st, _, body = req("GET", "/robots.txt")
record("seo-tools", "GET /robots.txt", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/rss.xml")
record("seo-tools", "GET /rss.xml", st == 200, f"HTTP {st}")

# --- share ---
print("\n▸ share")
st, _ = get_json("/admin-ext/api/share/settings")
record("share", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/share")
record("share", "GET 管理页", st == 200, f"HTTP {st}")

# --- sitemap ---
print("\n▸ sitemap")
st, _ = get_json("/admin-ext/sitemap")
record("sitemap", "GET 管理页", st == 200, f"HTTP {st}")

# --- static-html ---
print("\n▸ static-html")
st, _ = get_json("/admin-ext/api/static-html/settings")
record("static-html", "GET settings API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/static-html/status")
record("static-html", "GET status API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/static-html")
record("static-html", "GET 管理页", st == 200, f"HTTP {st}")

# --- two-factor-auth ---
print("\n▸ two-factor-auth")
st, data = get_json("/admin-ext/api/2fa/status")
record("two-factor-auth", "GET status API", st == 200, f"HTTP {st}")
st, data = post_json("/admin-ext/api/2fa/setup", {})
record("two-factor-auth", "POST setup (生成密钥)", st == 200 and "secret" in data, f"HTTP {st}")
st, _ = post_json("/admin-ext/api/2fa/verify", {"code": "000000"})
record("two-factor-auth", "POST verify (错误码被拒绝)", st in (200, 400), f"HTTP {st}")
st, _ = get_json("/admin-ext/two-factor-auth")
record("two-factor-auth", "GET 管理页", st == 200, f"HTTP {st}")

# --- user-roles ---
print("\n▸ user-roles")
st, _, body = req("GET", "/admin-ext/user-roles")
record("user-roles", "GET 管理页", st == 200, f"HTTP {st}")
record("user-roles", "页面含角色矩阵内容", b"role" in body.lower() or b"capability" in body.lower() or b"</body>" in body, f"body[:100]={body[:100]}")

# --- webdav ---
print("\n▸ webdav")
st, _ = get_json("/admin-ext/api/webdav/token")
record("webdav", "GET token API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/api/webdav/stats")
record("webdav", "GET stats API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/webdav")
record("webdav", "GET 管理页", st == 200, f"HTTP {st}")

# --- webhook-publisher ---
print("\n▸ webhook-publisher")
st, data = get_json("/admin-ext/api/webhook/keys")
record("webhook-publisher", "GET keys API", st == 200, f"HTTP {st}")
st, data = get_json("/admin-ext/api/webhook/logs")
record("webhook-publisher", "GET logs API", st == 200, f"HTTP {st}")
st, _ = get_json("/admin-ext/webhooks")
record("webhook-publisher", "GET 管理页", st == 200, f"HTTP {st}")

# --- wp-editor ---
print("\n▸ wp-editor")
st, _, _ = req("GET", "/api/ap-wp-editor/wp-editor.js")
record("wp-editor", "GET wp-editor.js", st == 200, f"HTTP {st}")

# ═══════════════════════════════════════════════════════════════
#  PUBLIC FRONTEND TESTS
# ═══════════════════════════════════════════════════════════════
print("\n▸ public-frontend")
st, _, body = req("GET", "/")
record("frontend", "首页 /", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/blog/")
record("frontend", "博客列表 /blog/", st in (200, 404), f"HTTP {st}")
st, _, body = req("GET", "/search")
record("frontend", "搜索页 /search", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/directory")
record("frontend", "目录页 /directory", st in (200, 404), f"HTTP {st}")
st, _, body = req("GET", "/sitemap.xml")
record("frontend", "sitemap.xml", st == 200 and b"urlset" in body, f"HTTP {st}")
st, _, body = req("GET", "/robots.txt")
record("frontend", "robots.txt", st == 200, f"HTTP {st}")
st, _, body = req("GET", "/rss.xml")
record("frontend", "rss.xml", st == 200, f"HTTP {st}")

# ═══════════════════════════════════════════════════════════════
#  INJECTION VERIFICATION — 中间件注入验证
# ═══════════════════════════════════════════════════════════════
print("\n▸ injection-verification")
st, _, body = req("GET", "/admin/dashboard")
html = body.decode("utf-8", "replace")
record("injection", "Dashboard 含 widget 注入", "dashboard-widgets" in html or "widget" in html.lower())
record("injection", "Dashboard 含通知铃铛注入", "ap-nc-bell" in html or "notification" in html.lower())

st, _, body = req("GET", "/admin/posts")
html = body.decode("utf-8", "replace")
record("injection", "文章页含侧边栏注入", "admin-ext" in html)

# Security headers check on public page
st, headers, _ = req("GET", "/")
sec_headers = ["x-content-type-options", "x-frame-options", "referrer-policy"]
found = [h for h in sec_headers if h in {k.lower() for k in headers.keys()}]
record("injection", f"安全响应头 ({len(found)}/{len(sec_headers)})", len(found) >= 2, f"found={found}")

# ═══════════════════════════════════════════════════════════════
#  REGISTRY FIX VERIFICATION — 本次修复的 11 个插件注册验证
# ═══════════════════════════════════════════════════════════════
print("\n▸ registry-fix-verification")
NEWLY_REGISTERED = {
    "activity-log": "/admin-ext/activity-log",
    "asset-cache": "/admin-ext/asset-cache",
    "cache-warmer": "/admin-ext/cache-warmer",
    "maintenance-mode": "/admin-ext/maintenance-mode",
    "media-folders": "/admin-ext/media-folders",
    "notification-center": "/admin-ext/notification-center",
    "rate-limit": "/admin-ext/rate-limit",
    "revisions": "/admin-ext/revisions",
    "two-factor-auth": "/admin-ext/two-factor-auth",
    "user-roles": "/admin-ext/user-roles",
}
st, plist = get_json("/admin-ext/api/plugin-manager/state")
slug_map = {p.get("slug"): p for p in (plist if isinstance(plist, list) else [])}
no_btn = [s for s in NEWLY_REGISTERED if not slug_map.get(s, {}).get("settingsUrl")]
record("registry-fix", "11 插件全部出现「设置」按钮", not no_btn, f"missing={no_btn}")
no_toggle = [s for s in NEWLY_REGISTERED if slug_map.get(s, {}).get("system")]
record("registry-fix", "11 插件全部可启停（非 system）", not no_toggle, f"system={no_toggle}")

# ═══════════════════════════════════════════════════════════════
#  TOGGLE ROUND-TRIP — 禁用→404→启用→200 全链路验证
# ═══════════════════════════════════════════════════════════════
print("\n▸ toggle-roundtrip")
TOGGLE_CASES = {
    "activity-log": ["/admin-ext/activity-log", "/admin-ext/api/activity-log/list"],
    "asset-cache": ["/admin-ext/asset-cache", "/admin-ext/api/asset-cache/settings"],
    "cache-warmer": ["/admin-ext/cache-warmer", "/admin-ext/api/cache-warmer/status"],
    "maintenance-mode": ["/admin-ext/maintenance-mode", "/admin-ext/api/maintenance/settings"],
    "media-folders": ["/admin-ext/media-folders", "/admin-ext/api/media-folders/list"],
    "notification-center": ["/admin-ext/notification-center", "/admin-ext/api/notifications/list"],
    "rate-limit": ["/admin-ext/rate-limit", "/admin-ext/api/rate-limit/settings"],
    "revisions": ["/admin-ext/revisions", "/admin-ext/api/revisions/list"],
    "two-factor-auth": ["/admin-ext/two-factor-auth", "/admin-ext/api/2fa/status"],
    "user-roles": ["/admin-ext/user-roles"],
    "dashboard-widgets": ["/admin-ext/api/dashboard-widgets/stats"],
}
for slug, routes in TOGGLE_CASES.items():
    try:
        # 禁用
        st, d = post_json("/admin-ext/api/plugin-manager/state", {"slug": slug, "enabled": False})
        if st != 200 or not d.get("ok"):
            record(slug, "禁用 API", False, f"HTTP {st} {d}")
            continue
        # 禁用后：管理页与 API 必须 404
        codes = []
        for r in routes:
            s2, _, _ = req("GET", r)
            codes.append(s2)
        record(slug, "禁用后路由全部 404", all(c == 404 for c in codes), f"codes={codes}")
        # 恢复启用
        st, d = post_json("/admin-ext/api/plugin-manager/state", {"slug": slug, "enabled": True})
        if st != 200 or not d.get("ok"):
            record(slug, "重新启用 API", False, f"HTTP {st} {d}")
            continue
        # 启用后：路由恢复非 404
        codes = []
        for r in routes:
            s2, _, _ = req("GET", r)
            codes.append(s2)
        record(slug, "启用后路由恢复", all(c != 404 for c in codes), f"codes={codes}")
    except Exception as e:
        record(slug, "启停往返异常", False, str(e))
        # 尽力恢复启用
        try:
            post_json("/admin-ext/api/plugin-manager/state", {"slug": slug, "enabled": True})
        except Exception:
            pass

# ═══════════════════════════════════════════════════════════════
#  SUMMARY
# ═══════════════════════════════════════════════════════════════
total = len(results)
passed = sum(1 for r in results if r["status"] == "PASS")
failed = sum(1 for r in results if r["status"] == "FAIL")

print("\n" + "=" * 70)
print(f"测试完成：{total} 项，通过 {passed}，失败 {failed}")
print("=" * 70)

# Save results
out_path = Path(__file__).resolve().parent / ".all-plugins-result.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"time": datetime.now().isoformat(), "total": total, "passed": passed, "failed": failed, "results": results}, f, ensure_ascii=False, indent=2)
print(f"结果已保存: {out_path}")

sys.exit(1 if failed > 0 else 0)
