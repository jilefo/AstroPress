#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
C 轮全量测试：
  0. 基线合并：以子进程方式运行 test-plugins-full.py（217 项，覆盖全部既有插件），
     读取 scripts/plugin-test-result.json 合并进本轮结果。
  A. file-manager 文件管理器全功能（浏览/新建目录/新建文件/上传/下载/查看/编辑/
     复制(重名自动加后缀)/移动/重命名/打包/解压/删除 + 安全项）
  B. gitalk-comment 新插件（管理页/设置往返/掩码不覆盖/前台注入/禁用不注入）
  C. static-html 管理页与状态接口（不真跑全站生成）
  D. 并发与安全抽查（畸形 JSON 400、路径穿越 400、XSS 文件名 400、匿名 401/302）
  E. 主题系统：GET /api/themes 含 10 个移植主题；逐个激活后抓 / 与 /pv-tips 验证
     200 + tokens.colors.primary 注入 + <article>/post-content；最后还原 base-theme
结果写 scripts/plugin-test-result-c.json
"""
import json, os, re, sys, time, uuid, shutil, subprocess
import urllib.request, urllib.error, urllib.parse, http.cookiejar

BASE = "http://localhost:4321"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "plugin-test-c/1.0")]

results = []  # (plugin, case, status, detail, ms)

def record(plugin, name, ok, detail="", ms=0):
    results.append((plugin, name, "pass" if ok else "fail", str(detail)[:600], round(ms, 1)))
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
    t0 = time.perf_counter()
    try:
        with opener.open(r, timeout=60) as resp:
            b = resp.read()
            return resp.status, dict(resp.headers), b, (time.perf_counter() - t0) * 1000
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read(), (time.perf_counter() - t0) * 1000

def j2(method, path, data=None, headers=None, raw_body=None, content_type=None):
    st, _, b, ms = req(method, path, data=data, headers=headers, raw_body=raw_body, content_type=content_type)
    try:
        return st, json.loads(b.decode("utf-8", "replace")), ms
    except Exception:
        return st, b.decode("utf-8", "replace"), ms

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw): return None
no_redir = urllib.request.build_opener(NoRedirect)

def anon_status(path, method="GET", data=None):
    body = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json"} if data is not None else {}
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with no_redir.open(r, timeout=15) as resp: return resp.status
    except urllib.error.HTTPError as e: return e.code

# ───────────────────────────── 登录 ─────────────────────────────
st, _, _, ms = req("POST", "/api/auth/login", raw_body="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "",
                   content_type="application/x-www-form-urlencoded")
record("setup", "管理员登录", st in (200, 302), f"HTTP {st}", ms)
if st not in (200, 302):
    print("登录失败，终止"); sys.exit(1)

# ───────────────────── 0. 基线全量回归（子进程） ─────────────────────
print("\n===== 0. 基线 test-plugins-full.py + test-new-plugins.py（270 项既有插件回归） =====")
t0 = time.perf_counter()
proc = subprocess.run([sys.executable, os.path.join("scripts", "test-plugins-full.py")],
                      cwd=ROOT, capture_output=True, text=True, timeout=900,
                      encoding="utf-8", errors="replace")
proc2 = subprocess.run([sys.executable, os.path.join("scripts", "test-new-plugins.py")],
                       cwd=ROOT, capture_output=True, text=True, timeout=600,
                       encoding="utf-8", errors="replace")
base_ms = (time.perf_counter() - t0) * 1000
baseline = None
try:
    with open(os.path.join("scripts", "plugin-test-result.json"), encoding="utf-8") as f:
        baseline = json.load(f)
except Exception as e:
    print("读取基线结果失败:", e)
if baseline:
    for r in baseline["results"]:
        results.append((r["plugin"], "[基线] " + r["case"], r["status"], r.get("detail", ""), r.get("ms", 0)))
    bs = baseline["summary"]
    record("baseline", f"基线套件整体回归({bs['pass']}/{bs['total']})", bs["fail"] == 0,
           f"pass={bs['pass']} fail={bs['fail']} warn={bs.get('warn',0)} 耗时{base_ms/1000:.1f}s", base_ms)
    for out in (proc.stdout, proc2.stdout):
        for line in out.splitlines():
            if line.startswith("[FAIL]"):
                print("  基线失败:", line)
else:
    record("baseline", "基线套件运行并产出结果", False,
           (proc.stdout[-300:] + proc.stderr[-300:] + proc2.stdout[-300:] + proc2.stderr[-300:]))

# ═════════════════════ A. file-manager 全功能 ═════════════════════
print("\n===== A. file-manager =====")
SB = "_fmtest_c_" + uuid.uuid4().hex[:8]
API = "/admin-ext/api/files"

try:
    st, d, ms = j2("POST", API + "/mkdir", {"path": SB})
    record("file-manager", "mkdir 新建根测试目录", st == 200 and d.get("ok"), str(d)[:120], ms)
    st, d, ms = j2("POST", API + "/mkdir", {"path": SB + "/sub"})
    record("file-manager", "mkdir 新建子目录", st == 200 and d.get("ok"), str(d)[:120], ms)
    st, d, ms = j2("POST", API + "/mkdir", {"path": SB + "/sub"})
    record("file-manager", "mkdir 重复目录返回 409", st == 409, f"HTTP {st}", ms)

    # 新建文件（write 对不存在文件走 created=true）
    content = "第一行\n\tindented line 2\n中文与符号 <>&\"'\n"
    st, d, ms = j2("POST", API + "/write", {"path": SB + "/new.txt", "content": content, "confirm": True})
    record("file-manager", "write 新建文本文件(created=true)", st == 200 and d.get("created") is True, f"HTTP {st} {str(d)[:80]}", ms)

    # 上传
    boundary = "----c" + uuid.uuid4().hex
    up_content = "uploaded 文件内容 C轮\n".encode("utf-8")
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"dir\"\r\n\r\n{SB}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"upload.txt\"\r\n"
            "Content-Type: text/plain\r\n\r\n").encode("utf-8") + up_content + f"\r\n--{boundary}--\r\n".encode()
    st, hdr, raw, ms = req("POST", API + "/upload", raw_body=body,
                           content_type=f"multipart/form-data; boundary={boundary}")
    up_json = None
    try: up_json = json.loads(raw.decode())
    except Exception: pass
    record("file-manager", "upload 上传 upload.txt", st == 200 and bool(up_json and up_json.get("ok")), str(raw[:120]), ms)

    # 编辑保存
    edited = content + "【编辑新增行】\n"
    st, d, ms = j2("POST", API + "/write", {"path": SB + "/new.txt", "content": edited, "confirm": True})
    record("file-manager", "write 编辑已有文件并保存", st == 200 and d.get("ok"), str(d)[:120], ms)
    st, d, ms = j2("POST", API + "/write", {"path": SB + "/new.txt", "content": "x"})
    record("file-manager", "write 缺 confirm 被拒(403)", st == 403, f"HTTP {st}", ms)

    # 查看
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/new.txt"))
    record("file-manager", "read 查看内容一致(含中文/Tab/特殊符号)",
           st == 200 and isinstance(d, dict) and d.get("content") == edited, f"HTTP {st}", ms)
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/nope.txt"))
    record("file-manager", "read 不存在文件 404", st == 404, f"HTTP {st}", ms)

    # 列表
    st, d, ms = j2("GET", API + "/list?path=" + urllib.parse.quote(SB))
    names = [e.get("name") for e in d.get("items", [])] if isinstance(d, dict) else []
    record("file-manager", "list 浏览目录含 new.txt/upload.txt/sub",
           st == 200 and {"new.txt", "upload.txt", "sub"} <= set(names), str(names), ms)

    # 重命名
    st, d, ms = j2("POST", API + "/rename", {"path": SB + "/new.txt", "to": "renamed.txt", "confirm": True})
    record("file-manager", "rename 重命名 new.txt→renamed.txt", st == 200 and d.get("ok"), str(d)[:120], ms)
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/renamed.txt"))
    record("file-manager", "rename 后内容保持不变", st == 200 and isinstance(d, dict) and d.get("content") == edited, f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/rename", {"path": SB + "/renamed.txt", "to": "x/y.txt", "confirm": True})
    record("file-manager", "rename 含分隔符被拒(400)", st == 400, f"HTTP {st}", ms)

    # 复制 + 重名自动加后缀
    st, d, ms = j2("POST", API + "/copy", {"sources": [SB + "/renamed.txt"], "destDir": SB + "/sub", "confirm": True})
    record("file-manager", "copy 复制 renamed.txt → sub/", st == 200 and d.get("ok"), str(d)[:150], ms)
    st, d, ms = j2("POST", API + "/copy", {"sources": [SB + "/renamed.txt"], "destDir": SB + "/sub", "confirm": True})
    dests = [r.get("dest", "") for r in d.get("results", [])] if isinstance(d, dict) else []
    record("file-manager", "copy 重名自动加后缀(renamed-1.txt)",
           st == 200 and d.get("ok") and any("renamed-1.txt" in x for x in dests), str(dests), ms)
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/sub/renamed-1.txt"))
    record("file-manager", "copy 后缀副本内容一致", st == 200 and isinstance(d, dict) and d.get("content") == edited, f"HTTP {st}", ms)
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/renamed.txt"))
    record("file-manager", "copy 后源文件仍存在", st == 200, f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/copy", {"sources": [SB + "/renamed.txt"], "destDir": SB + "/sub"})
    record("file-manager", "copy 缺 confirm 被拒(403)", st == 403, f"HTTP {st}", ms)

    # 移动
    st, d, ms = j2("POST", API + "/move", {"sources": [SB + "/upload.txt"], "destDir": SB + "/sub", "confirm": True})
    record("file-manager", "move 移动 upload.txt → sub/", st == 200 and d.get("ok"), str(d)[:150], ms)
    st, _, ms1 = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/sub/upload.txt"))
    st2, _, _ = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/upload.txt"))
    record("file-manager", "move 后新位置存在/旧位置消失", st == 200 and st2 == 404, f"{st}/{st2}", ms1)

    # 打包 ZIP
    st, d, ms = j2("POST", API + "/zip", {"paths": [SB + "/sub"], "confirm": True})
    zip_rel = d.get("path") if isinstance(d, dict) else None
    record("file-manager", "pack 打包 sub → zip", st == 200 and bool(zip_rel), str(d)[:150], ms)
    record("file-manager", "pack zip 真实落盘",
           bool(zip_rel) and os.path.isfile(os.path.join(ROOT, zip_rel.replace("/", os.sep))))

    # 解压
    st, d, ms = j2("POST", API + "/unzip", {"path": zip_rel, "confirm": True})
    out_dir = d.get("dir") if isinstance(d, dict) else None
    record("file-manager", "unpack 解压 zip", st == 200 and isinstance(d, dict) and d.get("count", 0) >= 1, str(d)[:150], ms)
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/" + str(out_dir) + "/sub/renamed.txt"))
    record("file-manager", "unpack 产物内容正确", st == 200 and isinstance(d, dict) and d.get("content") == edited,
           f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/unzip", {"path": SB + "/sub", "confirm": True})
    record("file-manager", "unpack 非 zip 路径被拒(400)", st == 400, f"HTTP {st}", ms)

    # 下载
    st, hdr, raw, ms = req("GET", API + "/download?path=" + urllib.parse.quote(SB + "/sub/upload.txt"))
    record("file-manager", "download 下载字节一致", st == 200 and raw == up_content, f"HTTP {st} {len(raw)}B", ms)
    record("file-manager", "download 含 Content-Disposition 附件头",
           "attachment" in (hdr.get("Content-Disposition") or hdr.get("content-disposition") or ""))

    # 目录树
    st, d, ms = j2("GET", API + "/dirs?path=")
    record("file-manager", "dirs 目录树 API 200", st == 200, f"HTTP {st}", ms)

    # 安全
    st, d, ms = j2("POST", API + "/write", {"path": ".git/_fmc_evil.txt", "content": "x", "confirm": True})
    record("file-manager", "写入 .git 保护目录被拒", st in (400, 403), f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/mkdir", {"path": "node_modules/_fmc_evil"})
    record("file-manager", "node_modules 建目录被拒", st in (400, 403), f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/mkdir", {"path": ".astro/_fmc_evil"})
    record("file-manager", ".astro 建目录被拒", st in (400, 403), f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/write", {"path": "../../_fmc_evil.txt", "content": "x", "confirm": True})
    record("file-manager", "write 路径穿越 ../../ 被拒", st in (400, 403), f"HTTP {st}", ms)
    st, d, ms = j2("GET", API + "/read?path=" + urllib.parse.quote("../../../../Windows/win.ini"))
    record("file-manager", "read 路径穿越出站点根被拒", st in (400, 403, 404), f"HTTP {st}", ms)
    anon_st = anon_status(API + "/list?path=")
    record("file-manager", "匿名 list 被拒(401/403/302)", anon_st in (401, 403, 302, 303), str(anon_st))

    # 删除
    st, d, ms = j2("POST", API + "/delete", {"paths": [SB + "/sub/upload.txt"]})
    record("file-manager", "delete 缺 confirm 被拒(403)", st == 403, f"HTTP {st}", ms)
    st, d, ms = j2("POST", API + "/delete", {"paths": [SB + "/sub/upload.txt"], "confirm": True})
    record("file-manager", "delete 删除单文件", st == 200 and d.get("ok"), str(d)[:120], ms)
    st, _, ms = j2("GET", API + "/read?path=" + urllib.parse.quote(SB + "/sub/upload.txt"))
    record("file-manager", "delete 后文件 404", st == 404, f"HTTP {st}", ms)
finally:
    st, d, ms = j2("POST", API + "/delete", {"paths": [SB], "confirm": True})
    record("file-manager", "递归删除沙箱目录", st == 200 and isinstance(d, dict) and d.get("ok"), str(d)[:150], ms)
    st, _, ms = j2("GET", API + "/list?path=" + urllib.parse.quote(SB))
    record("file-manager", "沙箱删除后 list 404", st == 404, f"HTTP {st}", ms)
    if os.path.isdir(os.path.join(ROOT, SB)):
        shutil.rmtree(os.path.join(ROOT, SB), ignore_errors=True)

# ═════════════════════ B. gitalk-comment ═════════════════════
print("\n===== B. gitalk-comment =====")
G = "/admin-ext/api/gitalk"
st, d, ms = j2("GET", "/admin-ext/gitalk")
record("gitalk-comment", "管理页 /admin-ext/gitalk 200", st == 200, f"HTTP {st}", ms)

# 快照原始设置原始值（含真实 secret），结束后经 SQL 完整还原
st, q, _ = j2("POST", "/admin-ext/api/db-console/exec",
              {"sql": "SELECT option_value FROM wp_options WHERE option_name='astropress_gitalk_settings'"})
raw_rows = q.get("rows") if isinstance(q, dict) else None
orig_raw_settings = raw_rows[0]["option_value"] if raw_rows else None

st, s0, ms = j2("GET", G + "/settings")
orig_g = s0 if isinstance(s0, dict) else None
record("gitalk-comment", "GET 设置 200 且 clientSecret 已掩码",
       st == 200 and isinstance(s0, dict) and s0.get("clientSecret", "") in ("", "••••••••"),
       f"HTTP {st} keys={list(s0)[:6] if isinstance(s0,dict) else ''}", ms)

payload = {"enabled": True, "clientID": "c-round-client-id", "clientSecret": "c-round-s3cr3t",
           "owner": "octocat", "repo": "blog-comments", "admin": "octocat, hubot",
           "idMode": "pathname", "language": "zh-CN", "perPage": 10, "proxy": "",
           "distractionFreeMode": False, "titleFromPage": True}
st, d, ms = j2("POST", G + "/settings", payload)
record("gitalk-comment", "POST 设置保存，响应 clientSecret 掩码",
       st == 200 and d.get("ok") and d.get("settings", {}).get("clientSecret") == "••••••••",
       f"HTTP {st} {str(d)[:140]}", ms)

st, d, ms = j2("GET", G + "/settings")
record("gitalk-comment", "设置往返一致(clientID/repo/owner)",
       st == 200 and d.get("clientID") == "c-round-client-id" and d.get("repo") == "blog-comments"
       and d.get("owner") == "octocat", f"HTTP {st}", ms)

# 掩码提交不覆盖旧 secret
payload2 = dict(payload); payload2["clientSecret"] = "••••••••"
st, d, ms = j2("POST", G + "/settings", payload2)
record("gitalk-comment", "掩码 secret 提交返回 200", st == 200 and d.get("ok"), f"HTTP {st}", ms)

# 启用后文章页注入（注入的 JSON 配置内含真实 secret → 证明掩码提交未覆盖）
st, _, raw, ms = req("GET", "/pv-tips")
html = raw.decode("utf-8", "replace")
record("gitalk-comment", "启用后文章页注入 gitalk-container",
       st == 200 and 'id="gitalk-container"' in html, f"HTTP {st}", ms)
record("gitalk-comment", "注入配置含 clientID 与 gitalk@1 CDN",
       "c-round-client-id" in html and "gitalk@1" in html)
record("gitalk-comment", "注入配置含原 secret(证明掩码未覆盖旧值)", "c-round-s3cr3t" in html)

# CSRF 与鉴权
st, d, ms = j2("POST", G + "/settings", {"enabled": True}, headers={"Origin": "http://evil.example.com"})
record("gitalk-comment", "跨域 Origin POST 被拒(403)", st == 403, f"HTTP {st}", ms)
anon_st = anon_status(G + "/settings")
record("gitalk-comment", "匿名 GET 设置被拒(401/302)", anon_st in (401, 302, 303, 403), str(anon_st))

# 禁用后不注入（设置缓存 15s）
payload2["enabled"] = False
j2("POST", G + "/settings", payload2)
time.sleep(16.5)
st, _, raw, ms = req("GET", "/pv-tips")
html = raw.decode("utf-8", "replace")
record("gitalk-comment", "禁用后文章页不注入 gitalk-container",
       st == 200 and 'id="gitalk-container"' not in html, f"HTTP {st}", ms)

# 还原设置（经 SQL 还原完整原始值，含 secret；API 的掩码语义无法清 secret）
def sql_quote(s):
    return "'" + s.replace("'", "''") + "'"
if orig_raw_settings is not None:
    st, q, _ = j2("POST", "/admin-ext/api/db-console/exec",
                  {"sql": "UPDATE wp_options SET option_value=" + sql_quote(orig_raw_settings) +
                          " WHERE option_name='astropress_gitalk_settings'", "confirmWrite": True})
    record("gitalk-comment", "还原原始设置(含 secret)", st == 200 and not (isinstance(q, dict) and q.get("error")),
           f"HTTP {st}")
else:
    st, q, _ = j2("POST", "/admin-ext/api/db-console/exec",
                  {"sql": "DELETE FROM wp_options WHERE option_name='astropress_gitalk_settings'",
                   "confirmWrite": True})
    record("gitalk-comment", "还原原始设置(原本无配置→删除)", st == 200, f"HTTP {st}")

# ═════════════════════ C. static-html（管理页+状态，不真生成） ═════════════════════
print("\n===== C. static-html =====")
SH = "/admin-ext/api/static-html"
st, d, ms = j2("GET", "/admin-ext/static-html")
record("static-html", "管理页 /admin-ext/static-html 200", st == 200, f"HTTP {st}", ms)
st, d, ms = j2("GET", SH + "/status")
record("static-html", "GET status 200 含 state/runs",
       st == 200 and isinstance(d, dict) and "state" in d and "runs" in d, f"HTTP {st}", ms)
st, d, ms = j2("GET", SH + "/settings")
record("static-html", "GET settings 200 含 outputDir/schedule",
       st == 200 and isinstance(d, dict) and "outputDir" in d and "schedule" in d, f"HTTP {st}", ms)
anon_st = anon_status(SH + "/status")
record("static-html", "匿名 GET status 被拒", anon_st in (401, 403, 302, 303), str(anon_st))

# ═════════════════════ D. 并发与安全抽查 ═════════════════════
print("\n===== D. 安全抽查 =====")
st, _, raw, ms = req("POST", API + "/write", raw_body="{bad json", content_type="application/json")
record("security", "file-manager write 畸形 JSON 返回 400", st == 400, f"HTTP {st}", ms)
st, _, raw, ms = req("POST", G + "/settings", raw_body="{bad json", content_type="application/json")
record("security", "gitalk settings 畸形 JSON 返回 400", st == 400, f"HTTP {st}", ms)
# 使用不含 '/' 的 XSS payload，避免被解析为路径分隔符；Windows 下含 '>' 非法字符触发 400
st, d, ms = j2("POST", API + "/write", {"path": "xss-<img onerror=alert(1)>.txt", "content": "x", "confirm": True})
record("security", "file-manager XSS 文件名被拒(400/415)", st in (400, 403, 415), f"HTTP {st}", ms)
st, d, ms = j2("POST", API + "/mkdir", {"path": "../../../outside"})
record("security", "mkdir 路径穿越 ../../../ 返回 400", st in (400, 403), f"HTTP {st}", ms)
anon_st = anon_status("/admin-ext/api/plugin-manager/state")
record("security", "未登录访问插件管理 API 被拒(401/302)", anon_st in (401, 302, 303, 403), str(anon_st))
anon_st = anon_status("/api/themes")
record("security", "未登录访问主题列表 API 被拒(401/302)", anon_st in (401, 302, 303, 403), str(anon_st))
# 评论频控 30s3条已由基线套件覆盖（见 [基线] comments 用例），此处复核端点存活
st, _, raw, ms = req("POST", "/ap-comments/submit", raw_body="{bad", content_type="application/json")
record("security", "评论提交畸形 JSON 不 5xx(400/422)", st in (400, 422), f"HTTP {st}", ms)

# ═════════════════════ E. 主题系统 ═════════════════════
print("\n===== E. 主题系统 =====")
st, d, ms = j2("GET", "/api/themes")
themes = d.get("themes", []) if isinstance(d, dict) else []
names = {t.get("name"): t for t in themes}
record("themes", "GET /api/themes 200 返回主题列表", st == 200 and len(themes) >= 11,
       f"HTTP {st} count={len(themes)}", ms)
IMPORTED = ["Stack", "Ayer", "Butterfly", "Fluid", "Icarus", "Keep", "MengD", "NexT", "Redefine", "Volantis"]
record("themes", "列表含 10 个移植主题", all(n in names for n in IMPORTED),
       str([n for n in IMPORTED if n not in names]))
base = next((t for t in themes if t.get("id") == "base-theme"), None)
record("themes", "base-theme 存在(供还原)", base is not None)

def check_theme_pages(t):
    """激活后验证 / 与 /pv-tips"""
    primary = (t.get("tokens") or {}).get("colors", {}).get("primary", "")
    ok_all = True
    details = []
    for path in ["/", "/pv-tips"]:
        st, _, raw, _ = req("GET", path)
        html = raw.decode("utf-8", "replace")
        ok200 = st == 200
        ok_color = bool(primary) and primary.lower() in html.lower()
        details.append(f"{path}:http={st},color={ok_color}")
        if path == "/pv-tips":
            ok_art = "<article" in html and 'class="post-content"' in html
            details.append(f"article={ok_art}")
            ok200 = ok200 and ok_art
        ok_all = ok_all and ok200 and ok_color
    return ok_all, "; ".join(details)

for name in IMPORTED:
    t = names.get(name)
    if not t:
        record("themes", f"{name} 激活", False, "主题不存在")
        continue
    st, d, ms = j2("POST", f"/api/themes/{t['id']}")
    ok_act = st == 200 and isinstance(d, dict) and d.get("ok")
    record("themes", f"激活 {name}", ok_act, f"HTTP {st}", ms)
    if ok_act:
        ok, det = check_theme_pages(t)
        record("themes", f"{name} 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content)", ok, det)

# 还原 base-theme
if base:
    st, d, ms = j2("POST", "/api/themes/base-theme")
    record("themes", "还原激活 base-theme", st == 200 and isinstance(d, dict) and d.get("ok"), f"HTTP {st}", ms)
    ok, det = check_theme_pages(base)
    record("themes", "base-theme 还原后页面渲染正常", ok, det)

# ───────────────────────────── 汇总写盘 ─────────────────────────────
passed = sum(1 for r in results if r[2] == "pass")
warned = sum(1 for r in results if r[2] == "warn")
failed = len(results) - passed - warned
print(f"\nC 轮测试: TOTAL={len(results)} PASS={passed} FAIL={failed} WARN={warned}")
out_json = {
    "base": BASE, "ts": int(time.time()),
    "results": [{"plugin": p, "case": n, "status": s, "detail": d, "ms": m}
                for p, n, s, d, m in results],
    "summary": {"total": len(results), "pass": passed, "fail": failed, "warn": warned},
}
with open("scripts/plugin-test-result-c.json", "w", encoding="utf-8") as f:
    json.dump(out_json, f, ensure_ascii=False, indent=2)
print("已写 scripts/plugin-test-result-c.json")
sys.exit(0 if failed == 0 else 1)
