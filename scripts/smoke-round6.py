# -*- coding: utf-8 -*-
"""第六轮冒烟：ai-chat(视图 API) / comments / db-console / backup /
link-directory / config-io / media-av / wp-editor + 主题页注入核查。

用法: python scripts/smoke-round6.py
退出码: 0 全过；1 有失败。
"""
import os
import io
import json
import re
import sys
import requests

BASE = "http://localhost:4321"
admin = requests.Session()
anon = requests.Session()
ok = fail = 0


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS {name} {extra}")
    else:
        fail += 1
        print(f"  FAIL {name} {extra}")


# ── 登录 ──────────────────────────────────────────────────────────
r = admin.post(f"{BASE}/api/auth/login", data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")},
               allow_redirects=False, timeout=10)
check("管理员登录", r.status_code in (302, 303), f"[{r.status_code}]")

# ── 管理页 200 ────────────────────────────────────────────────────
print("== 新管理页 ==")
for path in ["/admin-ext/ai-chat", "/admin-ext/comments", "/admin-ext/db-console",
             "/admin-ext/backup", "/admin-ext/links", "/admin-ext/config-io"]:
    r = admin.get(f"{BASE}{path}", timeout=20)
    check(f"GET {path}", r.status_code == 200, f"[{r.status_code}] len={len(r.text)}")

# ── ai-chat 状态 API（不启动浏览器） ──────────────────────────────
print("== ai-chat ==")
r = admin.get(f"{BASE}/admin-ext/api/ai-chat/status", timeout=10)
d = r.json()
check("status 200", r.status_code == 200, f"[{r.status_code}]")
check("5 个 provider", len(d.get("providers", [])) == 5, str([p["id"] for p in d.get("providers", [])]))
check("viewport 1280x800", d.get("viewport", {}).get("width") == 1280 and d["viewport"]["height"] == 800)
r = admin.post(f"{BASE}/admin-ext/api/ai-chat/view", json={"provider": "deepseek", "action": "navigate",
               "url": "https://evil.com/x"}, timeout=15)
check("view 非法 host 拒绝", r.status_code == 400 and "host" in r.json().get("error", ""), f"[{r.status_code}]")
r = admin.post(f"{BASE}/admin-ext/api/ai-chat/view", json={"provider": "nope", "action": "info"}, timeout=10)
check("view 未知 provider 400", r.status_code == 400, f"[{r.status_code}]")
r = anon.post(f"{BASE}/admin-ext/api/ai-chat/view", json={"provider": "deepseek", "action": "info"},
              timeout=10, allow_redirects=False)
check("view 未登录拒绝", r.status_code in (401, 302), f"[{r.status_code}]")

# ── db-console ────────────────────────────────────────────────────
print("== db-console ==")
r = admin.get(f"{BASE}/admin-ext/api/db-console/tables", timeout=10)
payload = r.json() if r.status_code == 200 else {}
tables = payload.get("tables", [])
names = [t.get("name") if isinstance(t, dict) else t for t in tables]
check("tables 含 wp_posts", "wp_posts" in names, f"[{r.status_code}] n={len(names)}")
r = admin.post(f"{BASE}/admin-ext/api/db-console/exec", json={"sql": "SELECT 1 AS n", "confirmWrite": False}, timeout=15)
d = r.json()
check("SELECT 1", r.status_code == 200 and d.get("rows", [{}])[0].get("n") == 1, f"[{r.status_code}] {str(d)[:120]}")
for bad, label in [("ATTACH DATABASE 'x.db' AS x", "ATTACH 拦截"),
                   ("SELECT 1; SELECT 2", "多语句拦截"),
                   ("DROP TABLE ap_comments", "写操作未确认拦截")]:
    r = admin.post(f"{BASE}/admin-ext/api/db-console/exec", json={"sql": bad, "confirmWrite": False}, timeout=10)
    check(label, r.status_code in (400, 403), f"[{r.status_code}] {r.text[:80]}")
r = admin.get(f"{BASE}/admin-ext/api/db-console/export?name=wp_options&format=csv", timeout=20)
check("export csv", r.status_code == 200 and "text/csv" in r.headers.get("content-type", ""),
      f"[{r.status_code}] bytes={len(r.content)}")

# ── backup ────────────────────────────────────────────────────────
print("== backup ==")
r = admin.get(f"{BASE}/admin-ext/api/backup/list", timeout=15)
check("backup list", r.status_code == 200 and isinstance(r.json().get("entries"), list), f"[{r.status_code}]")

# ── link-directory ────────────────────────────────────────────────
print("== link-directory ==")
r = admin.get(f"{BASE}/admin-ext/api/links/cats", timeout=10)
check("links cats", r.status_code == 200 and isinstance(r.json(), list), f"[{r.status_code}]")
r = admin.get(f"{BASE}/admin-ext/api/links", timeout=10)
check("links list", r.status_code == 200 and isinstance(r.json(), list), f"[{r.status_code}]")
r = anon.get(f"{BASE}/directory", timeout=15)
check("公开 /directory", r.status_code == 200 and ("ap-directory" in r.text or "网站目录" in r.text),
      f"[{r.status_code}] len={len(r.text)}")

# ── config-io ─────────────────────────────────────────────────────
print("== config-io ==")
r = admin.get(f"{BASE}/admin-ext/api/config-io/export", timeout=20)
check("export 200 附件", r.status_code == 200 and "attachment" in r.headers.get("content-disposition", ""),
      f"[{r.status_code}]")
try:
    blob = r.json()
    check("export JSON 结构", isinstance(blob, dict) and "sections" in blob, str(list(blob.keys())[:8]))
    raw = json.dumps(blob, ensure_ascii=False)
    check("导出不含 setup_complete", "setup_complete" not in raw)
    check("导出无明文密码字段", not re.search(r'"[^"]*(?:password|secret|salt)[^"]*"\s*:\s*"[^"]{6,}"', raw, re.I))
except Exception as e:
    check("export JSON 结构", False, str(e))

# ── media-av ──────────────────────────────────────────────────────
print("== media-av ==")
r = anon.post(f"{BASE}/api/ap-media-av/upload", files={"file": ("a.mp3", b"not an audio file", "audio/mpeg")},
              data={"kind": "audio"}, timeout=10, allow_redirects=False)
check("未登录上传拒绝", r.status_code in (401, 403, 302), f"[{r.status_code}]")
r = admin.post(f"{BASE}/api/ap-media-av/upload", files={"file": ("a.mp3", b"not an audio file", "audio/mpeg")},
               data={"kind": "audio"}, timeout=10)
check("伪造内容嗅探拒绝 415", r.status_code == 415, f"[{r.status_code}] {r.text[:80]}")
r = admin.post(f"{BASE}/api/ap-media-av/upload",
               files={"file": ("evil.mp4", b"<html><script>alert(1)</script>", "video/mp4")},
               data={"kind": "video"}, timeout=10)
check("HTML 伪装视频拒绝", r.status_code == 415, f"[{r.status_code}]")
r = admin.post(f"{BASE}/api/ap-media-av/upload", files={"file": ("x.txt", b"hello", "text/plain")},
               data={"kind": "video"}, timeout=10)
check("扩展名白名单", r.status_code == 415, f"[{r.status_code}]")
for path, marker in [("/api/ap-media-av/media-av.js", "apav"), ("/api/ap-wp-editor/wp-editor.js", "apwp")]:
    r = admin.get(f"{BASE}{path}", timeout=10)
    check(f"GET {path}", r.status_code == 200 and marker in r.text and "javascript" in r.headers.get("content-type", ""),
          f"[{r.status_code}]")

# ── comments：注入 + 公开提交 + 管理动作 ──────────────────────────
print("== comments ==")
home = anon.get(f"{BASE}/", timeout=15).text
slugs = re.findall(r"/blog/([a-zA-Z0-9_-]+)", home)
slug = next((s for s in slugs if s not in ("category", "tag", "page")), None)
check("首页发现文章 slug", bool(slug), str(slugs[:5]))
if slug:
    page = anon.get(f"{BASE}/blog/{slug}", timeout=15)
    check("文章页 200", page.status_code == 200, f"[{page.status_code}]")
    check("评论区注入", 'id="ap-comments"' in page.text and "/ap-comments/submit" in page.text,
          f"len={len(page.text)}")
    check("隔离样式前缀", ".ap-cmt-" in page.text and "#ap-comments" in page.text)

    before = admin.get(f"{BASE}/admin-ext/api/comments/list?status=pending&page=1", timeout=10).json()
    n_before = before.get("total", 0)

    body = {"slug": slug, "author": "冒烟测试员", "email": "smoke@example.com",
            "content": "这是一条自动化冒烟评论 round6", "ap_website": ""}
    r = anon.post(f"{BASE}/ap-comments/submit", json=body, timeout=10)
    check("提交评论 201 pending", r.status_code == 201 and r.json().get("status") == "pending",
          f"[{r.status_code}] {r.text[:100]}")
    after = admin.get(f"{BASE}/admin-ext/api/comments/list?status=pending&page=1", timeout=10).json()
    check("待审列表 +1", after.get("total", 0) == n_before + 1, f"{n_before} -> {after.get('total')}")
    cid = None
    for it in after.get("items", []):
        if it.get("content", "").startswith("这是一条自动化冒烟"):
            cid = it.get("id")
            break
    check("找到测试评论 id", cid is not None, str(cid))

    # 待审评论不应出现在前台
    page2 = anon.get(f"{BASE}/blog/{slug}", timeout=15).text
    check("待审评论前台不可见", "这是一条自动化冒烟评论 round6" not in page2)

    # 蜜罐：伪装成功但不入库
    hp = dict(body, ap_website="http://spam.example")
    r = anon.post(f"{BASE}/ap-comments/submit", json=hp, timeout=10)
    check("蜜罐 202", r.status_code == 202 and r.json().get("ok"), f"[{r.status_code}]")
    after2 = admin.get(f"{BASE}/admin-ext/api/comments/list?status=pending&page=1", timeout=10).json()
    check("蜜罐未入库", after2.get("total", 0) == after.get("total", 0))

    # 非法邮箱 / XSS 昵称
    r = anon.post(f"{BASE}/ap-comments/submit", json=dict(body, email="not-an-email"), timeout=10)
    check("非法邮箱 400", r.status_code == 400, f"[{r.status_code}]")
    r = anon.post(f"{BASE}/ap-comments/submit", json=dict(body, content="<script>alert(1)</script>"), timeout=10)
    check("脚本评论进入待审（前台转义）", r.status_code == 201, f"[{r.status_code}]")

    # 批准一条后前台必须转义显示
    xid = None
    after3 = admin.get(f"{BASE}/admin-ext/api/comments/list?status=pending&page=1", timeout=10).json()
    for it in after3.get("items", []):
        if "<script>" in it.get("content", ""):
            xid = it.get("id")
    if xid:
        r = admin.post(f"{BASE}/admin-ext/api/comments/action", json={"ids": [xid], "action": "approve"}, timeout=10)
        check("批准评论", r.status_code == 200 and r.json().get("ok"), f"[{r.status_code}]")
        page3 = anon.get(f"{BASE}/blog/{slug}", timeout=15).text
        check("前台 script 已转义", "<script>alert(1)</script>" not in page3 and "&lt;script&gt;" in page3)
        admin.post(f"{BASE}/admin-ext/api/comments/action", json={"ids": [xid], "action": "trash"}, timeout=10)

    # 清理
    if cid:
        r = admin.post(f"{BASE}/admin-ext/api/comments/action", json={"ids": [cid], "action": "delete"}, timeout=10)
        check("清理测试评论", r.status_code == 200 and r.json().get("ok"), f"[{r.status_code}]")

# ── 侧边栏注入（后台任一页含新菜单） ──────────────────────────────
dash = admin.get(f"{BASE}/admin/dashboard", timeout=15).text
for href, label in [("/admin-ext/comments", "评论"), ("/admin-ext/db-console", "数据库"),
                    ("/admin-ext/backup", "备份"), ("/admin-ext/links", "目录"),
                    ("/admin-ext/config-io", "配置")]:
    check(f"侧边栏 {label}", href in dash, href)

print(f"\n结果: {ok} 通过, {fail} 失败")
sys.exit(1 if fail else 0)
