import requests, json, subprocess, os

BASE = "http://localhost:4321"
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", data={"username":"admin","password":os.environ.get("AP_ADMIN_PASS", "admin")}, allow_redirects=False)
assert r.status_code == 302, f"login {r.status_code}"

def api(method, path, **kw):
    return getattr(s, method)(f"{BASE}{path}", timeout=30, **kw)

ok = fail = 0
def okf(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print(f"  FAIL {name} {extra}")

# 取一篇已发布文章（评论与前台测试用）
r = api("post", "/admin-ext/api/db-console/exec",
        json={"sql": "SELECT ID, post_name FROM wp_posts WHERE post_type='post' AND post_status='publish' LIMIT 1"})
rows = r.json().get("rows", [])
post_id = rows[0]["ID"] if rows else None
post_slug = rows[0]["post_name"] if rows else None
print(f"  用文章: id={post_id} slug={post_slug}")

# ===== 1) 插件管理器 =====
r = api("get", "/admin-ext/api/plugin-manager/state")
okf("plugin-manager state", r.status_code == 200)

# ===== 2) 各管理页 =====
pages = [
    "/admin-ext/plugin-manager", "/admin-ext/db-console", "/admin-ext/backup",
    "/admin-ext/comments", "/admin-ext/config-io", "/admin-ext/files",
    "/admin-ext/webdav", "/admin-ext/gist-sync", "/admin-ext/git-sync",
    "/admin/themes/loop-templates", "/admin/posts/new",
]
for p in pages:
    r = api("get", p, allow_redirects=True)
    okf(f"page {p}", r.status_code == 200 and b"wp-sidebar" in r.content, str(r.status_code))

# ===== 3) db-console 安全（不再发送破坏性 SQL）=====
r = api("post", "/admin-ext/api/db-console/exec", json={"sql": "UPDATE wp_posts SET id=id"})
okf("db write 未确认 403", r.status_code == 403, str(r.status_code))
r = api("post", "/admin-ext/api/db-console/exec", json={"sql": "SELECT 1"})
okf("db safe exec", r.status_code == 200)
r = api("post", "/admin-ext/api/db-console/exec", json={"sql": "ATTACH 'x' AS y", "confirmWrite": True})
okf("db ATTACH 400", r.status_code == 400, str(r.status_code))
r = api("get", "/admin-ext/api/db-console/browse", params={"name": "wp_posts"})
okf("db browse", r.status_code == 200 and "__rowid" in r.text)
r = api("post", "/admin-ext/api/db-console/update",
        json={"table": "wp_posts", "rowid": 1, "column": "post_title", "value": "x"})
okf("db update 未确认 403", r.status_code == 403, str(r.status_code))

# ===== 4) backup =====
r = api("get", "/admin-ext/api/backup/list")
okf("backup list", r.status_code == 200 and "apzip" in r.text)

# ===== 5) comments 生命周期 =====
anon = requests.Session()
r = anon.post(f"{BASE}/ap-comments/submit", json={
    "postId": post_id, "author": "stress", "email": "stress@t.cn",
    "content": "stress test", "ap_website": "",
}, timeout=30)
okf("cmt submit", r.status_code in (200, 201, 202), str(r.status_code))
r = api("get", "/admin-ext/api/comments/list", params={"status": "pending"})
okf("cmt pending list", r.status_code == 200 and b"stress" in r.content, str(r.status_code))
if post_slug:
    r = anon.get(f"{BASE}/blog/{post_slug}", allow_redirects=True, timeout=30)
    okf("blog public 200", r.status_code == 200, str(r.status_code))
    okf("blog 评论区注入", b"ap-comments" in r.content)

# ===== 6) config-io =====
r = api("get", "/admin-ext/api/config-io/export")
okf("config-export 200", r.status_code == 200)
t = r.text.lower()
okf("config-export 无敏感键", "auth_secret" not in t)

# ===== 7) media-av =====
r = api("get", "/api/ap-media-av/media-av.js")
okf("media-av script", r.status_code == 200 and "apav-" in r.text)
r = api("post", "/api/ap-media-av/upload",
        files={"file": ("x.exe", b"MZ", "application/octet-stream")}, data={"kind": "audio"})
okf("media-av 坏类型 415", r.status_code == 415, str(r.status_code))

# ===== 8) link-directory =====
r = api("get", "/directory")
okf("directory 200", r.status_code == 200)

# ===== 9) ai-chat =====
r = api("get", "/admin-ext/api/ai-chat/status")
okf("ai-chat status", r.status_code == 200 and "deepseek" in r.text)
r = api("get", "/admin-ext/api/ai-chat/editor-panel.js")
okf("ai-chat editor-panel.js", r.status_code == 200)

# ===== 10) file-manager =====
r = api("get", "/admin-ext/api/files/list")
okf("fm list", r.status_code == 200 and "plugins" in r.text)

# ===== 11) webdav =====
r = api("post", "/admin-ext/api/webdav/token", json={"confirm": True})
tok = r.json().get("token", "")
r2 = requests.request("PROPFIND", f"{BASE}/webdav/", auth=("admin", tok), headers={"Depth": "0"}, timeout=30)
okf("webdav propfind 207", r2.status_code == 207, str(r2.status_code))
r2 = requests.request("PROPFIND", f"{BASE}/webdav/", timeout=30)
okf("webdav 未鉴权 401", r2.status_code == 401, str(r2.status_code))

# ===== 12) gist-sync / git-sync =====
r = api("get", "/admin-ext/api/gist-sync/settings")
okf("gist settings", r.status_code == 200)
r = api("get", "/admin-ext/api/gist-sync/history")
okf("gist history", r.status_code == 200)
r = api("get", "/admin-ext/api/git-sync/settings")
okf("git settings", r.status_code == 200)
r = api("get", "/admin-ext/api/git-sync/history")
okf("git history", r.status_code == 200)
r = api("post", "/admin-ext/api/git-sync/sync", json={})
okf("git sync 未确认 403", r.status_code == 403, str(r.status_code))

# ===== 13) 编辑器注入 =====
r = api("get", "/admin/posts/new", allow_redirects=True)
okf("editor page 200", r.status_code == 200)
okf("editor wp-editor 注入", b"ap-wp-editor" in r.content)
okf("editor media-av 注入", b"ap-media-av" in r.content)
okf("editor ai-panel 注入", b"ai-chat/editor-panel.js" in r.content)
okf("editor i18n 注入", b"ap-i18n/script.js" in r.content)

# ===== 14) 未登录防护 =====
anon2 = requests.Session()
r = anon2.get(f"{BASE}/admin-ext/db-console", allow_redirects=False)
okf("anon db-console 302", r.status_code == 302, str(r.status_code))
r = anon2.get(f"{BASE}/admin-ext/api/files/list", allow_redirects=False)
okf("anon fm list 302/401", r.status_code in (302, 401), str(r.status_code))

# ===== 15) 主题碰撞 =====
out = subprocess.run(["python", "scripts/check-theme-collision.py"], capture_output=True, text=True, timeout=180)
okf("theme collision clean", "CLEAN" in out.stdout, out.stdout[-150:])

print(f"\n== Round-9 stress: {ok} passed, {fail} failed ==")
