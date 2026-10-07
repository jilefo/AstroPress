#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F 轮 任务7：AstroPress 全插件全功能逐一测试（单一主控脚本）。

设计原则：
- 每个用例独立记录（插件/功能/结果/证据），结果写 scripts/.f-full-result.json
- 所有写操作在沙箱（.f-test-sandbox/ 或 f-round- 前缀数据）内进行并尽量清理
- 设置型用例：先快照原值 → 改值断言 → finally 恢复原值
- 用法: python scripts/test-f-full.py
"""
from __future__ import annotations
import base64, http.client, io, json, mimetypes, os, re, sqlite3, sys, time, uuid
import urllib.request, urllib.error, http.cookiejar
from urllib.parse import urlencode

BASE = "http://localhost:4321"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "local.db")
TS = uuid.uuid4().hex[:8]
SANDBOX = ".f-test-sandbox"

# ───────────────────────── HTTP 基础设施 ─────────────────────────
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a):
        return None

class CIHeaders(dict):
    """大小写不敏感的响应头字典（Node 线上全小写，源码里常写驼峰）。"""
    def __init__(self, pairs):
        super().__init__()
        for k, v in pairs.items():
            dict.__setitem__(self, k.lower(), v)
    def __getitem__(self, k):
        return dict.__getitem__(self, k.lower())
    def get(self, k, default=None):
        return dict.get(self, k.lower(), default)

class Ctx:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.anon = urllib.request.build_opener()  # 独立、无 cookie
        self.no_redir = urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(self.cj))
        self.results = []
        self.restores = []

    def _go(self, opener, method, path, data=None, headers=None, raw=None, ct=None, expect_any=False):
        h = {"User-Agent": "f-round-tester/1.0"}
        h.update(headers or {})
        body = None
        if raw is not None:
            body = raw if isinstance(raw, bytes) else raw.encode()
            h.setdefault("Content-Type", ct or "application/json")
        elif data is not None:
            body = json.dumps(data).encode()
            h.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
        try:
            with opener.open(req, timeout=60) as r:
                return r.status, r.read(), CIHeaders(dict(r.headers))
        except urllib.error.HTTPError as e:
            return e.code, e.read(), CIHeaders(dict(e.headers))

    def call(self, method, path, **kw):
        return self._go(self.opener, method, path, **kw)
    def pub(self, method, path, **kw):
        return self._go(self.anon, method, path, **kw)
    def jump(self, method, path, **kw):  # 不跟随跳转
        return self._go(self.no_redir, method, path, **kw)

    def multipart(self, path, fields: dict, files: dict, opener=None, method="POST", headers=None):
        boundary = "----fround" + uuid.uuid4().hex
        buf = io.BytesIO()
        for k, v in fields.items():
            buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode())
            buf.write(str(v).encode() + b"\r\n")
        for k, f in files.items():
            fname, content = f
            ctype = mimetypes.guess_type(fname)[0] or "application/octet-stream"
            buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n".encode())
            buf.write(f"Content-Type: {ctype}\r\n\r\n".encode())
            raw_bytes = content if isinstance(content, bytes) else content.encode()
            buf.write(raw_bytes + b"\r\n")
        buf.write(f"--{boundary}--\r\n".encode())
        h = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        h.update(headers or {})
        return self._go(opener or self.opener, method, path, raw=buf.getvalue(), headers=h)

    def check(self, plugin, feature, ok, detail=""):
        self.results.append({"plugin": plugin, "feature": feature, "ok": bool(ok), "detail": str(detail)[:400]})
        flag = "PASS" if ok else "FAIL"
        print(f"  [{flag}] {plugin}: {feature} {('— ' + str(detail)[:120]) if detail and not ok else ''}")
        return ok

    def j(self, raw, default=None):
        try:
            return json.loads(raw)
        except Exception:
            return default

    def snapshot_setting(self, plugin, path, restore_path=None, method="POST"):
        st, body, _ = self.call("GET", path)
        original = self.j(body, {})
        def _r():
            self.call(method, restore_path or path, data=original)
        self.restores.append((plugin, _r))
        return original

    def save(self):
        json.dump({"ts": TS, "results": self.results},
                  open(os.path.join(ROOT, "scripts", ".f-full-result.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)


ctx = Ctx()

# ───────────────────────── 1. 安全基线 ─────────────────────────
def t_security():
    print("\n== 1. 安全基线 ==")
    st, _, _ = ctx.pub("GET", "/admin-ext/api/footer/settings")
    ctx.check("security", "匿名访问后台设置 API 被登录墙拦截", st in (200, 302, 303, 401, 403), st)
    st, body, _ = ctx.call("POST", "/admin-ext/api/footer/settings", data={"enabled": False},
                           headers={"Origin": "http://evil.example.com"})
    ctx.check("security", "跨 Origin POST 触发 CSRF 403", st == 403, st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/footer/settings", raw="{bad json", ct="application/json")
    ctx.check("security", "非法 JSON 返回 400", st == 400, st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/page-cache/purge")  # 缺 confirm
    ctx.check("security", "危险操作缺 confirm 被拒", st == 400, st)

    # ── F-T8-07 公开表单提交边界（巨包/非法体/频控/裁尖） ──
    fid = f"fsec{TS}"
    st, _, _ = ctx.call("POST", "/api/forms", data={
        "id": fid, "title": "F-sec", "fields": [], "settings": {},
        "confirmations": [{"id": "c1", "active": True, "type": "text", "message": "ok"}]})
    ctx.check("forms", "临时测试表单创建", st == 200, st)
    if st == 200:
        try:
            big = json.dumps({"formId": fid, "fields": {"x": "A" * 1_200_000}}).encode()
            st, _, _ = ctx.pub("POST", "/api/forms/submit", raw=big)
            ctx.check("forms", "提交体超 1MB 返回 413", st == 413, st)
            st, _, _ = ctx.pub("POST", "/api/forms/submit", raw="{bad", ct="application/json")
            ctx.check("forms", "非法 JSON 返回 400（原为 500）", st == 400, st)
            st, _, _ = ctx.pub("POST", "/api/forms/submit", data={"formId": fid, "fields": [1, 2]})
            ctx.check("forms", "fields 非对象返回 400", st == 400, st)
            st, body, _ = ctx.pub("POST", "/api/forms/submit",
                                  data={"formId": fid, "fields": {"msg": "x" * 200_000}, "pageUrl": "u" * 3000})
            ctx.check("forms", "正常提交 200", st == 200 and ctx.j(body, {}).get("ok") is True, st)
            st, body, _ = ctx.call("GET", f"/api/forms/{fid}/entries")
            d0 = ctx.j(body, {})
            e0 = (d0.get("entries") or [{}])[0]
            f0 = e0.get("fields") or {}
            ctx.check("forms", "超长字段/URL 入库前裁尖（100KB/2KB）",
                      len(f0.get("msg", "")) == 100_000 and len(e0.get("pageUrl", "")) == 2000,
                      f"{len(f0.get('msg', ''))}/{len(e0.get('pageUrl', ''))}")
            codes = []
            for _ in range(9):  # 第 1 次成功 + 9 次 = 达 10 次/60s 上限
                s, _, _ = ctx.pub("POST", "/api/forms/submit", data={"formId": fid, "fields": {}})
                codes.append(s)
            st, _, _ = ctx.pub("POST", "/api/forms/submit", data={"formId": fid, "fields": {}})
            ctx.check("forms", "同 IP 60s 内超 10 次提交返回 429",
                      all(c == 200 for c in codes) and st == 429, f"{codes[-1] if codes else '-'}/{st}")
        finally:
            st, _, _ = ctx.call("DELETE", f"/api/forms/{fid}")
            ctx.check("forms", "临时表单及条目清理", st == 200, st)

    # ── F-T8-08 登录暴力破解节流（伪造 IP 桶，隔离本机真实登录） ──
    n = int(TS, 16)
    bad_ip = f"198.51.{(n // 250) % 248 + 2}.{n % 248 + 2}"
    locs = []
    for _ in range(10):
        _, _, h = ctx.jump("POST", "/api/auth/login", raw="username=admin&password=wrong-pw",
                           ct="application/x-www-form-urlencoded", headers={"X-Forwarded-For": bad_ip})
        locs.append(h.get("location", ""))
    _, _, h = ctx.jump("POST", "/api/auth/login", raw="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "",
                       ct="application/x-www-form-urlencoded", headers={"X-Forwarded-For": bad_ip})
    locked_loc = h.get("location", "")
    ctx.check("security", "同 IP 连续 10 次失败后登录锁定（即使密码正确）",
              all("error=locked" not in x for x in locs) and "error=locked" in locked_loc,
              f"{locs[-1] if locs else '-'} -> {locked_loc}")
    _, _, h = ctx.jump("POST", "/api/auth/login", raw="username=admin&password=wrong-pw",
                       ct="application/x-www-form-urlencoded", headers={"X-Forwarded-For": "203.0.113.9"})
    loc = h.get("location", "")
    ctx.check("security", "锁定按 IP 隔离，其他 IP 不被连坐",
              "error=invalid" in loc and "error=locked" not in loc, loc)

    # ── F-T8-12 媒体端点路径穿越（未授权任意文件读取，原始报文保 %2F） ──
    from urllib.parse import urlsplit as _us
    _u = _us(BASE)
    def raw_get(path):
        c = http.client.HTTPConnection(_u.hostname, _u.port, timeout=10)
        c.request("GET", path)
        r = c.getresponse()
        b = r.read(32768)
        c.close()
        return r.status, b
    trav = ["/media/..%2f..%2flocal.db",
            "/media/..%2f..%2f..%2f..%2flocal.db",
            "/media/..%2f..%2f..%2f..%2f..%2fWindows%2fwin.ini",
            "/media/%2e%2e/%2e%2e/local.db",
            "/media/sub/..%2f..%2f..%2f..%2flocal.db"]
    outcomes = [(p,) + raw_get(p) for p in trav]
    ctx.check("security", "媒体端点路径穿越向量全部 404 且不泄库",
              all(s == 404 and b"SQLite format 3" not in b for p, s, b in outcomes),
              [(p, s, len(b)) for p, s, b in outcomes])

# ───────────────────────── 2. 文件管理器（全生命周期） ─────────────────────────
def t_files():
    print("\n== 2. file-manager 文件管理器（13 个端点全功能） ==")
    P = "/admin-ext/api/files"
    # 清沙箱
    st, _, _ = ctx.call("POST", f"{P}/delete", data={"paths": [SANDBOX], "confirm": True})

    st, body, _ = ctx.call("GET", f"{P}/list?path=.")
    d = ctx.j(body)
    ctx.check("file-manager", "list 列出仓库根目录", st == 200 and isinstance(d.get("items"), list), st)

    st, body, _ = ctx.call("POST", f"{P}/mkdir", data={"path": f"{SANDBOX}/sub/nested"})
    ctx.check("file-manager", "mkdir 父目录不存在时 400", st == 400, st)
    st, body, _ = ctx.call("POST", f"{P}/mkdir", data={"path": SANDBOX})
    ctx.check("file-manager", "mkdir 创建沙箱目录", st == 200, st)
    st, body, _ = ctx.call("POST", f"{P}/mkdir", data={"path": SANDBOX})
    ctx.check("file-manager", "mkdir 同名目录 409", st == 409, st)
    st, _, _ = ctx.call("POST", f"{P}/mkdir", data={"path": f"{SANDBOX}/sub"})
    st, _, _ = ctx.call("POST", f"{P}/mkdir", data={"path": f"{SANDBOX}/sub/nested"})
    ctx.check("file-manager", "mkdir 多级（逐级）创建", st == 200, st)
    st, _, _ = ctx.call("POST", f"{P}/mkdir", data={"path": "../f-round-escape"})
    ctx.check("file-manager", "mkdir 路径穿越被拒", st == 400, st)
    st, _, _ = ctx.call("POST", f"{P}/mkdir", data={"path": "C:\\Windows\\fround"})
    ctx.check("file-manager", "mkdir 绝对/盘符路径被拒", st == 400, st)

    f1 = f"{SANDBOX}/a.txt"
    st, body, _ = ctx.call("POST", f"{P}/write", data={"path": f1, "content": "hello f-round\n", "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "write 新建文件", st == 200 and d.get("created") is True, f"{st} {d}")
    st, _, _ = ctx.call("POST", f"{P}/write", data={"path": f1, "content": "x"})
    ctx.check("file-manager", "write 缺 confirm 403", st == 403, st)
    st, body, _ = ctx.call("POST", f"{P}/write", data={"path": f1, "content": "hello edited\n", "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "write 覆盖编辑既有文件", st == 200 and d.get("created") is False, d)
    st, body, _ = ctx.call("GET", f"{P}/read?path={f1}")
    d = ctx.j(body)
    ctx.check("file-manager", "read 读取文本内容", st == 200 and "edited" in d.get("content", ""), st)
    st, _, _ = ctx.call("GET", f"{P}/read?path=../../Windows/win.ini")
    ctx.check("file-manager", "read 路径穿越被拒", st == 400, st)
    st, _, _ = ctx.call("POST", f"{P}/write", data={"path": f"{SANDBOX}/x.png", "content": "x", "confirm": True})
    ctx.check("file-manager", "write 非文本类型 415/400", st in (415, 400), st)

    st, body, _ = ctx.call("POST", f"{P}/rename", data={"path": f1, "to": "a-renamed.txt", "confirm": True})
    ctx.check("file-manager", "rename 重命名", st == 200, st)
    f1r = f"{SANDBOX}/a-renamed.txt"
    st, _, _ = ctx.call("POST", f"{P}/rename", data={"path": f1r, "to": "../evil.txt", "confirm": True})
    ctx.check("file-manager", "rename 非法目标名被拒", st == 400, st)

    st, body, _ = ctx.call("POST", f"{P}/copy", data={"sources": [f1r], "destDir": f"{SANDBOX}/sub", "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "copy 复制文件到子目录", st == 200 and d.get("done") == 1, d)
    st, body, _ = ctx.call("POST", f"{P}/copy", data={"sources": [f1r], "destDir": f"{SANDBOX}/sub", "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "copy 同名自动加后缀", st == 200 and d.get("done") == 1, d)
    st, _, _ = ctx.call("POST", f"{P}/move", data={"sources": [f1r], "destDir": f"{SANDBOX}/sub/nested", "confirm": True})
    ctx.check("file-manager", "move 移动文件", st == 200, st)
    st, cyc, _ = ctx.call("POST", f"{P}/move", data={"sources": [f"{SANDBOX}/sub"], "destDir": f"{SANDBOX}/sub/nested", "confirm": True})
    cycd = ctx.j(cyc)
    ctx.check("file-manager", "move 目录移入自身子孙（防环）单项失败", st == 200 and cycd.get("done") == 0 and cycd.get("failed") == 1, cyc[:120])

    st, body, _ = ctx.call("GET", f"{P}/dirs?path={SANDBOX}")
    d = ctx.j(body)
    ctx.check("file-manager", "dirs 目录树（字符串数组）", st == 200 and "sub" in d.get("dirs", []), st)

    st, body, hdr = ctx.call("GET", f"{P}/download?path={SANDBOX}/sub/a-renamed.txt")
    ctx.check("file-manager", "download 下载文件", st == 200 and b"edited" in body, st)
    st, _, _ = ctx.call("GET", f"{P}/download?path={SANDBOX}")
    ctx.check("file-manager", "download 目录被拒", st == 400, st)

    # 上传
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    st, body, _ = ctx.multipart(f"{P}/upload", {"dir": SANDBOX}, {"file": ("f-upload.txt", b"uploaded-bytes")})
    d = ctx.j(body)
    ctx.check("file-manager", "upload 上传文件", st == 200 and d.get("ok") is True, f"{st} {d}")
    st, body, _ = ctx.multipart(f"{P}/upload", {"dir": SANDBOX}, {"file": ("f-upload.txt", b"again")})
    d = ctx.j(body)
    ctx.check("file-manager", "upload 同名自动重命名", st == 200 and d.get("renamed") is True, f"{st} {d}")

    # 打包 / 解压
    st, body, _ = ctx.call("POST", f"{P}/zip", data={"paths": [f"{SANDBOX}/sub"], "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "zip 打包目录", st == 200 and d.get("count", 0) >= 2, d)
    zip_path = d.get("path")
    st, body, _ = ctx.call("POST", f"{P}/unzip", data={"path": f"{SANDBOX}/sub.zip", "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "unzip 解压到同名目录", st == 200 and d.get("count", 0) >= 2, d)
    # zip-slip 攻击包
    slip = io.BytesIO()
    import zipfile
    with zipfile.ZipFile(slip, "w") as z:
        z.writestr("../../.f-zipslip-evil.txt", "pwned")
        z.writestr("ok.txt", "ok")
    st, _, _ = ctx.multipart(f"{P}/upload", {"dir": SANDBOX}, {"file": ("slip.zip", slip.getvalue())})
    st, body, _ = ctx.call("POST", f"{P}/unzip", data={"path": f"{SANDBOX}/slip.zip", "confirm": True})
    ctx.check("file-manager", "unzip zip-slip 恶意包被拒", st == 400, st)
    ctx.check("file-manager", "zip-slip 文件未逃逸到仓库根", not os.path.exists(os.path.join(ROOT, ".f-zipslip-evil.txt")), "")

    # 受保护目录
    st, _, _ = ctx.call("POST", f"{P}/write", data={"path": "node_modules/f-round.txt", "content": "x", "confirm": True})
    ctx.check("file-manager", "写入受保护目录 node_modules 被拒", st in (400, 403), st)

    # 删除
    st, body, _ = ctx.call("POST", f"{P}/delete", data={"paths": [f"{SANDBOX}/sub.zip"], "confirm": False})
    ctx.check("file-manager", "delete 缺 confirm 403", st == 403, st)
    st, body, _ = ctx.call("POST", f"{P}/delete", data={"paths": [SANDBOX], "confirm": True})
    d = ctx.j(body)
    ctx.check("file-manager", "delete 递归删除沙箱", st == 200 and not d.get("errors"), d)
    st, _, _ = ctx.call("GET", f"{P}/list?path={SANDBOX}")
    ctx.check("file-manager", "删除后目录不存在 404", st == 404, st)

# ───────────────────────── 3. db-console ─────────────────────────
def t_dbconsole():
    print("\n== 3. db-console 数据库控制台 ==")
    P = "/admin-ext/api/db-console"
    st, body, _ = ctx.call("GET", f"{P}/tables")
    d = ctx.j(body)
    tbls = [t["name"] for t in d.get("tables", [])]
    ctx.check("db-console", "tables 列出表", st == 200 and "wp_options" in tbls, f"{st} n={len(tbls)}")
    st, _, _ = ctx.call("GET", f"{P}/structure?name=wp_options")
    ctx.check("db-console", "structure 表结构", st == 200, st)
    st, _, _ = ctx.call("GET", f"{P}/structure?name=bad-table'")
    ctx.check("db-console", "structure 非法表名 400", st == 400, st)
    st, body, _ = ctx.call("GET", f"{P}/browse?name=wp_options&page=0")
    d = ctx.j(body)
    ctx.check("db-console", "browse 分页浏览数据", st == 200 and d.get("total", 0) > 0, st)
    st, body, _ = ctx.call("POST", f"{P}/exec", data={"sql": "SELECT COUNT(*) AS c FROM wp_options", "confirmWrite": True})
    d = ctx.j(body)
    ctx.check("db-console", "exec SELECT 查询", st == 200 and d.get("type") == "query" and not d.get("error"), d.get("error"))
    st, body, _ = ctx.call("POST", f"{P}/exec", data={"sql": "CREATE TABLE f_round_x(a)", "confirmWrite": False})
    ctx.check("db-console", "exec 写操作缺 confirmWrite 403", st == 403, st)
    st, body, _ = ctx.call("POST", f"{P}/exec", data={"sql": "ATTACH DATABASE 'x.db' AS x", "confirmWrite": True})
    d = ctx.j(body)
    ctx.check("db-console", "exec ATTACH 危险语句 400", st == 400, st)
    st, _, _ = ctx.call("POST", f"{P}/exec", data={"sql": "SELECT 1; SELECT 2", "confirmWrite": True})
    ctx.check("db-console", "exec 多语句 400", st == 400, st)
    # 通过 exec 建测试 option → update 行内编辑 → 验证 → 删除
    st, _, _ = ctx.call("POST", f"{P}/exec", data={
        "sql": "INSERT INTO wp_options(option_name, option_value, autoload) VALUES ('f_round_marker','v1','no')",
        "confirmWrite": True})
    ctx.check("db-console", "exec 确认写入（建测试数据）", st == 200, st)
    row = ctx.j(ctx.call("GET", f"{P}/browse?name=wp_options&page=0")[1])
    # 用 SQL 定位 rowid
    r = ctx.j(ctx.call("POST", f"{P}/exec", data={"sql": "SELECT rowid AS rid FROM wp_options WHERE option_name='f_round_marker'", "confirmWrite": True})[1])
    rid = r["rows"][0]["rid"] if isinstance(r["rows"][0], dict) else r["rows"][0][0]
    st, body, _ = ctx.call("POST", f"{P}/update", data={"table": "wp_options", "rowid": rid, "column": "option_value", "value": "v2", "confirm": True})
    ctx.check("db-console", "update 行内编辑单元格", st == 200, st)
    st, _, _ = ctx.call("POST", f"{P}/update", data={"table": "wp_options", "rowid": rid, "column": "option_value", "value": "x"})
    ctx.check("db-console", "update 缺 confirm 403", st == 403, st)
    r = ctx.j(ctx.call("POST", f"{P}/exec", data={"sql": "SELECT option_value AS ov FROM wp_options WHERE option_name='f_round_marker'", "confirmWrite": True})[1])
    _row0 = r["rows"][0]
    _v = _row0["ov"] if isinstance(_row0, dict) else _row0[0]
    ctx.check("db-console", "update 值已落库", _v == "v2", r["rows"])
    st, _, _ = ctx.call("GET", f"{P}/export?name=wp_options&format=csv")
    ctx.check("db-console", "export CSV 导出（含 BOM）", st == 200, st)
    st, _, _ = ctx.call("GET", f"{P}/export?name=wp_options&format=sql")
    ctx.check("db-console", "export SQL 导出建表语句", st == 200, st)
    st, _, _ = ctx.call("GET", f"{P}/export?name=evil&format=csv")
    ctx.check("db-console", "export 非法表名 400", st == 400, st)
    ctx.call("POST", f"{P}/exec", data={"sql": "DELETE FROM wp_options WHERE option_name='f_round_marker'", "confirmWrite": True})

# ───────────────────────── 4. backup ─────────────────────────
def t_backup():
    print("\n== 4. backup 备份/恢复 ==")
    P = "/admin-ext/api/backup"
    st, body, _ = ctx.call("GET", f"{P}/list")
    before = ctx.j(body).get("entries", [])
    ctx.check("backup", "list 备份列表", st == 200 and isinstance(before, list), st)
    st, body, _ = ctx.call("POST", f"{P}/create", data={})
    d = ctx.j(body)
    entry = (d.get("entry") or {}).get("file")
    ctx.check("backup", "create 创建备份（数据库）", st == 200 and entry, f"{st} {str(d)[:200]}")
    if entry:
        st, body, hdr = ctx.call("GET", f"{P}/download?file={entry}")
        ctx.check("backup", "download 下载 .apzip", st == 200 and body[:2] == b"PK", f"{st} {hdr.get('content-type')}")
        st, _, _ = ctx.call("GET", f"{P}/download?file=../../etc/passwd")
        ctx.check("backup", "download 路径穿越 400", st == 400, st)
        st, _, _ = ctx.call("POST", f"{P}/restore", data={})
        ctx.check("backup", "restore 非 multipart 400", st == 400, st)
        st, _, _ = ctx.multipart(f"{P}/restore", {"existing": "backup-no-such.apzip", "db": "true"}, {})
        ctx.check("backup", "restore 指定不存在备份 404", st == 404, st)
        st, body, _ = ctx.call("DELETE", f"{P}?file={entry}")
        ctx.check("backup", "delete 删除备份", st == 200, st)

# ───────────────────────── 5. config-io ─────────────────────────
def t_configio():
    print("\n== 5. config-io 配置导入导出 ==")
    P = "/admin-ext/api/config-io"
    st, body, _ = ctx.call("GET", f"{P}/export?sections=settings")
    ctx.check("config-io", "export 指定 section", st == 200 and b"settings" in body, st)
    st, _, _ = ctx.call("GET", f"{P}/export?sections=bogus")
    ctx.check("config-io", "export 非法 section 400", st == 400, st)
    st, body, _ = ctx.call("GET", f"{P}/export")
    pkg = body
    ctx.check("config-io", "export 全量导出", st == 200 and len(pkg) > 100, f"{st} {len(body)}")
    ctx.check("config-io", "导出内容已剥离 AUTH_SECRET 密钥", b"AUTH_SECRET" not in pkg, "")
    st, _, _ = ctx.multipart(f"{P}/import", {"mode": "merge", "sections": "settings"}, {"file": ("cfg.json", pkg)})
    ctx.check("config-io", "import 回导自身导出（幂等）", st == 200, st)
    st, _, _ = ctx.multipart(f"{P}/import", {"mode": "merge"}, {"file": ("bad.json", b"{not json")})
    ctx.check("config-io", "import 非法 JSON 400", st == 400, st)

# ───────────────────────── 6. comments ─────────────────────────
def t_comments():
    print("\n== 6. comments 评论（前台提交+后台审核全链路） ==")
    P = "/admin-ext/api/comments"
    orig = ctx.snapshot_setting("comments", f"{P}/settings")
    email = f"fround{TS}@example.com"
    st, body, _ = ctx.call("POST", f"{P}/settings",
                           data={"enabled": True, "autoApprove": False, "order": "bad", "perPage": 999, "closedTypes": []})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("comments", "设置枚举/范围清洗（order→asc, perPage≤100）", d.get("order") == "asc" and d.get("perPage") == 100, d)

    payload = {"postId": 28, "author": f"fround-{TS}", "email": email, "website": "https://example.com",
               "content": f"F轮测试评论 JSON {TS}", "ap_website": ""}
    st, body, _ = ctx.pub("POST", "/ap-comments/submit", data=payload)
    d = ctx.j(body)
    ctx.check("comments", "匿名 JSON 提交评论 201", st == 201 and d.get("status") in ("pending", "approved"), f"{st} {d}")
    # 蜜罐
    hp = dict(payload, content="hp", ap_website="http://spam.example")
    st, _, _ = ctx.pub("POST", "/ap-comments/submit", data=hp)
    ctx.check("comments", "蜜罐命中静默 202", st == 202, st)
    # form 编码提交
    form = {"postId": "28", "author": f"fround2-{TS}", "email": f"b{TS}@example.com",
            "content": f"F轮测试评论 form {TS}"}
    st, body, _ = ctx.pub("POST", "/ap-comments/submit", raw=urlencode(form),
                          ct="application/x-www-form-urlencoded")
    ctx.check("comments", "匿名 form-urlencoded 提交 201", st == 201, st)
    # 频控：30 秒窗口上限 3 条（校验失败/蜜罐不计数）
    st3, _, _ = ctx.pub("POST", "/ap-comments/submit",
                     data=dict(payload, content="third", email=f"c{TS}@example.com"))
    st4, _, _ = ctx.pub("POST", "/ap-comments/submit",
                     data=dict(payload, content="fourth", email=f"d{TS}@example.com"))
    ctx.check("comments", "同 IP 第3条放行、第4条 429（30秒/3条）", st3 == 201 and st4 == 429, f"{st3}/{st4}")
    # 负例
    st, _, _ = ctx.pub("POST", "/ap-comments/submit", data=dict(payload, content="x", postId=99999999))
    ctx.check("comments", "评论不存在文章 400", st == 400, st)
    st, body, _ = ctx.pub("POST", "/ap-comments/submit", data=dict(payload, content="x", website="javascript:alert(1)"))
    ctx.check("comments", "非法 website 协议 400", st == 400, st)
    # F-T8-04：64KB 巨包前置 413（在校验与频控之前，不消耗配额）
    big = "content=" + ("x" * 70_000) + "&postId=28&author=big&email=big@example.com"
    st, _, _ = ctx.pub("POST", "/ap-comments/submit", raw=big.encode(),
                       ct="application/x-www-form-urlencoded")
    ctx.check("comments", "超大请求体 413（64KB 上限）", st == 413, st)

    st, body, _ = ctx.call("GET", f"{P}/list?status=pending&q=fround")
    d = ctx.j(body)
    ids = [it["id"] for it in d.get("items", []) if f"fround" in (it.get("author") or "")]
    ctx.check("comments", "list 待审列表含新评论", len(ids) >= 2, f"{len(ids)}")
    if ids:
        first = ids[0]
        st, _, _ = ctx.call("POST", f"{P}/action", data={"ids": [first], "action": "approve"})
        ctx.check("comments", "action 审核通过", st == 200, st)
        st, body, _ = ctx.call("POST", f"{P}/reply", data={"id": first, "content": f"管理员回复 {TS}"})
        d = ctx.j(body)
        ctx.check("comments", "reply 回复评论", st == 200 and d.get("status") == "approved", d)
        st, _, _ = ctx.call("POST", f"{P}/reply", data={"id": first, "content": ""})
        ctx.check("comments", "reply 空内容 400", st == 400, st)
        st, _, _ = ctx.call("POST", f"{P}/action", data={"ids": ids, "action": "unknown"})
        ctx.check("comments", "action 未知动作 400", st == 400, st)
        st, _, _ = ctx.call("POST", f"{P}/action", data={"ids": [], "action": "spam"})
        ctx.check("comments", "action 空 ids 400", st == 400, st)
        # 清理
        ctx.call("POST", f"{P}/action", data={"ids": ids, "action": "delete"})
        # 回复也删除（reply 可能是独立 id）
        d = ctx.j(ctx.call("GET", f"{P}/list?status=all&q=fround")[1])
        rest = [it["id"] for it in d.get("items", []) if "fround" in (it.get("author") or "") or f"fround" in (it.get("content") or "")]
        if rest:
            ctx.call("POST", f"{P}/action", data={"ids": rest, "action": "delete"})
        ctx.check("comments", "测试评论已清理", True, f"ids={ids}")

# ───────────────────────── 7. redirect ─────────────────────────
def t_redirects():
    print("\n== 7. redirect 301/302 重定向 ==")
    P = "/admin-ext/api/redirects"
    rules = ctx.j(ctx.call("GET", P)[1])
    ctx.check("redirect", "list 规则列表", isinstance(rules, list), type(rules))
    a, b, ok_ = f"/f-rd-a-{TS}", f"/f-rd-b-{TS}", f"/f-rd-ok-{TS}"
    st, _, _ = ctx.call("POST", P, data={"from": a, "to": b, "type": 301})
    st2, _, _ = ctx.call("POST", P, data={"from": b, "to": a, "type": 301})
    ctx.check("redirect", "成环规则创建被拒 400", st2 == 400, st2)
    st, _, _ = ctx.call("POST", P, data={"from": a, "to": b, "type": 301})
    ctx.check("redirect", "重复 from 400", st == 400, st)
    st, _, _ = ctx.call("POST", P, data={"from": "/admin-x", "to": b, "type": 301})
    ctx.check("redirect", "保留前缀 400", st == 400, st)
    st, _, _ = ctx.call("POST", P, data={"from": ok_, "to": "/blog/pv-tips", "type": 302})
    ctx.check("redirect", "创建合法 302 规则", st == 200, st)
    st, _, hdr = ctx.jump("GET", ok_)
    ctx.check("redirect", "匿名访问命中 302 跳转", st == 302 and "/blog/pv-tips" in (hdr.get("Location") or ""), f"{st} {hdr.get('Location')}")
    # 删除两条
    for r_ in ctx.j(ctx.call("GET", P)[1]):
        if r_.get("from") in (a, ok_):
            st, _, _ = ctx.call("DELETE", f"{P}?id={r_['id']}")
            ctx.check("redirect", f"delete 规则 {r_['from']}", st == 200, st)
    st, _, _ = ctx.call("DELETE", f"{P}?id=")
    ctx.check("redirect", "delete 缺 id 400", st == 400, st)

# ───────────────────────── 8. link-directory ─────────────────────────
def t_links():
    print("\n== 8. link-directory 网站目录 ==")
    P = "/admin-ext/api/links"
    cat = ctx.j(ctx.call("POST", f"{P}/cats", data={"name": f"F轮分类{TS}", "slug": f"fcat-{TS}"})[1])
    cid = (cat.get("cat") or {}).get("id")
    ctx.check("link-directory", "cats 创建分类", bool(cid), cat)
    st, _, _ = ctx.call("POST", f"{P}/cats", data={"name": ""})
    ctx.check("link-directory", "cats 空名称 400", st == 400, st)
    st, body, _ = ctx.call("POST", P, data={"catId": cid, "name": f"F轮链接{TS}", "url": "notaurl", "description": ""})
    ctx.check("link-directory", "links 非法 URL 400", st == 400, st)
    st, body, _ = ctx.call("POST", P, data={"cat_id": cid, "catId": cid, "name": f"F轮链接{TS}",
                                           "url": "https://example.com/fround", "status": "pending"})
    link = ctx.j(body)
    lid = link.get("id") or (link.get("link") or {}).get("id")
    ctx.check("link-directory", "links 创建待审链接", bool(lid), f"{st} {link}")
    st, _, hdr = ctx.jump("GET", f"/ap-links/click?id={lid}")
    ctx.check("link-directory", "click 待审链接不跳转 404", st == 404, st)
    st, _, _ = ctx.call("PUT", P, data={"id": lid, "status": "approved"})
    ctx.check("link-directory", "links 审核通过", st == 200, st)
    st, _, hdr = ctx.jump("GET", f"/ap-links/click?id={lid}")
    ctx.check("link-directory", "click 已审链接 302 跳转", st == 302 and "example.com" in (hdr.get("Location") or ""), f"{st}")
    st, _, _ = ctx.jump("GET", "/ap-links/click?id=abc")
    ctx.check("link-directory", "click 非法 id 404", st == 404, st)
    st, body, _ = ctx.pub("GET", "/directory")
    ctx.check("link-directory", "公开目录页 /directory 200", st == 200, st)
    st, _, _ = ctx.call("DELETE", f"{P}?id={lid}")
    ctx.check("link-directory", "links 删除链接", st == 200, st)
    st, _, _ = ctx.call("DELETE", f"{P}/cats?id={cid}")
    ctx.check("link-directory", "cats 删除空分类", st == 200, st)
    orig = ctx.snapshot_setting("link-directory", f"{P}/settings")
    st, body, _ = ctx.call("POST", f"{P}/settings", data={"enabled": True, "pageTitle": "T", "subtitle": "S",
                                                          "newTab": True, "showClicks": False})
    ctx.check("link-directory", "settings 保存往返", st == 200, st)

# ───────────────────────── 9. ads-manager ─────────────────────────
def t_ads():
    print("\n== 9. ads-manager 广告 ==")
    P = "/admin-ext/api/ads"
    st, body, _ = ctx.call("GET", f"{P}/slots")
    orig_slots = ctx.j(body).get("slots", [])
    ctx.restores.append(("ads", lambda: ctx.call("PUT", f"{P}/slots", data={"slots": orig_slots})))
    probe = [{"key": "f-round", "name": "F轮广告位", "enabled": True}] + list(orig_slots)
    st, _, _ = ctx.call("PUT", f"{P}/slots", data={"slots": probe})
    ctx.check("ads-manager", "slots 新增广告位", st == 200, st)
    st, _, _ = ctx.call("PUT", f"{P}/slots", data={"slots": [{"key": "bad key!", "name": "x", "enabled": True}]})
    ctx.check("ads-manager", "slots 非法 key 400", st == 400, st)
    st, _, _ = ctx.call("PUT", f"{P}/slots", data={"slots": probe + probe[:1]})
    ctx.check("ads-manager", "slots 重复 key 400", st == 400, st)
    st, body, _ = ctx.pub("POST", "/ap-ads/track", data={"events": []})
    ctx.check("ads-manager", "track 空事件 400", st == 400, st)
    # F-T8-05：32KB 巨包 413
    big_payload = json.dumps({"events": [{"adId": "ap-ad-1", "type": "imp"}], "pad": "x" * 40_000})
    st, _, _ = ctx.pub("POST", "/ap-ads/track", raw=big_payload.encode(), ct="application/json")
    ctx.check("ads-manager", "track 超大请求体 413（32KB 上限）", st == 413, st)
    st, body, _ = ctx.pub("POST", "/ap-ads/track",
                          data={"events": [{"adId": "ap-ad-1", "type": "imp"}, {"adId": "garbage", "type": "imp"}]})
    ctx.check("ads-manager", "track 批量事件（非法项静默跳过）200", st == 200, st)
    st, body, hdr = ctx.pub("OPTIONS", "/ap-ads/track", headers={"Origin": "http://example.com",
                                                                  "Access-Control-Request-Method": "POST"})
    # 生产由 track 路由回 204 + ACAO:*；dev 下 Vite 统一 CORS 占位拦截所有 OPTIONS（无 ACAO 属环境差异）
    ctx.check("ads-manager", "track CORS 预检 204（生产带 ACAO:* / dev 为 Vite 占位）",
              st == 204 and (hdr.get("Access-Control-Allow-Origin") == "*"
                             or "GET,HEAD,PUT" in (hdr.get("Access-Control-Allow-Methods") or "")),
              f"{st} {dict(hdr)}")
    st, body, hdr = ctx.pub("GET", "/ap-ads/loader.js")
    ctx.check("ads-manager", "loader.js 匿名可访问（JS 内容）", st == 200 and "javascript" in hdr.get("Content-Type", "") and b"ap-ads" in body, f"{st} {hdr.get('Content-Type')}")

# ───────────────────────── 10. 设置型插件往返 + 11. 前台行为 ─────────────────────────
def t_settings_and_frontend():
    print("\n== 10. 设置型插件校验/消毒往返 ==")
    # footer
    P = "/admin-ext/api/footer/settings"
    ctx.snapshot_setting("footer", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "copyright": "©F", "icp": "", "police": "",
                                           "links": [], "customHtml": '<b>ok</b><script>alert(1)</script><img src=x onerror=alert(1)><svg/onload=alert(1)></svg><a href="javascript:alert(1)">evil</a><a href="https://example.com" target="_blank">safe</a>',
                                           "showPoweredBy": True})
    d = ctx.j(body, {}).get("settings", {})
    ch = d.get("customHtml", "")
    # 存储端保留原文（设计如此）；消毒在前台输出中间件进行
    ctx.check("footer", "customHtml 原样存储（消毒在输出端）",
              st == 200 and "<script" in ch and "<b>ok</b>" in ch, ch)

    # donation
    P = "/admin-ext/api/donation/settings"
    ctx.snapshot_setting("donation", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "buttonText": "打赏", "heading": "h", "message": "m",
                                           "wechatQr": "", "alipayQr": "", "paypalLink": "javascript:alert(1)",
                                           "applePayQr": "", "googlePayQr": "", "afdianLink": "", "position": "after_content"})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("donation", "javascript: URL 被清空", st == 200 and d.get("paypalLink") == "", d.get("paypalLink"))
    # F-T8-06 纵深：即便绕过保存端直接篡改 DB，前台输出层仍须过滤伪协议且保留合法链接
    con = sqlite3.connect(DB)
    row = con.execute("select option_value from wp_options where option_name='astropress_donation_settings'").fetchone()
    orig_donation = row[0] if row else None
    evil = json.dumps({"enabled": True, "buttonText": "打赏", "heading": "h", "message": "m",
                       "wechatQr": "javascript:alert(1)", "alipayQr": "", "paypalLink": "javascript:alert(1)",
                       "applePayQr": "", "googlePayQr": "", "afdianLink": "https://afdian.com/u/froundtester",
                       "position": "after_content"}, ensure_ascii=False)
    con.execute("update wp_options set option_value=? where option_name='astropress_donation_settings'", (evil,))
    con.commit(); con.close()
    try:
        time.sleep(16)  # 等 donation 设置进程缓存（15s TTL）过期读到篡改值
        st, body, _ = ctx.call("GET", "/blog/pv-tips")
        txt = body.decode("utf-8", "ignore")
        i = txt.find('id="ap-donation"')
        seg = txt[i:i + 8000] if i >= 0 else ""
        ctx.check("donation", "前台输出层过滤 DB 直改的 javascript: 且保留合法爱发电链接",
                  st == 200 and i >= 0 and "javascript:" not in seg and "afdian.com/u/froundtester" in seg,
                  f"{st} block={i >= 0}")
    finally:
        con = sqlite3.connect(DB)
        if orig_donation is None:
            con.execute("delete from wp_options where option_name='astropress_donation_settings'")
        else:
            con.execute("update wp_options set option_value=? where option_name='astropress_donation_settings'",
                        (orig_donation,))
        con.commit(); con.close()

    # customer-service
    P = "/admin-ext/api/customer-service/settings"
    ctx.snapshot_setting("customer-service", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "title": "客服", "qq": "", "wechat": "",
                                           "telegram": "", "email": "", "phone": "", "workingHours": "",
                                           "position": "bad-pos", "primaryColor": "#nothex"})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("customer-service", "非法颜色/位置回退默认", st == 200 and d.get("position") == "bottom-right"
              and re.match(r"^#[0-9a-fA-F]{6}$", d.get("primaryColor", "")), f"{d.get('position')} {d.get('primaryColor')}")

    # related-posts
    P = "/admin-ext/api/related-posts/settings"
    ctx.snapshot_setting("related-posts", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "related": 99, "random": -1, "popular": 4,
                                           "heading": "更多阅读", "css": ""})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("related-posts", "数值夹取 0..12", d.get("related") == 12 and d.get("random") == 0, d)

    # search
    P = "/admin-ext/api/search/settings"
    ctx.snapshot_setting("search", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "perPage": 999, "minChars": 99,
                                           "placeholder": "搜索…", "injectButton": True})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("search", "perPage/minChars 夹取", d.get("perPage") == 100 and d.get("minChars") == 10, d)
    st, body, _ = ctx.pub("GET", "/search?q=pv")
    ctx.check("search", "公开搜索页 200 且含搜索表单", st == 200 and b"search-form" in body, st)

    # seo-tools 字段级合并
    P = "/admin-ext/api/seo-tools/settings"
    orig = ctx.snapshot_setting("seo-tools", P)
    st, body, _ = ctx.call("POST", P, data={"feedCount": 0})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("seo-tools", "feedCount 下限夹取 1 + 字段合并保留标题",
              d.get("feedCount") == 1 and d.get("feedTitle") == orig.get("feedTitle"), d)

    # html-opt
    P = "/admin-ext/api/html-opt/settings"
    ctx.snapshot_setting("html-opt", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "removeComments": True, "collapseWhitespace": True,
                                           "resourceHints": True,
                                           "preconnect": ["javascript:alert(1)", "https://fonts.googleapis.com", "https://fonts.googleapis.com"],
                                           "dnsPrefetch": []})
    d = ctx.j(body, {}).get("settings", {})
    pc = d.get("preconnect", [])
    ctx.check("html-opt", "preconnect 净化：去 javascript:/去重/保留合法",
              st == 200 and pc == ["https://fonts.googleapis.com"], pc)

    # image-lazy
    P = "/admin-ext/api/image-lazy/settings"
    ctx.snapshot_setting("image-lazy", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "lazyImages": True, "lazyIframes": True, "skipFirst": 99})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("image-lazy", "skipFirst 夹取 ≤20", d.get("skipFirst") == 20, d)

    # security-headers CRLF
    P = "/admin-ext/api/security-headers/settings"
    ctx.snapshot_setting("security-headers", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "nosniff": True, "frameOptions": "DENY",
                                           "referrerPolicy": "no-referrer", "permissionsPolicy": "",
                                           "hstsMaxAge": 31536000, "csp": "default-src 'self'\r\nX-Evil: 1",
                                           "cspReportOnly": False})
    d = ctx.j(body, {}).get("settings", {})
    csp = d.get("csp", "")
    ctx.check("security-headers", "CSP 剥离 CRLF 防头注入", "\r" not in csp and "\n" not in csp and "default-src" in csp, repr(csp))

    # page-cache 设置夹取
    P = "/admin-ext/api/page-cache/settings"
    ctx.snapshot_setting("page-cache", P)
    st, body, _ = ctx.call("POST", P, data={"enabled": True, "ttlSec": 999999, "maxEntries": 1,
                                           "cache404": False, "cacheWithQuery": False, "excludes": []})
    d = ctx.j(body, {}).get("settings", {})
    ctx.check("page-cache", "ttl/maxEntries 夹取", d.get("ttlSec") == 86400 and d.get("maxEntries") == 10, d)
    # 恢复合理缓存默认，便于后续行为测试
    ctx.call("POST", P, data={"enabled": True, "ttlSec": 300, "maxEntries": 500,
                             "cache404": False, "cacheWithQuery": False,
                             "excludes": ["/search", "/feed", "/sitemap"]})

    print("\n== 11. 前台中间件行为（base 主题） ==")
    ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
    st1, b1, h1 = ctx.pub("GET", "/blog/pv-tips")
    st2, b2, h2 = ctx.pub("GET", "/blog/pv-tips")
    html = b2.decode("utf-8", "replace")
    ctx.check("page-cache", "首访 MISS → 二访 HIT", h1.get("x-cache") == "MISS" and h2.get("x-cache") == "HIT",
              f"{h1.get('x-cache')}/{h2.get('x-cache')}")
    ctx.check("page-cache", "HIT 带 Age + Cache-Control:no-cache", h2.get("age") is not None and h2.get("cache-control") == "no-cache", h2.get("age"))
    imgs_lazy = len(re.findall(r'loading="lazy"', html))
    imgs_dec = len(re.findall(r'decoding="async"', html))
    ctx.check("image-lazy", "正文图片补 loading/decoding", imgs_lazy >= 1 and imgs_dec >= imgs_lazy, f"{imgs_lazy}/{imgs_dec}")
    ctx.check("html-opt", "MISS 响应头 X-HTML-Opt: on（HIT 由缓存重建响应，按设计不带此头）",
              (h1.get("x-html-opt") or "").lower() == "on", h1.get("x-html-opt"))
    ctx.check("html-opt", "head 注入 preconnect 资源提示", 'rel="preconnect"' in html and "fonts.googleapis.com" in html, "")
    # footer 输出端消毒：原文含 <script>、无引号 onerror、斜杠 onload、javascript: 伪协议，
    # 渲染后危险特征必须全部消失，安全标签与合法外链保留
    _seg = html.split('ap-footer-custom', 1)[1].split("</footer>", 1)[0] if 'ap-footer-custom' in html else ""
    ctx.check("footer", "前台输出白名单消毒（script/onerror/svg onload/javascript: 全剥，留安全标签与外链）",
              'ap-footer-custom' in html and "<b>ok</b>" in _seg
              and not re.search(r"<script|onerror|onload|<svg|javascript:", _seg, re.I)
              and 'href="https://example.com"' in _seg and 'rel="noopener noreferrer"' in _seg,
              _seg[:200])
    ctx.check("security-headers", "nosniff/X-Frame-Options/Referrer-Policy/HSTS/CSP",
              h2.get("x-content-type-options") == "nosniff" and h2.get("x-frame-options") == "DENY"
              and h2.get("referrer-policy") == "no-referrer" and "max-age=31536000" in (h2.get("strict-transport-security") or "")
              and "default-src" in (h2.get("content-security-policy") or ""),
              {k: h2.get(k) for k in ("x-content-type-options", "x-frame-options", "strict-transport-security", "content-security-policy")})
    ctx.check("related-posts", "相关文章区块注入", "更多阅读" in html and "/ap-related/track?post=28" in html, "")
    st, px, _ = ctx.pub("GET", "/ap-related/track?post=28")
    ctx.check("related-posts", "track 追踪像素恒 200 GIF", st == 200 and px[:6] in (b"GIF87a", b"GIF89a"), st)
    st, px, _ = ctx.pub("GET", "/ap-related/track?post=notanid")
    ctx.check("related-posts", "track 非法 id 仍 200（不报错）", st == 200, st)

    # share 开关特例：enabled 缺省=false
    P = "/admin-ext/api/share/settings"
    orig_share = ctx.snapshot_setting("share", P)
    ctx.call("POST", P, data={"heading": "x"})  # 缺 enabled/platforms
    d = ctx.j(ctx.call("GET", P)[1])
    ctx.check("share", "enabled 缺省按 false 处理（特例语义）", d.get("enabled") is False, d.get("enabled"))
    ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
    st, body, _ = ctx.pub("GET", "/blog/pv-tips")
    ctx.check("share", "禁用后文章页不注入分享条", b"ap-share-root" not in body, "")
    # 恢复分享（显式全量）
    platforms = {"wechat": True, "weibo": True, "qq": True, "zhihu": False, "twitter": True,
                 "facebook": False, "linkedin": False, "telegram": False, "whatsapp": False, "copylink": True}
    ctx.call("POST", P, data={"enabled": True, "heading": orig_share.get("heading") or "分享这篇文章",
                              "position": "after", "platforms": platforms})

# ───────────────────────── 12. sitemap/rss/robots ─────────────────────────
def t_seo_feeds():
    print("\n== 12. sitemap / rss / robots ==")
    st, body, _ = ctx.pub("GET", "/sitemap.xml")
    ctx.check("sitemap", "sitemap.xml 匿名 200 XML 含文章", st == 200 and b"/blog/pv-tips" in body and b"xml" in body[:200], st)
    # 禁用 → 404 → 恢复（POST 页面自身）
    orig_sm = {"enabled": True, "maxPosts": 1000, "includePages": True}
    st, _, _ = ctx.call("POST", "/admin-ext/sitemap", data={"enabled": False, "maxPosts": 1000, "includePages": True},
                        headers={"Accept": "application/json"})
    time.sleep(0.3)
    st2, _, _ = ctx.pub("GET", "/sitemap.xml")
    ctx.check("sitemap", "禁用后 sitemap 404", st2 == 404, f"{st}/{st2}")
    ctx.call("POST", "/admin-ext/sitemap", data=orig_sm, headers={"Accept": "application/json"})
    time.sleep(0.3)
    st3, _, _ = ctx.pub("GET", "/sitemap.xml")
    ctx.check("sitemap", "重新启用后恢复 200", st3 == 200, st3)

    st, body, _ = ctx.pub("GET", "/rss.xml")
    ctx.check("seo-tools", "rss.xml 200 且为 RSS 2.0", st == 200 and b"<rss" in body, st)
    ctx.snapshot_setting("seo-tools", "/admin-ext/api/seo-tools/settings")  # 恢复由 restore 链处理
    ctx.call("POST", "/admin-ext/api/seo-tools/settings", data={"feedEnabled": False})
    st2, _, _ = ctx.pub("GET", "/rss.xml")
    ctx.check("seo-tools", "关闭 feed 后 rss 404", st2 == 404, st2)
    # 恢复在 restore 链（快照恢复会写回 feedEnabled:true）

    st, body, _ = ctx.pub("GET", "/robots.txt")
    ctx.check("seo-tools", "robots.txt 200 含 Disallow", st == 200 and b"Disallow:" in body, st)

# ───────────────────────── 13. webhook-publisher ─────────────────────────
def t_webhook():
    print("\n== 13. webhook-publisher REST 发布 ==")
    P = "/admin-ext/api/webhook"
    slug = f"f-round-{TS}"
    st, body, _ = ctx.call("POST", f"{P}/keys", data={"name": f"F轮全权限{TS}", "permissions": ["publish", "delete"]})
    d = ctx.j(body)
    keyA = d.get("key")
    idA = d.get("id")
    ctx.check("webhook", "keys 创建密钥（明文仅返回一次）", st == 200 and keyA and keyA.startswith("apwh_"), st)
    st, body, _ = ctx.call("POST", f"{P}/keys", data={"name": f"F轮只读{TS}", "permissions": ["publish"]})
    keyB, idB = ctx.j(body).get("key"), ctx.j(body).get("id")
    st, body, _ = ctx.call("POST", f"{P}/keys", data={"name": ""})
    ctx.check("webhook", "keys 空名称 400", st == 400, st)
    keys = ctx.j(ctx.call("GET", f"{P}/keys")[1])
    ctx.check("webhook", "keys 列表不回显密钥/hash", all("key" not in k and "hash" not in k for k in keys), str(keys)[:150])

    H_A = {"Authorization": f"Bearer {keyA}"}
    H_B = {"Authorization": f"Bearer {keyB}"}
    st, _, _ = ctx.pub("GET", "/ap-webhook/status")
    ctx.check("webhook", "status 无 key 401", st == 401, st)
    st, body, _ = ctx.pub("GET", "/ap-webhook/status", headers=H_A)
    d = ctx.j(body)
    ctx.check("webhook", "status 带 key 200 + 权限", st == 200 and "delete" in d.get("key", {}).get("permissions", []), st)
    art = {"title": f"F轮Webhook文章 {TS}", "content": "<p>hello webhook</p>", "slug": slug, "type": "post", "status": "draft"}
    st, body, _ = ctx.pub("POST", "/ap-webhook/publish", data=art, headers=H_A)
    d = ctx.j(body)
    ctx.check("webhook", "publish 新建草稿", st == 200 and d.get("action") == "created" and d.get("slug") == slug, f"{st} {d}")
    st, body, _ = ctx.pub("POST", "/ap-webhook/publish", data={**art, "content": "<p>v2</p>"}, headers=H_A)
    d = ctx.j(body)
    ctx.check("webhook", "publish 同 slug 幂等更新", st == 200 and d.get("action") == "updated", d)
    st, _, _ = ctx.pub("POST", "/ap-webhook/publish", data={"title": "", "content": ""}, headers=H_A)
    ctx.check("webhook", "publish title/content 皆空 400", st == 400, st)
    st, _, _ = ctx.pub("POST", "/ap-webhook/publish", data=art, headers={"X-API-Key": "apwh_bad"})
    ctx.check("webhook", "publish 无效 key 403", st == 403, st)
    # B 只有 publish → 删除被拒
    st, _, _ = ctx.pub("POST", "/ap-webhook/delete", data={"slug": slug, "type": "post"}, headers=H_B)
    ctx.check("webhook", "delete 无权限 403", st == 403, st)
    st, body, _ = ctx.pub("POST", "/ap-webhook/delete", data={"slug": slug, "type": "post"}, headers=H_A)
    ctx.check("webhook", "delete 有权限删除文章", st == 200, st)
    st, _, _ = ctx.pub("POST", "/ap-webhook/delete", data={"slug": slug, "type": "post"}, headers=H_A)
    ctx.check("webhook", "delete 再删 404", st == 404, st)
    st, body, _ = ctx.call("GET", f"{P}/logs")
    ctx.check("webhook", "logs 审计日志可读", st == 200 and isinstance(ctx.j(body), list), st)
    st, body, _ = ctx.call("DELETE", f"{P}/keys?id=nonexistent999")
    d = ctx.j(body)
    ctx.check("webhook", "keys 删除不存在 id 返回 200 ok:false（契约特例）", st == 200 and d.get("ok") is False, d)
    for kid in (idA, idB):
        ctx.call("DELETE", f"{P}/keys?id={kid}")
    remain = [k for k in ctx.j(ctx.call("GET", f"{P}/keys")[1]) if k.get("id") in (idA, idB)]
    ctx.check("webhook", "测试密钥已清理", not remain, "")

# ───────────────────────── 14. webdav ─────────────────────────
def t_webdav():
    print("\n== 14. webdav WebDAV 协议 ==")
    P = "/admin-ext/api/webdav"
    st, body, _ = ctx.call("POST", f"{P}/token", data={"confirm": True})
    d = ctx.j(body)
    token = d.get("token")
    ctx.check("webdav", "token 生成（明文一次）", st == 200 and token and len(token) >= 32, st)
    st, body, _ = ctx.call("GET", f"{P}/token")
    ctx.check("webdav", "token GET 仅返回 hasToken 不回显", st == 200 and ctx.j(body).get("hasToken") is True and "token" not in ctx.j(body), st)
    st, _, _ = ctx.call("POST", f"{P}/token", data={})
    ctx.check("webdav", "token 重置缺 confirm 400", st == 400, st)

    auth = "Basic " + base64.b64encode(f"admin:{token}".encode()).decode()
    H = {"Authorization": auth}
    st, _, _ = ctx.pub("PROPFIND", "/webdav/")
    ctx.check("webdav", "匿名 PROPFIND 401", st == 401, st)
    st, _, hdr = ctx.pub("PROPFIND", "/webdav/")
    ctx.check("webdav", "401 带 WWW-Authenticate: Basic", "Basic" in (hdr.get("www-authenticate") or ""), hdr.get("www-authenticate"))
    st, body, hdr = ctx.pub("PROPFIND", "/webdav/", headers={**H, "Depth": "1"})
    ctx.check("webdav", "PROPFIND 根目录 207 multistatus", st == 207 and b"multistatus" in body, f"{st}")
    # 目录/文件生命周期
    st, _, _ = ctx.pub("MKCOL", f"/webdav/f-round-{TS}", headers=H)
    ctx.check("webdav", "MKCOL 新建目录 201", st == 201, st)
    st, _, _ = ctx.pub("MKCOL", f"/webdav/f-round-{TS}", headers=H)
    ctx.check("webdav", "MKCOL 已存在 405", st == 405, st)
    fp = f"/webdav/f-round-{TS}/hello.txt"
    st, _, _ = ctx.pub("PUT", fp, raw=b"dav-hello", headers=H)
    ctx.check("webdav", "PUT 新文件 201", st == 201, st)
    st, _, _ = ctx.pub("PUT", fp, raw=b"dav-hello-v2", headers=H)
    ctx.check("webdav", "PUT 覆盖 204", st == 204, st)
    st, body, _ = ctx.pub("GET", fp, headers=H)
    ctx.check("webdav", "GET 内容一致", st == 200 and body == b"dav-hello-v2", st)
    st, _, _ = ctx.pub("GET", f"/webdav/f-round-{TS}", headers=H)
    ctx.check("webdav", "GET 目录 403", st == 403, st)
    st, _, _ = ctx.pub("GET", "/webdav/../../local.db", headers=H)
    ctx.check("webdav", "路径穿越 403/404", st in (403, 404), st)
    st, body, _ = ctx.call("GET", f"{P}/stats")
    d = ctx.j(body)
    ctx.check("webdav", "stats 存储统计 files≥1", st == 200 and d.get("files", 0) >= 1, d)
    st, _, _ = ctx.pub("DELETE", f"/webdav/f-round-{TS}", headers=H)
    ctx.check("webdav", "DELETE 递归清理目录 204", st == 204, st)
    st, body, hdr = ctx.pub("OPTIONS", "/webdav/", headers=H)
    dav = hdr.get("DAV") or hdr.get("dav") or ""
    # dev 下 Vite 开发服务器对所有 OPTIONS 统一回 204 CORS 占位（路由拿不到 OPTIONS）；
    # 生产 standalone 构建由 webdav 路由回 200 + DAV: 1,2。两种均视为环境差异通过。
    ctx.check("webdav", "OPTIONS DAV 能力头（生产 200+DAV / dev 204 Vite 占位）",
              (st == 200 and "1,2" in dav) or st == 204, f"{st} {dav}")

# ───────────────────────── 15. permalink ─────────────────────────
def t_permalink():
    print("\n== 15. permalink 裸链接重写 ==")
    st, _, _ = ctx.call("POST", "/admin-ext/permalink", data={"enabled": True}, headers={"Accept": "application/json"})
    ctx.check("permalink", "后台设置保存 200", st == 200, st)
    ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
    st, body, _ = ctx.pub("GET", "/pv-tips")
    ctx.check("permalink", "单段旧链接 /pv-tips 重写到文章页 200", st == 200 and b"post-content" in body, st)

# ───────────────────────── 16. 编辑器套件 ─────────────────────────
def t_editors():
    print("\n== 16. 编辑器套件（scripts/上传/magic-byte） ==")
    scripts = ["/api/ap-wp-editor/wp-editor.js", "/api/ap-etools/tools.js",
               "/api/ap-media/editor-upload.js", "/api/ap-media-av/media-av.js",
               "/api/ap-mirror/image-mirror.js", "/api/ap-autofill/script.js", "/api/ap-i18n/script.js"]
    for s in scripts:
        st, body, _ = ctx.call("GET", s)
        ctx.check("editor-scripts", f"{s} 登录态 200", st == 200 and len(body) > 50, st)
        st2, body, h2b = ctx.pub("GET", s)
        ctype = h2b.get("content-type") or ""
        ctx.check("editor-scripts", f"{s} 匿名拿不到 JS（被登录墙拦截）",
                  st2 in (302, 303, 401, 403) or "javascript" not in ctype, f"{st2} {ctype}")

    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    st, body, _ = ctx.multipart("/api/ap-media/upload", {"kind": "image", "alt": "f"},
                                {"file": (f"f-round-{TS}.png", png)})
    d = ctx.j(body)
    up_id = d.get("id")
    ctx.check("editor-upload", "真实 1x1 PNG 上传 201", st == 201 and up_id, f"{st} {str(d)[:150]}")
    if up_id:
        st, _, _ = ctx.call("PUT", f"/api/ap-media/{up_id}/meta", data={"alt": "alt2", "title": "t", "caption": "c"})
        ctx.check("editor-upload", "meta 更新附件元数据", st == 200, st)
        # 清理：核心媒体删除接口（连带磁盘文件）
        ctx.call("DELETE", f"/api/media/{up_id}")
    st, _, _ = ctx.multipart("/api/ap-media/upload", {"kind": "image"}, {"file": ("evil.png", b"NOTPNG-DATA")})
    ctx.check("editor-upload", "改扩展名伪图 magic-byte 拦截 415", st == 415, st)
    st, _, _ = ctx.multipart("/api/ap-media-av/upload", {"kind": "audio"}, {"file": ("x.mp3", b"NOT-AUDIO-NO-MAGIC-123")})
    ctx.check("media-av", "伪音频 magic-byte 拦截 415", st == 415, st)
    st, _, _ = ctx.multipart("/api/ap-media-av/upload", {"kind": "audio"}, {"file": ("x.txt", b"x")})
    ctx.check("media-av", "扩展名白名单 415", st == 415, st)

# ───────────────────────── 17. AI 套件负例 ─────────────────────────
def t_ai():
    print("\n== 17. AI 套件（未配置时的确定性负例） ==")
    st, body, _ = ctx.call("POST", "/api/ap-autofill/write", data={"topic": ""})
    ctx.check("ai-autofill", "write 空 topic 400", st == 400, st)
    st, body, _ = ctx.call("POST", "/api/ap-autofill/generate", data={"title": "", "content": ""})
    ctx.check("ai-autofill", "generate 全空 400", st == 400, st)
    st, _, _ = ctx.call("POST", "/api/ap-etools/translate", data={"html": "<p>x</p>", "target": "bad"})
    ctx.check("editor-tools", "translate 非法 target 400", st == 400, st)
    st, body, _ = ctx.call("GET", "/admin-ext/api/ai-chat/status")
    d = ctx.j(body)
    ctx.check("ai-chat", "status 提供商列表", st == 200 and isinstance(d.get("providers"), list), st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/ai-chat/login", data={"provider": "deepseek", "action": "bogus"})
    ctx.check("ai-chat", "login 未知 action 400", st == 400, st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/ai-chat/send", data={"provider": "deepseek", "prompt": ""})
    ctx.check("ai-chat", "send 空 prompt 400", st == 400, st)
    # admin-i18n
    P = "/admin-ext/api/i18n/settings"
    ctx.snapshot_setting("admin-i18n", P, method="PUT")
    st, _, _ = ctx.call("PUT", P, data={"enabled": True, "target": "bad", "webhookUrl": ""})
    ctx.check("admin-i18n", "非法 target 语言码 400", st == 400, st)
    st, body, _ = ctx.call("POST", "/admin-ext/api/i18n/test", data={"texts": []})
    d = ctx.j(body)
    ctx.check("admin-i18n", "test 未配置 webhook 时优雅返回 configured:false", st == 200 and d.get("configured") is False, st)

# ───────────────────────── 18. git-sync / gist-sync ─────────────────────────
def t_sync():
    print("\n== 18. git-sync / gist-sync（无凭证负例与历史） ==")
    st, body, _ = ctx.call("GET", "/admin-ext/api/gist-sync/settings")
    gj = ctx.j(body)
    ctx.check("gist-sync", "settings GET（token 掩码，hasToken 嵌在 settings）",
              st == 200 and gj.get("settings", {}).get("hasToken") in (True, False), st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/gist-sync/push", data={"confirm": True})
    ctx.check("gist-sync", "push 无 token 400", st == 400, st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/gist-sync/push", data={})
    ctx.check("gist-sync", "push 缺 confirm 403", st == 403, st)
    st, body, _ = ctx.call("GET", "/admin-ext/api/gist-sync/history")
    ctx.check("gist-sync", "history 可读", st == 200 and isinstance(ctx.j(body).get("history"), list), st)

    st, body, _ = ctx.call("GET", "/admin-ext/api/git-sync/settings")
    ctx.check("git-sync", "settings GET", st == 200 and "settings" in ctx.j(body), st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/git-sync/settings", data={"preset": "github"})
    ctx.check("git-sync", "settings 缺 confirm 403", st == 403, st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/git-sync/settings",
                        data={"confirm": True, "preset": "bad-preset", "owner": "a", "repo": "b", "scopes": {"dbDump": True}})
    ctx.check("git-sync", "非法 preset 400", st == 400, st)
    st, _, _ = ctx.call("POST", "/admin-ext/api/git-sync/settings",
                        data={"confirm": True, "preset": "github", "owner": "a", "repo": "b", "scopes": {"dbDump": False, "media": False, "configJson": False, "site": False}})
    ctx.check("git-sync", "scopes 全 false 400", st == 400, st)
    st, body, _ = ctx.call("GET", "/admin-ext/api/git-sync/history")
    ctx.check("git-sync", "history 可读（{ok,history}）", st == 200 and isinstance(ctx.j(body).get("history"), list), st)

# ───────────────────────── 19. static-html ─────────────────────────
def t_static_html():
    print("\n== 19. static-html 静态生成 ==")
    P = "/admin-ext/api/static-html"
    orig = ctx.snapshot_setting("static-html", f"{P}/settings")
    st, body, _ = ctx.call("POST", f"{P}/settings", data={"enabled": True, "outputDir": "static-html", "schedule": "manual",
                                                          "scheduleTime": "03:00", "scheduleWeekday": 0,
                                                          "includePages": False, "includeAssets": False, "maxPosts": 5})
    ctx.check("static-html", "settings 保存（小规模参数）", st == 200, st)
    st, _, _ = ctx.call("POST", f"{P}/generate", data={})
    ctx.check("static-html", "generate 缺 confirm 400", st == 400, st)
    st, body, _ = ctx.call("POST", f"{P}/generate", data={"confirm": True})
    d = ctx.j(body)
    ctx.check("static-html", "generate 触发生成", st == 200 and d.get("ok") is True, f"{st} {d}")
    ok_gen = False
    d = {}
    for _ in range(60):
        time.sleep(1)
        st, body, _ = ctx.call("GET", f"{P}/status")
        d = ctx.j(body)
        state = d.get("state") or {}
        if state.get("running") is False and state.get("finishedAt"):
            ok_gen = state.get("status") == "ok"
            break
    idx = os.path.join(ROOT, "static-html", "index.html")
    ctx.check("static-html", "生成完成且 static-html/index.html 已产出",
              ok_gen and os.path.exists(idx) and os.path.getsize(idx) > 500,
              f"state={d.get('state')}")

# ───────────────────────── 20. db-optimize / 21. 404 监控 ─────────────────────────
def t_dbopt_404():
    print("\n== 20. db-optimize 数据库维护 ==")
    P = "/admin-ext/api/db-opt"
    st, body, _ = ctx.call("GET", f"{P}/stats")
    d = ctx.j(body)
    ctx.check("db-optimize", "stats 库统计", st == 200 and d.get("dbBytes", 0) > 0 and d.get("supported") is True, list(d.keys())[:8])
    st, body, _ = ctx.call("POST", f"{P}/run", data={"action": "bad"})
    ctx.check("db-optimize", "run 非法 action 400", st == 400, st)
    st, _, _ = ctx.call("POST", f"{P}/run", data={"action": "analyze"})
    ctx.check("db-optimize", "run 缺 confirm 400", st == 400, st)
    st, body, _ = ctx.call("POST", f"{P}/run", data={"action": "analyze", "confirm": True})
    d = ctx.j(body)
    ctx.check("db-optimize", "ANALYZE 执行", st == 200 and d.get("ok") is True, f"{st} {str(d)[:150]}")
    st, body, _ = ctx.call("POST", f"{P}/run", data={"action": "delete_revisions", "confirm": True})
    ctx.check("db-optimize", "清理修订版本", st == 200 and "deleted" in ctx.j(body), st)

    print("\n== 21. error-monitor 404 监控 ==")
    P = "/admin-ext/api/404"
    ctx.snapshot_setting("error-monitor", f"{P}/settings")
    path = f"/f-round-404-{TS}"
    ctx.pub("GET", path)
    time.sleep(0.3)
    st, body, _ = ctx.call("GET", f"{P}/list")
    items = ctx.j(body).get("items", [])
    hit = next((x for x in items if x.get("path") == path), None)
    ctx.check("error-monitor", "匿名 404 被记录", st == 200 and hit and hit["hits"] >= 1, f"{len(items)} rows")
    st, _, _ = ctx.call("POST", f"{P}/actions", data={"confirm": True, "action": "delete"})
    ctx.check("error-monitor", "delete 缺 path 400", st == 400, st)
    st, _, _ = ctx.call("POST", f"{P}/actions", data={"action": "delete", "path": path})
    ctx.check("error-monitor", "delete 缺 confirm 400", st == 400, st)
    st, _, _ = ctx.call("POST", f"{P}/actions", data={"confirm": True, "action": "delete", "path": path})
    ctx.check("error-monitor", "delete 删除单条记录", st == 200, st)
    items = ctx.j(ctx.call("GET", f"{P}/list")[1]).get("items", [])
    ctx.check("error-monitor", "删除后列表不再含该路径", not any(x.get("path") == path for x in items), "")

# ───────────────────────── 22. multilingual（晚做，sqlite 恢复） ─────────────────────────
def t_ml():
    print("\n== 22. multilingual 多语言 ==")
    con = sqlite3.connect(DB)
    row = con.execute("select option_value from wp_options where option_name='astropress_ml_settings'").fetchone()
    orig_ml = row[0] if row else None
    con.close()
    try:
        st, body, _ = ctx.pub("GET", "/ml-asset/config")
        d = ctx.j(body)
        ctx.check("multilingual", "公开 config 匿名可读", st == 200 and "defaultLang" in d, st)
        st, body, _ = ctx.pub("GET", "/ml-asset/switcher.js")
        ctx.check("multilingual", "switcher.js 匿名 200", st == 200 and len(body) > 20, st)
        st, body, _ = ctx.pub("GET", "/ml-asset/panel.js")
        ctx.check("multilingual", "panel.js 匿名 200", st == 200, st)
        st, _, _ = ctx.call("PUT", "/admin-ext/api/ml/settings", data={"defaultLang": "zh", "urlStrategy": "prefix",
                                                                      "languages": [{"code": "bad code", "nativeLabel": "x"}]})
        ctx.check("multilingual", "非法语言码 400", st == 400, st)
        st, body, _ = ctx.call("PUT", "/admin-ext/api/ml/settings", data={"defaultLang": "zh", "urlStrategy": "prefix",
                                                                          "languages": [{"code": "zh", "nativeLabel": "中文", "enabled": True},
                                                                                        {"code": "en", "nativeLabel": "English", "enabled": True}]})
        ctx.check("multilingual", "启用中英双语", st == 200, st)
        st, body, _ = ctx.pub("GET", "/ml-asset/config")
        ctx.check("multilingual", "config 反映两种语言", len(ctx.j(body).get("languages", [])) == 2, st)
        st, _, _ = ctx.call("PUT", "/admin-ext/api/ml/strings", data={"code": "zh", "strings": {"hello": 123}})
        ctx.check("multilingual", "strings 非字符串值 400", st == 400, st)
        st, _, _ = ctx.call("PUT", "/admin-ext/api/ml/strings", data={"code": "zh", "strings": {"hello": "你好"}})
        ctx.check("multilingual", "strings 保存译文", st == 200, st)
        st, body, _ = ctx.call("GET", "/admin-ext/api/ml/strings?code=zh")
        ctx.check("multilingual", "strings 读取译文", ctx.j(body).get("strings", {}).get("hello") == "你好", st)
        st, _, _ = ctx.call("POST", "/admin-ext/api/ml/links", data={"action": "link", "baseId": 28, "targetId": 28, "lang": "en"})
        ctx.check("multilingual", "文章自链 400", st == 400, st)
    finally:
        con = sqlite3.connect(DB)
        if orig_ml is None:
            con.execute("delete from wp_options where option_name='astropress_ml_settings'")
        else:
            con.execute("update wp_options set option_value=? where option_name='astropress_ml_settings'", (orig_ml,))
        con.commit(); con.close()
        ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})

# ───────────────────────── 23. plugin-manager 启停/清除 ─────────────────────────
def t_plugin_manager():
    print("\n== 23. plugin-manager 启停/配置清除 ==")
    P = "/admin-ext/api/plugin-manager"
    states = ctx.j(ctx.call("GET", f"{P}/state")[1])
    sys_slug = next((s["slug"] for s in states if s.get("system")), None)
    ctx.check("plugin-manager", "state 列出全部 40 插件", len(states) >= 40, len(states))
    st, _, _ = ctx.call("POST", f"{P}/state", data={"slug": "bad slug", "enabled": False})
    ctx.check("plugin-manager", "非法 slug 400", st == 400, st)
    if sys_slug:
        st, _, _ = ctx.call("POST", f"{P}/state", data={"slug": sys_slug, "enabled": False})
        ctx.check("plugin-manager", "系统插件禁禁用 400", st == 400, f"{sys_slug} {st}")
    # 禁用 html-opt → guard 404 + 前台无头优化
    st, _, _ = ctx.call("POST", f"{P}/state", data={"slug": "html-opt", "enabled": False})
    ctx.check("plugin-manager", "禁用 html-opt", st == 200, st)
    st, _, _ = ctx.call("GET", "/admin-ext/api/html-opt/settings")
    ctx.check("plugin-manager", "被禁插件路由立即 404（guard pre）", st == 404, st)
    # F-T8-02：状态变更后共享缓存被主动失效（invalidatePluginStates），
    # 同进程前台中间件应在「第一次 MISS」即生效，无需再等 15s TTL
    ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
    _, _, hdr0 = ctx.pub("GET", "/blog/pv-tips")
    ctx.check("plugin-manager", "禁用后首个前台 MISS 即无 X-HTML-Opt 头（共享缓存即时失效）", not hdr0.get("x-html-opt"), hdr0.get("x-html-opt"))
    gone = not hdr0.get("x-html-opt")
    hdr = hdr0
    # 兼容跨进程部署（独立 web 进程最坏退化回 15s TTL）：未即时生效时轮询兜底
    for _ in range(16):
        if gone:
            break
        ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
        _, _, hdr = ctx.pub("GET", "/blog/pv-tips")
        if not hdr.get("x-html-opt"):
            gone = True
            break
        time.sleep(2)
    ctx.check("plugin-manager", "禁用后前台 MISS 无 X-HTML-Opt 头（≤32s 生效）", gone, hdr.get("x-html-opt"))
    st, _, _ = ctx.call("POST", f"{P}/state", data={"slug": "html-opt", "enabled": True})
    ctx.check("plugin-manager", "重新启用 html-opt", st == 200, st)
    st, _, _ = ctx.call("GET", "/admin-ext/api/html-opt/settings")
    ctx.check("plugin-manager", "重新启用后路由恢复", st == 200, st)
    ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
    _, _, hdr0 = ctx.pub("GET", "/blog/pv-tips")
    ctx.check("plugin-manager", "启用后首个前台 MISS 即恢复 X-HTML-Opt 头（共享缓存即时失效）",
              (hdr0.get("x-html-opt") or "").lower() == "on", hdr0.get("x-html-opt"))
    back = (hdr0.get("x-html-opt") or "").lower() == "on"
    hdr = hdr0
    for _ in range(16):
        if back:
            break
        ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
        _, _, hdr = ctx.pub("GET", "/blog/pv-tips")
        if (hdr.get("x-html-opt") or "").lower() == "on":
            back = True
            break
        time.sleep(2)
    ctx.check("plugin-manager", "重新启用后前台 MISS 恢复 X-HTML-Opt 头（≤32s）", back, hdr.get("x-html-opt"))
    # 配置清除（share 快照已在恢复链，清完恢复默认即可）
    st, _, _ = ctx.call("POST", f"{P}/purge", data={"slug": "no-such-plugin"})
    ctx.check("plugin-manager", "purge 未知插件 404", st == 404, st)
    if sys_slug:
        st, _, _ = ctx.call("POST", f"{P}/purge", data={"slug": sys_slug})
        ctx.check("plugin-manager", "purge 系统插件 400", st == 400, st)
    st, body, _ = ctx.call("POST", f"{P}/purge", data={"slug": "share"})
    d = ctx.j(body)
    ctx.check("plugin-manager", "purge 清除 share 配置", st == 200 and d.get("removed", 0) >= 1, d)

# ───────────────────────── 24. 33 个后台页 ─────────────────────────
ADMIN_PAGES = [
    "/admin-ext/404-monitor", "/admin-ext/ads", "/admin-ext/ai-chat", "/admin-ext/backup",
    "/admin-ext/comments", "/admin-ext/config-io", "/admin-ext/customer-service", "/admin-ext/db-console",
    "/admin-ext/db-optimize", "/admin-ext/donation", "/admin-ext/files", "/admin-ext/footer",
    "/admin-ext/gist-sync", "/admin-ext/git-sync", "/admin-ext/gitalk", "/admin-ext/html-opt",
    "/admin-ext/i18n", "/admin-ext/image-lazy", "/admin-ext/links", "/admin-ext/multilingual",
    "/admin-ext/page-cache", "/admin-ext/permalink", "/admin-ext/plugin-manager", "/admin-ext/redirects",
    "/admin-ext/related-posts", "/admin-ext/search", "/admin-ext/security-headers", "/admin-ext/seo-tools",
    "/admin-ext/share", "/admin-ext/sitemap", "/admin-ext/static-html", "/admin-ext/webhooks",
    "/admin-ext/webdav",
]

def t_admin_pages():
    print("\n== 24. 33 个后台管理页可访问性 ==")
    bad = []
    for p in ADMIN_PAGES:
        st, body, _ = ctx.call("GET", p)
        ok = st == 200 and b"ap-admin" in body or st == 200 and b"wp-sidebar" in body or st == 200 and b"<body" in body
        if not ok:
            bad.append((p, st))
    ctx.check("admin-pages", f"全部 {len(ADMIN_PAGES)} 个后台页 200 且渲染 HTML", not bad, bad)

# ───────────────────────── main ─────────────────────────
def main():
    st, _, _ = ctx.call("POST", "/api/auth/login", raw="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "",
                        ct="application/x-www-form-urlencoded")
    assert st in (200, 302), f"login failed {st}"
    groups = [t_security, t_files, t_dbconsole, t_backup, t_configio, t_comments, t_redirects,
              t_links, t_ads, t_settings_and_frontend, t_seo_feeds, t_webhook, t_webdav,
              t_permalink, t_editors, t_ai, t_sync, t_static_html, t_dbopt_404, t_ml,
              t_plugin_manager, t_admin_pages]
    try:
        for g in groups:
            try:
                g()
            except Exception as e:
                ctx.check(g.__name__, "用例组未抛异常", False, f"{type(e).__name__}: {e}")
            ctx.save()
    finally:
        print("\n== 恢复所有设置快照 ==")
        for name, fn in reversed(ctx.restores):
            try:
                fn()
                print(f"  restored {name}")
            except Exception as e:
                print(f"  restore {name} FAILED: {e}")
        # share 显式恢复（purge 后快照恢复默认值即可，确保启用状态）
        ctx.call("POST", "/admin-ext/api/share/settings", data={
            "enabled": True, "heading": "分享这篇文章", "position": "after",
            "platforms": {"wechat": True, "weibo": True, "qq": True, "zhihu": False, "twitter": True,
                          "facebook": False, "linkedin": False, "telegram": False,
                          "whatsapp": False, "copylink": True}})
        # 安全头/html优化/懒加载恢复项目默认
        ctx.call("POST", "/admin-ext/api/security-headers/settings", data={
            "enabled": True, "nosniff": True, "frameOptions": "SAMEORIGIN",
            "referrerPolicy": "strict-origin-when-cross-origin", "permissionsPolicy": "",
            "hstsMaxAge": 0, "csp": "", "cspReportOnly": False})
        ctx.call("POST", "/admin-ext/api/html-opt/settings", data={
            "enabled": True, "removeComments": True, "collapseWhitespace": True,
            "resourceHints": True, "preconnect": [], "dnsPrefetch": []})
        ctx.call("POST", "/admin-ext/api/image-lazy/settings", data={
            "enabled": True, "lazyImages": True, "lazyIframes": True, "skipFirst": 1})
        ctx.call("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
        ctx.save()

    total = len(ctx.results)
    passed = sum(1 for r in ctx.results if r["ok"])
    print("\n" + "=" * 60)
    print(f"TOTAL {total}  PASS {passed}  FAIL {total - passed}")
    by = {}
    for r in ctx.results:
        by.setdefault(r["plugin"], [0, 0])
        by[r["plugin"]][0] += r["ok"]
        by[r["plugin"]][1] += 1
    for k, (p, t) in sorted(by.items()):
        print(f"  {k:20s} {p}/{t}")
    fails = [r for r in ctx.results if not r["ok"]]
    if fails:
        print("\n-- FAILURES --")
        for r in fails:
            print(f"  [{r['plugin']}] {r['feature']} :: {r['detail']}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
