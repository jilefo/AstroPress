#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B 轮深度功能测试：
  A. 插件注册修复（customer-service/donation/footer/permalink/share/sitemap/static-html 出现设置入口、禁用守卫）
  B. 文件管理器全功能（浏览/新建/查看/编辑/重命名/复制/移动/上传/下载/打包/解压/删除 + 安全项）
  C. 静态 HTML 生成插件（设置 CRUD/校验/鉴权/CSRF/真实生成/产物/sitemap/rss/历史）
结果写 scripts/plugin-test-result-b.json
"""
import json, os, re, sys, time, uuid, urllib.request, urllib.error, urllib.parse, http.cookiejar

BASE = "http://localhost:4321"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "plugin-test-b/1.0")]

results = []

def record(plugin, name, ok, detail=""):
    results.append((plugin, name, "pass" if ok else "fail", detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {plugin} :: {name}" + (f" — {detail}" if detail and not ok else ""))

def req(method, path, data=None, headers=None, raw_body=None, content_type=None):
    h = dict(headers or {})
    body = None
    if raw_body is not None:
        body = raw_body.encode("utf-8") if isinstance(raw_body, str) else raw_body
        if content_type: h["Content-Type"] = content_type
    elif data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=60) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()

def jreq(method, path, data=None, headers=None, raw_body=None, content_type=None):
    st, h, b = req(method, path, data=data, headers=headers, raw_body=raw_body, content_type=content_type)
    try: return st, h, json.loads(b.decode("utf-8", "replace"))
    except Exception: return st, h, b.decode("utf-8", "replace")

def j2(method, path, data=None, headers=None, raw_body=None, content_type=None):
    """只返回 (status, body) 的便捷封装"""
    st, _, b = jreq(method, path, data=data, headers=headers, raw_body=raw_body, content_type=content_type)
    return st, b

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw): return None
no_redir = urllib.request.build_opener(NoRedirect)

def anon_status(path):
    try:
        with no_redir.open(BASE + path, timeout=15) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

def jget(path):
    st, _, b = req("GET", path)
    return st, (json.loads(b.decode("utf-8", "replace")) if not isinstance(b, str) else b)

# ───────────────────────────── 登录 ─────────────────────────────
st, _, _ = req("POST", "/api/auth/login", raw_body="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "",
               content_type="application/x-www-form-urlencoded")
record("setup", "管理员登录", st in (200, 302), f"HTTP {st}")

# ═══════════════════════════ A. 注册修复 ═══════════════════════════
st, plugins = jget("/admin-ext/api/plugin-manager/state")
by = {p["slug"]: p for p in plugins} if isinstance(plugins, list) else {}
TARGETS = ["customer-service", "donation", "footer", "permalink", "share", "sitemap", "static-html"]
record("plugin-manager", "插件列表 API 可访问", st == 200 and isinstance(plugins, list))
for slug in TARGETS:
    p = by.get(slug)
    record("plugin-manager", f"{slug} 已注册且有 settingsUrl",
           bool(p and p.get("settingsUrl")), str(p and p.get("settingsUrl")))
    record("plugin-manager", f"{slug} 注册了 optionKeys", bool(p and p.get("optionKeys")),
           str(p and p.get("optionKeys")))

PAGES = ["/admin-ext/customer-service", "/admin-ext/donation", "/admin-ext/footer",
         "/admin-ext/permalink", "/admin-ext/share", "/admin-ext/sitemap",
         "/admin-ext/static-html"]
for path in PAGES:
    st, _, _ = req("GET", path)
    record("registry-fix", f"设置页 {path} 登录后可访问(200)", st == 200, f"HTTP {st}")

# 禁用守卫：禁用 → 后台页 404；启用 → 恢复
def toggle(slug, enabled):
    return jreq("POST", "/admin-ext/api/plugin-manager/state", {"slug": slug, "enabled": enabled})[0]

for slug, probe in [("customer-service", "/admin-ext/customer-service"),
                    ("donation", "/admin-ext/api/donation/settings"),
                    ("permalink", "/admin-ext/permalink")]:
    code_off = toggle(slug, False)
    time.sleep(0.3)
    st1, _, _ = req("GET", probe)
    code_on = toggle(slug, True)
    time.sleep(0.3)
    st2, _, _ = req("GET", probe)
    record("plugin-manager", f"{slug} 禁用后路由 404({st1})/启用后恢复({st2})",
           code_off == 200 and st1 == 404 and code_on == 200 and st2 == 200,
           f"off={code_off}/probe={st1}/on={code_on}/probe2={st2}")

# 四个带 API 的设置端点 GET
for path in ["/admin-ext/api/customer-service/settings", "/admin-ext/api/donation/settings",
             "/admin-ext/api/footer/settings", "/admin-ext/api/share/settings"]:
    st, data = jget(path)
    record("registry-fix", f"GET {path}", st == 200 and isinstance(data, dict), f"HTTP {st}")

# sitemap 设置页直接 POST JSON 保存
st, _, _ = req("POST", "/admin-ext/sitemap", {"enabled": True, "maxPosts": 1000, "includePages": True})
record("registry-fix", "sitemap 设置页 POST 保存", st == 200, f"HTTP {st}")

# 未登录鉴权（独立 opener，不跟随重定向）
record("registry-fix", "匿名访问后台设置页被拦截", anon_status("/admin-ext/donation") in (302, 303, 401, 403))

# 管理器禁用闸门：客服/页脚(全站) + 分享/打赏(文章页) 被禁用时前台 HTML 零注入。
# 状态读取带 15s 缓存，故批量切换后等待一个缓存周期。
_st, _, _sitemap_raw = req("GET", "/sitemap.xml")
_sm_text = _sitemap_raw.decode("utf-8", "replace")
_m = re.search(r"<loc>[^<]*/blog/([^<]+)</loc>", _sm_text)
# permalink 插件默认启用：文章路径为 /{slug}，sitemap 也应包含根路径
if not _m:
    _m = re.search(r"<loc>http://localhost:4321/([a-zA-Z0-9_-]+)</loc>", _sm_text)
_post_probe = "/" + _m.group(1) if _m else "/pv-tips"
_inj_gates = [
    ("customer-service", "/", 'id="apcs-root"'),
    ("footer", "/", 'id="ap-footer"'),
    ("share", _post_probe, 'id="ap-share-root"'),
    ("donation", _post_probe, 'id="ap-donation"'),
]
for _slug, _, _ in _inj_gates:
    toggle(_slug, True)
time.sleep(16.5)
for _slug, _probe, _marker in _inj_gates:
    _st, _, _raw = req("GET", _probe)
    record("injection-gate", f"{_slug} 启用时前台已注入", _marker in _raw.decode("utf-8", "replace"),
           f"probe={_probe} http={_st}")
for _slug, _, _ in _inj_gates:
    toggle(_slug, False)
time.sleep(16.5)
for _slug, _probe, _marker in _inj_gates:
    _st, _, _raw = req("GET", _probe)
    record("injection-gate", f"{_slug} 管理器禁用后前台零注入", _marker not in _raw.decode("utf-8", "replace"),
           f"probe={_probe} http={_st}")
for _slug, _, _ in _inj_gates:
    toggle(_slug, True)

# ═══════════════════════════ B. 文件管理器 ═══════════════════════════
SB = "_fmtest_" + uuid.uuid4().hex[:8]
API = "/admin-ext/api/files"

def local(*parts): return os.path.join(ROOT, SB.replace("/", os.sep), *parts)

try:
    # 1. 新建文件夹（含嵌套）
    st, d = j2("POST", API + "/mkdir", {"path": SB})
    record("file-manager", "新建根测试目录", st == 200 and d.get("ok"), str(d)[:120])
    st, d = j2("POST", API + "/mkdir", {"path": SB + "/sub"})
    record("file-manager", "新建子目录", st == 200 and d.get("ok"), str(d)[:120])
    st, d = j2("POST", API + "/mkdir", {"path": SB + "/sub2"})
    record("file-manager", "新建第二个子目录", st == 200 and d.get("ok"), str(d)[:120])
    st, d = j2("POST", API + "/mkdir", {"path": SB + "/sub"})
    record("file-manager", "重复建目录返回 409", st == 409, f"HTTP {st}")

    # 2. 新建/编辑文件（write 仅编辑已存在文件；新建走上传：先上传 a.txt）
    content = "第一行\n\tindented line 2\n中文与符号 <>&\"'\n"
    boundary0 = "----c" + uuid.uuid4().hex
    body0 = (f"--{boundary0}\r\nContent-Disposition: form-data; name=\"dir\"\r\n\r\n{SB}\r\n"
             f"--{boundary0}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.txt\"\r\n"
             "Content-Type: text/plain\r\n\r\n").encode("utf-8") + content.encode("utf-8") \
             + f"\r\n--{boundary0}--\r\n".encode()
    st, _, _ = req("POST", API + "/upload", raw_body=body0,
                   content_type=f"multipart/form-data; boundary={boundary0}")
    record("file-manager", "上传初始 a.txt(供编辑)", st == 200, f"HTTP {st}")
    edited = content + "【编辑新增行】\n"
    st, d = j2("POST", API + "/write", {"path": SB + "/a.txt", "content": edited, "confirm": True})
    record("file-manager", "write 编辑已有文本文件", st == 200 and d.get("ok") and d.get("size", 0) > 10, str(d)[:120])
    st, d = j2("POST", API + "/write", {"path": SB + "/a.txt", "content": "x"})
    record("file-manager", "write 缺少 confirm 被拒(403)", st == 403, f"HTTP {st}")
    st, d = j2("POST", API + "/write", {"path": SB + "/ghost.txt", "content": "x", "confirm": True})
    record("file-manager", "write 不存在文件走新建(created=true)", st == 200 and d.get("created") is True, f"HTTP {st} {str(d)[:80]}")
    st, d = j2("POST", API + "/write", {"path": SB + "/no-dir/ghost.txt", "content": "x", "confirm": True})
    record("file-manager", "write 父目录不存在返回 404", st == 404, f"HTTP {st}")
    st, d = j2("POST", API + "/write", {"path": SB + "/evil.exe", "content": "x", "confirm": True})
    record("file-manager", "write 非白名单扩展名被拒", st in (400, 403, 415), f"HTTP {st}")

    # 3. 查看文件（read）
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/a.txt"))
    record("file-manager", "read 内容一致(含中文/Tab/特殊符号)",
           st == 200 and d.get("content") == edited, f"HTTP {st}")
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/nope.txt"))
    record("file-manager", "read 不存在文件 404", st == 404, f"HTTP {st}")
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/sub"))
    record("file-manager", "read 目录返回 400", st == 400, f"HTTP {st}")
    st2, _ = j2("GET", API + "/read?path=" + urllib.parse.quote("../../../../Windows/win.ini"))
    record("file-manager", "read 路径穿越出站点根被拒", st2 in (400, 403, 404), f"HTTP {st2}")

    # 4. 列表
    st, d = j2("GET", API + "/list?path=" + urllib.parse.quote(SB))
    names = [e.get("name") for e in d.get("items", [])] if isinstance(d, dict) else []
    record("file-manager", "list 目录含 a.txt/sub/sub2",
           st == 200 and {"a.txt", "sub", "sub2"} <= set(names), str(names))

    # 5. 重命名
    st, d = j2("POST", API + "/rename", {"path": SB + "/a.txt", "to": "b.txt", "confirm": True})
    record("file-manager", "重命名 a.txt→b.txt", st == 200 and d.get("ok"), str(d)[:120])
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/b.txt"))
    record("file-manager", "重命名后内容保持不变", st == 200 and d.get("content") == edited)
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/a.txt"))
    record("file-manager", "旧文件名已不存在", st == 404)
    st, d = j2("POST", API + "/rename", {"path": SB + "/b.txt", "to": "x/y.txt", "confirm": True})
    record("file-manager", "重命名含分隔符被拒(400)", st == 400, f"HTTP {st}")

    # 6. 复制
    st, d = j2("POST", API + "/copy", {"sources": [SB + "/b.txt"], "destDir": SB + "/sub", "confirm": True})
    record("file-manager", "复制 b.txt → sub/", st == 200 and d.get("ok"), str(d)[:150])
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/sub/b.txt"))
    record("file-manager", "复制后目标内容一致", st == 200 and d.get("content") == edited)
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/b.txt"))
    record("file-manager", "复制后源文件仍存在", st == 200)
    st, d = j2("POST", API + "/copy", {"sources": [SB + "/b.txt"], "destDir": SB + "/sub"})
    record("file-manager", "复制缺少 confirm 被拒", st == 403, f"HTTP {st}")

    # 7. 移动
    st, d = j2("POST", API + "/move", {"sources": [SB + "/b.txt"], "destDir": SB + "/sub2", "confirm": True})
    record("file-manager", "移动 b.txt → sub2/", st == 200 and d.get("ok"), str(d)[:150])
    st, _ = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/sub2/b.txt"))
    st2, _ = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/b.txt"))
    record("file-manager", "移动：新位置存在/旧位置消失", st == 200 and st2 == 404, f"{st}/{st2}")

    # 8. 打包 ZIP
    st, d = j2("POST", API + "/zip", {"paths": [SB + "/sub"], "confirm": True})
    zip_rel = d.get("path") if isinstance(d, dict) else None
    record("file-manager", "打包 sub → sub.zip", st == 200 and bool(zip_rel) and d.get("count") == 1, str(d)[:150])
    record("file-manager", "zip 文件真实落盘", bool(zip_rel) and os.path.isfile(os.path.join(ROOT, zip_rel.replace("/", os.sep))))

    # 9. 解压
    st, d = j2("POST", API + "/unzip", {"path": zip_rel, "confirm": True})
    out_dir = d.get("dir") if isinstance(d, dict) else None
    record("file-manager", "解压 sub.zip", st == 200 and d.get("count") == 1, str(d)[:150])
    expect = SB + "/" + out_dir + "/sub/b.txt"
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(expect))
    record("file-manager", "解压产物内容正确(sub/b.txt)", st == 200 and isinstance(d, dict) and d.get("content") == edited,
           f"{st} {expect}")
    st, d = j2("POST", API + "/unzip", {"path": SB + "/sub", "confirm": True})
    record("file-manager", "解压非 zip 路径被拒(400)", st == 400, f"HTTP {st}")

    # 10. 上传
    boundary = "----b" + uuid.uuid4().hex
    up_content = "uploaded 文件内容\n".encode("utf-8")
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"dir\"\r\n\r\n{SB}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"upload.txt\"\r\n"
            "Content-Type: text/plain\r\n\r\n").encode("utf-8") + up_content + f"\r\n--{boundary}--\r\n".encode()
    st, hdr, raw = req("POST", API + "/upload", raw_body=body,
                       content_type=f"multipart/form-data; boundary={boundary}")
    up_json = None
    try: up_json = json.loads(raw.decode())
    except Exception: pass
    record("file-manager", "上传 upload.txt", st == 200 and bool(up_json and up_json.get("ok")), str(raw[:120]))
    st, d = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/upload.txt"))
    record("file-manager", "上传文件内容正确", st == 200 and d.get("content") == up_content.decode())

    # 11. 下载
    st, hdr, raw = req("GET", API + "/download?path=" + urllib.parse.quote(SB + "/upload.txt"))
    record("file-manager", "下载返回 200 且字节一致", st == 200 and raw == up_content,
           f"HTTP {st} {len(raw)}B")
    record("file-manager", "下载含 Content-Disposition",
           "attachment" in (hdr.get("Content-Disposition") or hdr.get("content-disposition") or ""))

    # 12. 目录树 API（复制/移动弹窗用）
    st, d = j2("GET", API + "/dirs?path=")
    record("file-manager", "dirs 目录树 API 200", st == 200, f"HTTP {st}")

    # 13. 安全：受保护目录写入
    st, d = j2("POST", API + "/write", {"path": ".git/_fm_evil.txt", "content": "x", "confirm": True})
    record("file-manager", "写入 .git 受保护目录被拒", st in (400, 403), f"HTTP {st}")
    st, d = j2("POST", API + "/mkdir", {"path": "node_modules/_fm_evil"})
    record("file-manager", "在 node_modules 建目录被拒", st in (400, 403), f"HTTP {st}")
    st, d = j2("POST", API + "/write", {"path": "../../_fm_evil.txt", "content": "x", "confirm": True})
    record("file-manager", "write 路径穿越被拒", st in (400, 403), f"HTTP {st}")

    # 14. 未登录鉴权
    anon_st = anon_status(API + "/list?path=")
    record("file-manager", "匿名 list 被拒(401/403/302)", anon_st in (401, 403, 302, 303), str(anon_st))

    # 15. 删除
    st, d = j2("POST", API + "/delete", {"paths": [SB + "/upload.txt"]})
    record("file-manager", "delete 缺 confirm 被拒(403)", st == 403, f"HTTP {st}")
    st, d = j2("POST", API + "/delete", {"paths": [SB + "/upload.txt"], "confirm": True})
    record("file-manager", "删除单文件", st == 200 and d.get("ok"), str(d)[:120])
    st, _ = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/upload.txt"))
    record("file-manager", "删除后文件 404", st == 404)

finally:
    # 16. 清理：递归删除整个沙箱目录
    st, d = j2("POST", API + "/delete", {"paths": [SB], "confirm": True})
    cleanup_ok = st == 200 and (isinstance(d, dict) and d.get("ok"))
    record("file-manager", "递归删除沙箱目录", cleanup_ok, str(d)[:150])
    st, _ = j2("GET", API + "/list?path=" + urllib.parse.quote(SB))
    record("file-manager", "沙箱删除后 list 404", st == 404, f"HTTP {st}")
    if os.path.isdir(os.path.join(ROOT, SB)):
        import shutil; shutil.rmtree(os.path.join(ROOT, SB), ignore_errors=True)

# ═══════════════════════════ C. 静态 HTML 插件 ═══════════════════════════
SH = "/admin-ext/api/static-html"
st, s0 = jget(SH + "/settings")
orig_s = s0 if isinstance(s0, dict) else None
record("static-html", "GET 设置(默认结构)", st == 200 and isinstance(s0, dict)
       and {"enabled", "outputDir", "schedule", "includeAssets"} <= set(s0.keys()), str(s0)[:160])

st, d = j2("POST", SH + "/settings", {
    "enabled": True, "outputDir": "static-html", "schedule": "daily", "scheduleTime": "03:30",
    "scheduleWeekday": 2, "includePages": True, "includeAssets": True, "maxPosts": 500})
record("static-html", "POST 设置全字段保存", st == 200 and d.get("ok") and d["settings"]["scheduleTime"] == "03:30"
       and d["settings"]["maxPosts"] == 500, str(d)[:160])
st, s1 = jget(SH + "/settings")
record("static-html", "设置持久化(GET 回读一致)", st == 200 and s1.get("schedule") == "daily"
       and s1.get("scheduleWeekday") == 2)

st, d = j2("POST", SH + "/settings", {"outputDir": "../evil", "schedule": "weird", "scheduleTime": "99:99"})
norm = d.get("settings", {})
record("static-html", "非法输出目录/计划/时间回退默认",
       st == 200 and norm.get("outputDir") == "static-html" and norm.get("schedule") == "manual"
       and norm.get("scheduleTime") == "03:00", str(norm))
st, d = j2("POST", SH + "/settings", {"outputDir": "apps", "schedule": "manual"})
record("static-html", "系统目录 apps 禁止作为输出目录", d.get("settings", {}).get("outputDir") != "apps")
st, d = j2("POST", SH + "/settings", {"outputDir": "C:\\Windows\\x", "schedule": "manual"})
record("static-html", "绝对路径输出目录被拒", d.get("settings", {}).get("outputDir") != "C:\\Windows\\x")

# CSRF：伪造外部 Origin
st, d = j2("POST", SH + "/settings", {"enabled": False}, headers={"Origin": "http://evil.example.com"})
record("static-html", "跨域 Origin POST 被拒(403)", st == 403, f"HTTP {st}")
st, d = j2("POST", SH + "/generate", {"confirm": True}, headers={"Origin": "http://evil.example.com"})
record("static-html", "跨域触发生成被拒(403)", st == 403, f"HTTP {st}")

# 鉴权
anon_st = anon_status(SH + "/status")
record("static-html", "匿名 GET status 被拒", anon_st in (401, 403, 302, 303), str(anon_st))

# generate 校验
st, d = j2("POST", SH + "/generate", {})
record("static-html", "generate 缺 confirm 被拒(400)", st == 400, f"HTTP {st}")
# 原始非法 JSON
st, hdr, raw = req("POST", SH + "/generate", raw_body="{bad", content_type="application/json")
record("static-html", "generate 非法 JSON 被拒(400)", st == 400, f"HTTP {st}")

# 恢复正确设置后真实生成
jreq("POST", SH + "/settings", {"enabled": True, "outputDir": "static-html", "schedule": "manual",
                                "scheduleTime": "03:00", "scheduleWeekday": 0,
                                "includePages": True, "includeAssets": True, "maxPosts": 2000})
st, d = j2("POST", SH + "/generate", {"confirm": True})
record("static-html", "触发生成 200", st == 200 and d.get("ok"), str(d)[:120])

final_state = None
for i in range(45):
    time.sleep(2)
    st, d = jget(SH + "/status")
    final_state = d.get("state", {})
    if not final_state.get("running"):
        break
record("static-html", "生成任务在 90s 内结束", final_state is not None and not final_state.get("running"),
       str(final_state and final_state.get("phase")))
record("static-html", "生成状态 ok/warn（无页面失败）",
       final_state is not None and final_state.get("status") in ("ok", "warn"),
       str(final_state and final_state.get("status")))
record("static-html", "首页已导出(index.html)",
       final_state is not None and final_state.get("pages", 0) >= 1, str(final_state and final_state.get("pages")))

out = os.path.join(ROOT, "static-html")
record("static-html", "产物 index.html 存在", os.path.isfile(os.path.join(out, "index.html")))
record("static-html", "产物 sitemap.xml 存在且合法", os.path.isfile(os.path.join(out, "sitemap.xml")))
record("static-html", "产物 rss.xml 存在且合法", os.path.isfile(os.path.join(out, "rss.xml")))
sm = open(os.path.join(out, "sitemap.xml"), encoding="utf-8").read()
# permalink 默认启用 → 文章 URL 应为 /{slug}
record("static-html", "sitemap 含文章 URL(/slug/)", "<loc>http://localhost:4321/pv-tips</loc>" in sm
       and "<urlset" in sm)
rss = open(os.path.join(out, "rss.xml"), encoding="utf-8").read()
record("static-html", "rss 含 <item> 与文章链接", "<item>" in rss and "pv-tips" in rss and "<rss" in rss)
post_path = os.path.join(out, "pv-tips", "index.html")
record("static-html", "文章按目录式导出 pv-tips/index.html", os.path.isfile(post_path)
       and "</html>" in open(post_path, encoding="utf-8", errors="replace").read())

st, d = jget(SH + "/status")
runs = d.get("runs", [])
record("static-html", "生成历史已记录(≥1 条)", runs and runs[0].get("status") in ("ok", "warn")
       and runs[0].get("pages", 0) >= 1, str(runs[0] if runs else None)[:160])

# 二次生成（覆盖）不报错
st, d = j2("POST", SH + "/generate", {"confirm": True})
ok2 = st == 200 and d.get("ok")
for i in range(45):
    time.sleep(2)
    _, d2 = jget(SH + "/status")
    if not d2.get("state", {}).get("running"): break
record("static-html", "二次覆盖生成成功", ok2 and d2.get("state", {}).get("status") in ("ok", "warn"))

# 产物洁净度：导出 HTML 不含 dev-only 标签；旧产物目录已被清空
_out = os.path.join(ROOT, "static-html")
_residue = []
for _dp, _, _fs in os.walk(_out):
    for _fn in _fs:
        if _fn.endswith(".html"):
            _t = open(os.path.join(_dp, _fn), encoding="utf-8", errors="replace").read()
            if "/@vite/" in _t or "/@fs/" in _t or "<astro-dev-toolbar" in _t:
                _residue.append(os.path.relpath(os.path.join(_dp, _fn), _out))
record("static-html", "导出 HTML 无 dev-only 标签(HMR/调试栏)", not _residue, str(_residue))
record("static-html", "重新生成已清空旧产物(无 @vite 目录)", not os.path.exists(os.path.join(_out, "@vite")))

# 恢复原始设置
if orig_s is not None:
    jreq("POST", SH + "/settings", orig_s)

# ───────────────────────────── 汇总写盘 ─────────────────────────────
passed = sum(1 for r in results if r[2] == "pass")
failed = len(results) - passed
print(f"\nB 轮深度测试: TOTAL={len(results)} PASS={passed} FAIL={failed}")
out_json = {"results": [{"plugin": p, "case": n, "status": s, "detail": d, "ms": 0}
                        for p, n, s, d in results],
            "summary": {"total": len(results), "pass": passed, "fail": failed, "warn": 0}}
with open("scripts/plugin-test-result-b.json", "w", encoding="utf-8") as f:
    json.dump(out_json, f, ensure_ascii=False, indent=2)
print("已写 scripts/plugin-test-result-b.json")
sys.exit(0 if failed == 0 else 1)
