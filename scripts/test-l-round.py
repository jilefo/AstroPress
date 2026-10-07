#!/usr/bin/env python3
"""L 轮 5 个新插件专项测试：user-roles / dashboard-widgets / notification-center / media-folders / two-factor-auth
需要本地 dev server 运行在 http://localhost:4321，且已用管理员登录。"""
import os
import json, sys, urllib.request, urllib.error, http.cookiejar, time

BASE = "http://localhost:4321"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "l-round-test/1.0")]

passed = failed = 0

def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        print(f"  [FAIL] {name}" + (f" — {detail}" if detail else ""))

def req(method, path, data=None, headers=None):
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
print("=" * 60)
print("L 轮测试：5 个新插件")
print("=" * 60)

print("\n--- 准备：管理员登录 ---")
check("管理员登录", login())

# ───────────────────────────── 1. user-roles ─────────────────────────────
print("\n--- 1. user-roles（用户角色权限执行）---")

# 后台页面可访问（管理员有 manage_options）
st, _, body = req("GET", "/admin-ext/user-roles")
check("能力矩阵页 200", st == 200, f"HTTP {st}")
check("能力矩阵页含 HTML 内容", b"</body>" in body or b"capability" in body.lower() or b"role" in body.lower(),
      f"body[:80]={body[:80]}")

# API 端点（管理员应该能正常访问）
st, _, _ = req("GET", "/api/users")
check("管理员访问 /api/users", st == 200, f"HTTP {st}")

# 侧边栏注入验证
st, _, body = req("GET", "/admin/dashboard")
check("Dashboard 200", st == 200, f"HTTP {st}")
body_str = body.decode("utf-8", "replace")
check("侧边栏注入 user-roles 入口",
      "user-roles" in body_str or "用户角色" in body_str,
      "未找到注入内容")

# ───────────────────────────── 2. dashboard-widgets ─────────────────────────────
print("\n--- 2. dashboard-widgets（仪表盘增强）---")

# Dashboard 页面可访问
st, _, body = req("GET", "/admin/dashboard")
check("Dashboard 页面 200", st == 200, f"HTTP {st}")
body_str = body.decode("utf-8", "replace")
check("Dashboard 注入 widget 脚本",
      "dashboard-widgets" in body_str or "widget" in body_str.lower(),
      "未找到 widget 注入")

# 统计 API
st, _, body = req("GET", "/admin-ext/api/dashboard-widgets/stats")
check("统计 API 200", st == 200, f"HTTP {st}")
try:
    data = json.loads(body)
    check("统计 API 返回 ok:true", data.get("ok") is True, f"response={str(data)[:120]}")
    stats = data.get("stats", {})
    check("统计 API 含 posts 字段", "posts" in stats, f"stats keys={list(stats.keys())}")
    check("统计 API 含 drafts 字段", "drafts" in stats)
    check("统计 API 含 users 字段", "users" in stats)
    check("统计 API 含 comments 字段", "comments" in stats)
    check("统计 API 含 dbSize 字段", "dbSize" in stats)
    check("统计 API 含 recentPosts", "recentPosts" in data)
    check("统计 API 含 drafts 列表", "drafts" in data)
except Exception as e:
    check("统计 API JSON 解析", False, str(e))

# ───────────────────────────── 3. notification-center ─────────────────────────────
print("\n--- 3. notification-center（通知中心）---")

# 管理页
st, _, body = req("GET", "/admin-ext/notification-center")
check("通知管理页 200", st == 200, f"HTTP {st}")
check("通知管理页含 HTML", b"</body>" in body, f"body[:80]={body[:80]}")

# 未读数量 API
st, _, body = req("GET", "/admin-ext/api/notifications/unread-count")
check("未读数量 API 200", st == 200, f"HTTP {st}")
try:
    data = json.loads(body)
    check("未读数量 API 含 count 字段", "count" in data, f"response={str(data)[:80]}")
except Exception as e:
    check("未读数量 JSON 解析", False, str(e))

# 列表 API
st, _, body = req("GET", "/admin-ext/api/notifications/list?page=1&perPage=10")
check("列表 API 200", st == 200, f"HTTP {st}")
try:
    data = json.loads(body)
    check("列表 API 含 items 字段", "items" in data, f"response={str(data)[:120]}")
    check("列表 API 含 total 字段", "total" in data)
except Exception as e:
    check("列表 API JSON 解析", False, str(e))

# 全部标记已读
st, _, body = req("POST", "/admin-ext/api/notifications/read-all")
check("全部标记已读 API 200", st == 200, f"HTTP {st}")
try:
    data = json.loads(body)
    check("全部标记已读 ok:true", data.get("ok") is True, f"response={str(data)[:80]}")
except Exception as e:
    check("全部标记已读 JSON 解析", False, str(e))

# 铃铛注入验证
st, _, body = req("GET", "/admin/posts")
body_str = body.decode("utf-8", "replace")
check("后台页面注入通知铃铛",
      "ap-nc-bell" in body_str or "notification" in body_str.lower(),
      "未找到铃铛注入")

# ───────────────────────────── 4. media-folders ─────────────────────────────
print("\n--- 4. media-folders（媒体文件夹管理）---")

# 管理页
st, _, body = req("GET", "/admin-ext/media-folders")
check("文件夹管理页 200", st == 200, f"HTTP {st}")
check("文件夹管理页含 HTML", b"</body>" in body, f"body[:80]={body[:80]}")

# 列表 API
st, _, body = req("GET", "/admin-ext/api/media-folders/list")
check("文件夹列表 API 200", st == 200, f"HTTP {st}")
try:
    data = json.loads(body)
    check("文件夹列表含 folders 字段", "folders" in data, f"response={str(data)[:120]}")
except Exception as e:
    check("文件夹列表 JSON 解析", False, str(e))

# 创建文件夹
st, _, body = req("POST", "/admin-ext/api/media-folders/create", {"name": "测试文件夹-L轮"})
check("创建文件夹 API 200", st == 200, f"HTTP {st}")
folder_id = 0
try:
    data = json.loads(body)
    check("创建文件夹返回 ok", data.get("ok") is True or "id" in data, f"response={str(data)[:120]}")
    folder_id = data.get("id", 0)
except Exception as e:
    check("创建文件夹 JSON 解析", False, str(e))

# 重命名文件夹
if folder_id:
    st, _, body = req("POST", "/admin-ext/api/media-folders/rename", {"id": folder_id, "name": "测试文件夹-已重命名"})
    check("重命名文件夹 API 200", st == 200, f"HTTP {st}")
else:
    check("重命名文件夹 API（跳过，无 folder_id）", False)

# 删除文件夹
if folder_id:
    st, _, body = req("POST", "/admin-ext/api/media-folders/delete", {"id": folder_id, "confirm": True})
    check("删除文件夹 API 200", st == 200, f"HTTP {st}")
else:
    check("删除文件夹 API（跳过，无 folder_id）", False)

# 侧边栏注入
st, _, body = req("GET", "/admin/medias")
body_str = body.decode("utf-8", "replace")
check("媒体库页面注入文件夹链接",
      "media-folders" in body_str or "媒体文件夹" in body_str,
      "未找到侧边栏注入")

# ───────────────────────────── 5. two-factor-auth ─────────────────────────────
print("\n--- 5. two-factor-auth（两步验证）---")

# 设置页
st, _, body = req("GET", "/admin-ext/two-factor-auth")
check("2FA 设置页 200", st == 200, f"HTTP {st}")
check("2FA 设置页含 HTML", b"</body>" in body, f"body[:80]={body[:80]}")

# Setup API（生成密钥）
st, _, body = req("POST", "/admin-ext/api/2fa/setup")
check("2FA setup API 200", st == 200, f"HTTP {st}")
secret = ""
try:
    data = json.loads(body)
    check("2FA setup 返回 secret", "secret" in data, f"response={str(data)[:120]}")
    secret = data.get("secret", "")
    check("2FA setup 返回 uri", "uri" in data, f"含 otpauth URI")
except Exception as e:
    check("2FA setup JSON 解析", False, str(e))

# Validate API（用错误的验证码测试应该失败）
st, _, body = req("POST", "/admin-ext/api/2fa/validate", {"code": "000000"})
try:
    data = json.loads(body)
    check("2FA 错误验证码返回失败", data.get("valid") is False or data.get("ok") is False,
          f"response={str(data)[:120]}")
except Exception as e:
    check("2FA validate JSON 解析", False, str(e))

# Disable API（未启用状态下禁用应该是 no-op 成功）
st, _, body = req("POST", "/admin-ext/api/2fa/disable", {"confirm": True})
check("2FA disable API 200", st == 200, f"HTTP {st}")

# ───────────────────────────── 侧边栏注入汇总 ─────────────────────────────
print("\n--- 6. 侧边栏注入汇总验证 ---")
st, _, body = req("GET", "/admin/dashboard")
body_str = body.decode("utf-8", "replace")
check("侧边栏: user-roles 入口", "user-roles" in body_str)
check("侧边栏: notification-center 入口", "notification-center" in body_str or "通知" in body_str)
check("侧边栏: media-folders 入口", "media-folders" in body_str or "媒体文件夹" in body_str)
check("侧边栏: two-factor-auth 入口", "two-factor-auth" in body_str or "两步验证" in body_str)

# ───────────────────────────── 结果汇总 ─────────────────────────────
print("\n" + "=" * 60)
total = passed + failed
print(f"L 轮测试完成：{total} 项，通过 {passed}，失败 {failed}")
print("=" * 60)

sys.exit(1 if failed > 0 else 0)
