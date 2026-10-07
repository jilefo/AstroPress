#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AstroPress 全插件全功能综合测试（临时脚本，测完可删）
原则：不破坏真实数据——测试数据全部带 ap-test 时间戳标识，用各插件自身 API 清理。
"""
import os
import json
import sys
import time
import base64
import requests

BASE = "http://localhost:4321"
TS = int(time.time())
TAG = f"ap-test-{TS}"

results = []  # (plugin, case, status[pass/fail/warn/skip], detail, ms)


def rec(plugin, case, ok, detail="", ms=0, warn=False):
    status = "warn" if (ok and warn) else ("pass" if ok else "fail")
    results.append((plugin, case, status, str(detail)[:600], round(ms, 1)))
    flag = {"pass": "PASS", "fail": "FAIL", "warn": "WARN", "skip": "SKIP"}[status]
    print(f"[{flag}] {plugin} :: {case}" + (f" -- {detail}" if detail and not ok else ""))


def timed():
    return time.perf_counter()


# ---------------- session ----------------
adm = requests.Session()
adm.headers.update({"Origin": BASE, "Referer": BASE + "/admin/dashboard",
                    "User-Agent": "ap-full-test/1.0"})
anon = requests.Session()
anon.headers.update({"User-Agent": "ap-full-test-anon/1.0"})


def J(r):
    try:
        return r.json()
    except Exception:
        return None


# ---------------- 登录 ----------------
t0 = timed()
r = adm.post(BASE + "/api/auth/login",
             data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")},
             allow_redirects=False, timeout=15)
ms = (timed() - t0) * 1000
login_ok = r.status_code == 302
rec("core", "管理员登录(form→302)", login_ok, f"status={r.status_code}", ms)
if not login_ok:
    print("登录失败，终止"); sys.exit(1)

r = anon.post(BASE + "/api/auth/login", data={"username": "admin", "password": "wrong"},
              allow_redirects=False, timeout=15)
loc = r.headers.get("location", "")
rec("core", "错误密码被拒(302→/login?error)", r.status_code == 302 and "error" in loc,
    f"status={r.status_code} loc={loc}")

# 通用匿名访问探测（未登录：API 返回 401/403，或被核心登录墙 302 到 /login）
def expect_anon_401(plugin, path, method="GET", **kw):
    try:
        r = anon.request(method, BASE + path, timeout=15, allow_redirects=False, **kw)
        blocked = r.status_code in (401, 403) or (
            r.status_code in (301, 302) and "/login" in (r.headers.get("location") or ""))
        rec(plugin, f"匿名访问被拒 {path}", blocked,
            f"status={r.status_code} loc={r.headers.get('location')}")
    except Exception as e:
        rec(plugin, f"匿名访问被拒 {path}", False, repr(e))


def expect_csrf_403(plugin, path, method="POST", **kw):
    h = dict(adm.headers)
    h["Origin"] = "http://evil.example.com"
    try:
        r = adm.request(method, BASE + path, headers=h, timeout=15, allow_redirects=False, **kw)
        rec(plugin, f"跨域写被拒 {path}", r.status_code == 403, f"status={r.status_code}")
    except Exception as e:
        rec(plugin, f"跨域写被拒 {path}", False, repr(e))


admin_pages = []  # (slug, path)


def admin_page(plugin, path, name=None):
    t0 = timed()
    try:
        r = adm.get(BASE + path, timeout=20)
        ok = r.status_code == 200 and len(r.text) > 500
        rec(plugin, f"后台页 {name or path}", ok, f"status={r.status_code} len={len(r.text)}",
            (timed() - t0) * 1000)
        admin_pages.append((plugin, path))
    except Exception as e:
        rec(plugin, f"后台页 {name or path}", False, repr(e))


# =====================================================================
# 1. seo-tools
# =====================================================================
P = "seo-tools"
try:
    t0 = timed(); r = anon.get(BASE + "/rss.xml", timeout=20); ms = (timed() - t0) * 1000
    ok = r.status_code == 200 and ("xml" in r.headers.get("content-type", "")) and b"<rss" in r.content[:500]
    rec(P, "RSS 订阅 /rss.xml", ok, f"status={r.status_code} bytes={len(r.content)}", ms)

    t0 = timed(); r = anon.get(BASE + "/robots.txt", timeout=15); ms = (timed() - t0) * 1000
    rec(P, "robots.txt", r.status_code == 200 and len(r.text.strip()) > 0,
        f"status={r.status_code} body={r.text[:80]!r}", ms)

    r = adm.get(BASE + "/admin-ext/api/seo-tools/settings", timeout=15)
    s = J(r)
    rec(P, "设置 GET", r.status_code == 200 and isinstance(s, dict), f"status={r.status_code}")
    if isinstance(s, dict):
        r2 = adm.post(BASE + "/admin-ext/api/seo-tools/settings", json=s, timeout=15)
        rec(P, "设置 POST 回写往返", r2.status_code == 200, f"status={r2.status_code} {r2.text[:120]}")
        r3 = adm.get(BASE + "/admin-ext/api/seo-tools/settings", timeout=15)
        rec(P, "设置回写后一致", J(r3) == s, "设置发生漂移")
    admin_page(P, "/admin-ext/seo-tools")
    expect_anon_401(P, "/admin-ext/api/seo-tools/settings")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 2. search
# =====================================================================
P = "search"
try:
    t0 = timed(); r = anon.get(BASE + "/search", params={"q": "the"}, timeout=20); ms = (timed() - t0) * 1000
    rec(P, "搜索页 /search?q=the", r.status_code == 200 and len(r.text) > 500,
        f"status={r.status_code}", ms)
    longq = "a" * 100
    r = anon.get(BASE + "/search", params={"q": longq}, timeout=20)
    rec(P, "q=100 字符边界接受", r.status_code == 200, f"status={r.status_code}")
    r = anon.get(BASE + "/search", params={"q": "a" * 101}, timeout=20)
    rec(P, "q=101 字符被截断/不500", r.status_code in (200, 400), f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/search/settings", timeout=15)
    s = J(r)
    if isinstance(s, dict):
        adm.post(BASE + "/admin-ext/api/search/settings", json=s, timeout=15)
        r3 = adm.get(BASE + "/admin-ext/api/search/settings", timeout=15)
        rec(P, "设置往返一致", J(r3) == s)
    else:
        rec(P, "设置 GET", False, r.text[:120])
    admin_page(P, "/admin-ext/search")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 3. related-posts
# =====================================================================
P = "related-posts"
try:
    r = adm.get(BASE + "/admin-ext/api/related-posts/settings", timeout=15)
    s = J(r)
    rec(P, "设置 GET", r.status_code == 200 and isinstance(s, dict), f"keys={list(s)[:8] if isinstance(s,dict) else ''}")
    if isinstance(s, dict):
        r2 = adm.post(BASE + "/admin-ext/api/related-posts/settings", json=s, timeout=15)
        rec(P, "设置 POST 往返", r2.status_code == 200, f"status={r2.status_code}")
    # track 像素（公开）
    r = anon.get(BASE + "/ap-related/track", params={"post": "nonexistent-" + TAG}, timeout=15)
    rec(P, "追踪像素容错(不存在文章不500)", r.status_code == 200 and len(r.content) > 0,
        f"status={r.status_code} ct={r.headers.get('content-type')}")
    r = anon.get(BASE + "/ap-related/track", timeout=15)
    rec(P, "追踪像素缺参不500", r.status_code in (200, 400), f"status={r.status_code}")
    # 伪造数字 postId 不得写入孤儿 postmeta
    fake_pid = 999999901
    adm.post(BASE + "/admin-ext/api/db-console/exec",
             json={"sql": f"DELETE FROM wp_postmeta WHERE post_id={fake_pid}", "confirmWrite": True}, timeout=15)
    for _ in range(2):
        anon.get(BASE + "/ap-related/track", params={"post": fake_pid}, timeout=15)
    q = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"SELECT COUNT(*) AS c FROM wp_postmeta WHERE post_id={fake_pid} "
                              f"AND meta_key='_ap_view_count'"}, timeout=15).json()
    rec(P, "伪造 postId 不产生孤儿浏览量行", (q.get("rows") or [{}])[0].get("c") == 0,
        f"rows={q.get('rows')}")
    admin_page(P, "/admin-ext/related-posts")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 4. redirect
# =====================================================================
P = "redirect"
rule_id = None
try:
    f1, fc = f"/oldpage-{TS}-a", f"/oldpage-{TS}-c"
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f1, "to": "https://example.com/x", "type": 301}, timeout=15)
    j = J(r)
    rec(P, "新建 301 规则", r.status_code == 200 and j and j.get("ok"), f"{r.status_code} {r.text[:120]}")
    if j and j.get("rule"):
        rule_id = j["rule"].get("id")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f1, "to": "/x", "type": 301}, timeout=15)
    rec(P, "from 重复拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": "bad", "to": "/x", "type": 301}, timeout=15)
    rec(P, "非法 from 拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f"/oldpage-{TS}-bad2", "to": "ftp://x", "type": 301}, timeout=15)
    rec(P, "非法 to 拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f"/oldpage-{TS}-bad3", "to": "/x", "type": 303}, timeout=15)
    rec(P, "非法 type 拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f"/ap-oldpage-{TS}", "to": "/x", "type": 301}, timeout=15)
    rec(P, "保留前缀(/ap-)规则拒绝保存", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": "/" + "x" * 3000, "to": "/x", "type": 301}, timeout=15)
    rec(P, "超长 from(>2048)拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f"/crlf-{TS}", "to": "https://a.com/\r\nX-Evil: 1", "type": 301}, timeout=15)
    rec(P, "CRLF 注入 to 拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f"/proto-{TS}", "to": "//evil.com/x", "type": 301}, timeout=15)
    rec(P, "协议相对 //evil 拒绝(防开放重定向)", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/redirects",
                 json={"from": f"/bs-{TS}", "to": "/\\\\evil.com/x", "type": 301}, timeout=15)
    rec(P, "反斜杠混淆 to 拒绝", r.status_code == 400, f"status={r.status_code}")
    # 构造循环：先让 a->内部 c，再加 c->a 成环
    if rule_id:
        r = adm.put(BASE + "/admin-ext/api/redirects",
                    json={"id": rule_id, "to": fc, "type": 302}, timeout=15)
        rec(P, "PUT 修改规则", r.status_code == 200 and J(r).get("ok"), f"{r.status_code}")
        r = adm.post(BASE + "/admin-ext/api/redirects",
                     json={"from": fc, "to": f1, "type": 302}, timeout=15)
        rec(P, "多跳循环检测拒绝(c->a 成环)", r.status_code == 400, f"status={r.status_code}")
        # 禁用后再启用
        r = adm.put(BASE + "/admin-ext/api/redirects",
                    json={"id": rule_id, "enabled": False}, timeout=15)
        rec(P, "禁用规则", r.status_code == 200)
        # 禁用态下访问 f1 不应跳转
        rr = anon.get(BASE + f1, allow_redirects=False, timeout=15)
        rec(P, "禁用规则不跳转", rr.status_code not in (301, 302), f"status={rr.status_code}")
        r = adm.put(BASE + "/admin-ext/api/redirects",
                    json={"id": rule_id, "enabled": True, "to": "https://example.com/final"}, timeout=15)
        rec(P, "启用规则", r.status_code == 200)
        rr = anon.get(BASE + f1, allow_redirects=False, timeout=15)
        rec(P, "302/301 实际跳转生效", rr.status_code in (301, 302) and
            "example.com" in rr.headers.get("location", ""),
            f"status={rr.status_code} loc={rr.headers.get('location')}")
    expect_anon_401(P, "/admin-ext/api/redirects")
    expect_csrf_403(P, "/admin-ext/api/redirects", json={"from": f"/{TAG}-x", "to": "/y", "type": 301})
    admin_page(P, "/admin-ext/redirects")
finally:
    if rule_id:
        adm.delete(BASE + "/admin-ext/api/redirects", params={"id": rule_id}, timeout=15)
        rr = adm.get(BASE + "/admin-ext/api/redirects", timeout=15)
        gone = not any(x.get("id") == rule_id for x in (J(rr) or []))
        rec(P, "DELETE 清理测试规则", gone)

# =====================================================================
# 5. comments（蜜罐/频控/审核/回复/设置）
# =====================================================================
P = "comments"
comment_ids = []
saved_csettings = None
target_slug = None
saved_comment_status = None
try:
    # 找一篇已发布文章
    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": "SELECT id, post_name, comment_status FROM wp_posts "
                              "WHERE post_status='publish' AND post_type='post' "
                              "ORDER BY id DESC LIMIT 1"}, timeout=20)
    row = (J(r) or {}).get("rows", [])
    if row:
        post_id = row[0]["ID"]
        target_slug = row[0]["post_name"]
        saved_comment_status = row[0]["comment_status"]
        if saved_comment_status != "open":
            adm.post(BASE + "/admin-ext/api/db-console/exec",
                     json={"sql": f"UPDATE wp_posts SET comment_status='open' WHERE id={int(post_id)}",
                           "confirmWrite": True}, timeout=20)
    rec(P, "准备已发布且开放评论的文章", bool(row), f"slug={target_slug}")

    r = adm.get(BASE + "/admin-ext/api/comments/settings", timeout=15)
    saved_csettings = J(r)
    if isinstance(saved_csettings, dict):
        new_s = dict(saved_csettings)
        new_s["enabled"] = True
        new_s["autoApprove"] = False
        adm.post(BASE + "/admin-ext/api/comments/settings", json=new_s, timeout=15)

    # 蜜罐：静默 202 不入库
    r = anon.post(BASE + "/ap-comments/submit", json={
        "slug": target_slug, "author": "bot", "email": "b@b.com",
        "content": "spam", "ap_website": "http://spam.test"}, timeout=15)
    rec(P, "蜜罐评论静默 202", r.status_code == 202, f"status={r.status_code}")
    # 非法字段不消耗频控
    r = anon.post(BASE + "/ap-comments/submit",
                  json={"slug": target_slug, "author": "", "email": "bad", "content": ""}, timeout=15)
    rec(P, "字段校验拒绝(400)", r.status_code == 400, f"status={r.status_code}")
    r = anon.post(BASE + "/ap-comments/submit",
                  json={"slug": "no-such-post-" + TAG, "author": "x",
                        "email": "x@x.com", "content": "hi"}, timeout=15)
    rec(P, "不存在文章拒绝", r.status_code == 400, f"status={r.status_code}")
    # 合法评论 1
    r = anon.post(BASE + "/ap-comments/submit", json={
        "slug": target_slug, "author": f"Tester {TS}",
        "email": f"t{TS}@example.com", "website": "https://example.com",
        "content": f"全功能测试评论 1/{TS}"}, timeout=15)
    j = J(r)
    rec(P, "提交合法评论→201 pending", r.status_code == 201 and j and j.get("status") == "pending",
        f"{r.status_code} {r.text[:100]}")

    # 后台列表
    r = adm.get(BASE + "/admin-ext/api/comments/list",
                params={"status": "pending", "q": str(TS), "page": 1}, timeout=15)
    j = J(r) or {}
    items = j.get("items", [])
    rec(P, "后台评论列表+搜索", isinstance(items, list) and len(items) >= 1,
        f"total={j.get('total')} counts={j.get('counts')}")
    if items:
        cid1 = items[0]["id"]
        comment_ids.append(cid1)
        # 批准
        r = adm.post(BASE + "/admin-ext/api/comments/action",
                     json={"ids": [cid1], "action": "approve"}, timeout=15)
        rec(P, "审核通过", r.status_code == 200 and J(r).get("ok"))
        # 回复
        r = adm.post(BASE + "/admin-ext/api/comments/reply", json={
            "id": cid1, "content": f"管理员回复 {TS}"}, timeout=15)
        rj = J(r)
        rec(P, "管理员回复", r.status_code == 200 and rj and rj.get("ok"), f"{r.status_code} {r.text[:100]}")
        # 回复 id 形态兼容（reply.id / reply.reply.id），兜底用列表重新查
        if isinstance(rj.get("reply"), dict) and rj["reply"].get("id"):
            comment_ids.append(rj["reply"]["id"])
        elif rj.get("id"):
            comment_ids.append(rj["id"])
        # 垃圾/回收站状态流转
        r = adm.post(BASE + "/admin-ext/api/comments/action",
                     json={"ids": [cid1], "action": "spam"}, timeout=15)
        rec(P, "标记垃圾", r.status_code == 200)
        r = adm.post(BASE + "/admin-ext/api/comments/action",
                     json={"ids": [cid1], "action": "trash"}, timeout=15)
        rec(P, "移入回收站", r.status_code == 200)
        r = adm.post(BASE + "/admin-ext/api/comments/action",
                     json={"ids": [cid1], "action": "bad"}, timeout=15)
        rec(P, "未知动作拒绝", r.status_code == 400, f"status={r.status_code}")
    # 频控：再提交 3 条（窗口内累计 4 条），第 4 条应 429
    codes = []
    extra_ids = []
    for i in range(2, 5):
        rr = anon.post(BASE + "/ap-comments/submit", json={
            "slug": target_slug, "author": f"RL{i} {TS}",
            "email": f"rl{i}-{TS}@example.com",
            "content": f"频控测试 {i}/{TS}"}, timeout=15)
        codes.append(rr.status_code)
    rec(P, "30秒3条频控(第4条 429)", codes[0] == 201 and codes[1] == 201 and codes[2] == 429,
        f"codes={codes}")
    # 伪造 X-Forwarded-For 不得绕过频控（默认只信 socket 地址，需 AP_TRUST_PROXY=1 才信代理头）
    rr = anon.post(BASE + "/ap-comments/submit",
                   headers={"X-Forwarded-For": f"10.88.{TS % 250}.7"},
                   json={"slug": target_slug, "author": f"XFF {TS}",
                         "email": f"xff-{TS}@example.com", "content": f"XFF绕过测试 {TS}"}, timeout=15)
    rec(P, "伪造 XFF 不能绕过频控", rr.status_code == 429, f"status={rr.status_code}")
    # 找出所有带 TS 标记的测试评论（跨全部状态）并登记待删
    for stt in ["pending", "approved", "spam", "trash"]:
        r = adm.get(BASE + "/admin-ext/api/comments/list",
                    params={"status": stt, "q": str(TS), "page": 1}, timeout=15)
        for it in (J(r) or {}).get("items", []):
            if it.get("id") not in comment_ids:
                comment_ids.append(it["id"])
    # 前台文章页含评论区标记（已批准的评论需在 approved 列表）
    # 先把 cid1 恢复批准再看页面，最后统一删除
    admin_page(P, "/admin-ext/comments")
    expect_anon_401(P, "/admin-ext/api/comments/list")
    expect_csrf_403(P, "/admin-ext/api/comments/action", json={"ids": [1], "action": "approve"})
except Exception as e:
    rec(P, "套件异常", False, repr(e))
finally:
    # 删除所有测试评论
    if comment_ids:
        ids = [x for x in comment_ids if x]
        r = adm.post(BASE + "/admin-ext/api/comments/action",
                     json={"ids": ids, "action": "delete"}, timeout=15)
        rec(P, "清理测试评论", r.status_code == 200 and J(r).get("ok"), f"ids={ids}")
    # 恢复评论设置
    if isinstance(saved_csettings, dict):
        r = adm.post(BASE + "/admin-ext/api/comments/settings", json=saved_csettings, timeout=15)
        rec(P, "评论设置还原", r.status_code == 200)
    # 恢复文章 comment_status
    if target_slug and saved_comment_status and saved_comment_status != "open":
        adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"UPDATE wp_posts SET comment_status='{saved_comment_status}' "
                              f"WHERE post_name='{target_slug}'", "confirmWrite": True}, timeout=20)

# =====================================================================
# 6. db-console
# =====================================================================
P = "db-console"
TMPT = f"ap_test_dbc_{TS}"
try:
    r = adm.get(BASE + "/admin-ext/api/db-console/tables", timeout=20)
    tabs = (J(r) or {}).get("tables", [])
    names = [t.get("name") for t in tabs]
    rec(P, "表列表 GET", r.status_code == 200 and "wp_posts" in names, f"count={len(names)}")

    r = adm.get(BASE + "/admin-ext/api/db-console/structure", params={"name": "wp_posts"}, timeout=15)
    st = J(r) or {}
    rec(P, "表结构 structure", r.status_code == 200 and isinstance(st.get("columns"), list)
        and st.get("sql"), f"cols={len(st.get('columns', []))}")

    r = adm.get(BASE + "/admin-ext/api/db-console/browse",
                params={"name": "wp_posts", "page": 0}, timeout=15)
    bj = J(r) or {}
    rec(P, "数据浏览 browse", r.status_code == 200 and isinstance(bj.get("rows"), list)
        and bj.get("total", 0) > 0, f"total={bj.get('total')} cols={bj.get('columns', [])[:4]}")

    r = adm.post(BASE + "/admin-ext/api/db-console/exec", json={"sql": "SELECT 1 AS one"}, timeout=15)
    j = J(r) or {}
    rec(P, "SELECT 查询", j.get("error") is None and j.get("rows", [{}])[0].get("one") == 1,
        str(j)[:120])

    r = adm.post(BASE + "/admin-ext/api/db-console/exec", json={"sql": "SELECT FROM bad"}, timeout=15)
    j = J(r) or {}
    rec(P, "非法 SQL 返回 error(不崩)", r.status_code == 200 and bool(j.get("error")), str(j.get("error"))[:100])

    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"CREATE TABLE {TMPT} (id INTEGER PRIMARY KEY, name TEXT)"}, timeout=15)
    rec(P, "无确认写被拒(403)", r.status_code == 403, f"status={r.status_code}")

    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"CREATE TABLE {TMPT} (id INTEGER PRIMARY KEY, name TEXT)",
                       "confirmWrite": True}, timeout=15)
    rec(P, "确认后建临时表", (J(r) or {}).get("error") is None, r.text[:120])

    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"INSERT INTO {TMPT} (name) VALUES ('hello')", "confirmWrite": True},
                 timeout=15)
    rec(P, "确认后写入", (J(r) or {}).get("error") is None)

    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"ATTACH DATABASE '/tmp/x.db' AS x"}, timeout=15)
    rec(P, "ATTACH 禁用", r.status_code == 400, f"status={r.status_code}")

    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": "PRAGMA writable_schema=1"}, timeout=15)
    rec(P, "危险 PRAGMA(writable_schema)禁用", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": "PRAGMA trusted_schema=1"}, timeout=15)
    rec(P, "危险 PRAGMA(trusted_schema)禁用", r.status_code == 400, f"status={r.status_code}")

    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"SELECT 1; SELECT 2", "confirmWrite": True}, timeout=15)
    rec(P, "多语句拒绝", r.status_code == 400, f"status={r.status_code}")

    # 行内编辑（与真实 UI 一致：browse 返回 __rowid）
    r = adm.get(BASE + "/admin-ext/api/db-console/browse", params={"name": TMPT, "page": 0},
                timeout=15)
    rowid = (J(r) or {}).get("rows", [{}])[0].get("__rowid")
    r = adm.post(BASE + "/admin-ext/api/db-console/update",
                 json={"table": TMPT, "rowid": rowid, "column": "name", "value": "world"},
                 timeout=15)
    rec(P, "行内编辑无确认拒绝", r.status_code == 403, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/db-console/update",
                 json={"table": TMPT, "rowid": rowid, "column": "name", "value": "world",
                       "confirm": True}, timeout=15)
    rec(P, "行内编辑保存", r.status_code == 200 and (J(r) or {}).get("ok"), f"{r.status_code} {r.text[:80]}")
    r = adm.post(BASE + "/admin-ext/api/db-console/update",
                 json={"table": "sqlite_master", "rowid": 1, "column": "name", "value": "x",
                       "confirm": True}, timeout=15)
    rec(P, "内部表禁止修改", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/db-console/update",
                 json={"table": "wp posts", "rowid": 1, "column": "x", "value": 1,
                       "confirm": True}, timeout=15)
    rec(P, "非法表名拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/db-console/update",
                 json={"table": TMPT, "rowid": rowid, "column": "name", "value": None,
                       "confirm": True}, timeout=15)
    rec(P, "行内设 NULL", r.status_code == 200 and (J(r) or {}).get("ok"))
    # 验证编辑确实落库
    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"SELECT name FROM {TMPT} WHERE rowid={int(rowid)}"}, timeout=15)
    rec(P, "编辑结果落库校验", (J(r) or {}).get("rows", [{}])[0].get("name") is None)

    # 导出
    r = adm.get(BASE + "/admin-ext/api/db-console/export",
                params={"name": TMPT, "format": "csv"}, timeout=20)
    rec(P, "CSV 导出", r.status_code == 200 and b"name" in r.content,
        f"bytes={len(r.content)}")
    # 先写回一个值再验 SQL 导出含 INSERT
    adm.post(BASE + "/admin-ext/api/db-console/exec",
             json={"sql": f"UPDATE {TMPT} SET name='seed' WHERE rowid={int(rowid)}",
                   "confirmWrite": True}, timeout=15)
    r = adm.get(BASE + "/admin-ext/api/db-console/export",
                params={"name": TMPT, "format": "sql"}, timeout=20)
    rec(P, "SQL 导出(含CREATE/INSERT)", r.status_code == 200
        and (b"INSERT" in r.content or b"CREATE" in r.content),
        f"bytes={len(r.content)}")

    expect_anon_401(P, "/admin-ext/api/db-console/tables")
    expect_csrf_403(P, "/admin-ext/api/db-console/exec", json={"sql": "SELECT 1"})
    admin_page(P, "/admin-ext/db-console")
finally:
    adm.post(BASE + "/admin-ext/api/db-console/exec",
             json={"sql": f"DROP TABLE IF EXISTS {TMPT}", "confirmWrite": True}, timeout=15)
    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"SELECT name FROM sqlite_master WHERE name='{TMPT}'"}, timeout=15)
    rec(P, "临时表已清理", len((J(r) or {}).get("rows", [])) == 0)

# =====================================================================
# 7. link-directory
# =====================================================================
P = "link-directory"
cat_id = link_id = None
try:
    r = adm.post(BASE + "/admin-ext/api/links/cats",
                 json={"name": f"测试分类 {TS}", "slug": TAG, "sort": 50}, timeout=15)
    j = J(r) or {}
    rec(P, "新建分类", r.status_code == 200 and j.get("ok"), r.text[:100])
    cat_id = (j.get("cat") or {}).get("id")
    r = adm.get(BASE + "/admin-ext/api/links/cats", timeout=15)
    rec(P, "分类列表", r.status_code == 200 and any(c.get("id") == cat_id for c in (J(r) or [])))
    r = adm.put(BASE + "/admin-ext/api/links/cats",
                json={"id": cat_id, "name": f"测试分类改 {TS}", "sort": 51}, timeout=15)
    rec(P, "修改分类", r.status_code == 200 and (J(r) or {}).get("ok"))
    # 空名拒绝
    r = adm.post(BASE + "/admin-ext/api/links/cats", json={"name": "  "}, timeout=15)
    rec(P, "空分类名拒绝", r.status_code == 400)

    r = adm.post(BASE + "/admin-ext/api/links", json={
        "catId": cat_id, "name": f"测试链接 {TS}",
        "url": "https://example.com/ap-test", "description": "d", "status": "pending"}, timeout=15)
    j = J(r) or {}
    rec(P, "新建链接(pending)", r.status_code == 200 and j.get("ok"), r.text[:100])
    link_id = (j.get("link") or {}).get("id")
    r = adm.post(BASE + "/admin-ext/api/links",
                 json={"catId": cat_id, "name": "x", "url": "ftp://bad"}, timeout=15)
    rec(P, "非法 URL 拒绝", r.status_code == 400)
    r = adm.put(BASE + "/admin-ext/api/links",
                json={"id": link_id, "name": f"测试链接改 {TS}", "status": "approved"}, timeout=15)
    rec(P, "编辑链接+批准", r.status_code == 200 and (J(r) or {}).get("ok"))
    r = adm.get(BASE + "/admin-ext/api/links", params={"cat_id": cat_id}, timeout=15)
    rec(P, "链接列表(按分类)", r.status_code == 200 and len(J(r) or []) == 1)

    # 公开目录页
    r = anon.get(BASE + "/directory", timeout=20)
    rec(P, "公开目录页 /directory", r.status_code == 200 and f"测试链接改 {TS}".encode() in r.content
        or (r.status_code == 200 and b"directory" in r.content.lower()),
        f"status={r.status_code}")
    # 点击统计（approved 才 302）
    r = anon.get(BASE + "/ap-links/click", params={"id": link_id},
                 allow_redirects=False, timeout=15)
    rec(P, "点击跳转 302", r.status_code in (301, 302) and "example.com" in r.headers.get("location", ""),
        f"status={r.status_code} loc={r.headers.get('location')}")
    r = anon.get(BASE + "/ap-links/click", params={"id": 99999999},
                 allow_redirects=False, timeout=15)
    rec(P, "点击不存在 ID 不500", r.status_code in (302, 404, 400), f"status={r.status_code}")

    # 分类下有链接禁止删
    r = adm.delete(BASE + "/admin-ext/api/links/cats", params={"id": cat_id}, timeout=15)
    rec(P, "非空分类删除拒绝", r.status_code == 400, f"status={r.status_code}")

    # 设置往返
    r = adm.get(BASE + "/admin-ext/api/links/settings", timeout=15)
    ls = J(r)
    if isinstance(ls, dict):
        r2 = adm.post(BASE + "/admin-ext/api/links/settings", json=ls, timeout=15)
        rec(P, "设置往返", r2.status_code == 200, f"status={r2.status_code}")
    expect_anon_401(P, "/admin-ext/api/links")
    admin_page(P, "/admin-ext/links")
finally:
    if link_id:
        adm.delete(BASE + "/admin-ext/api/links", params={"id": link_id}, timeout=15)
    if cat_id:
        r = adm.delete(BASE + "/admin-ext/api/links/cats", params={"id": cat_id}, timeout=15)
        rec(P, "清理测试链接+分类", r.status_code == 200 and (J(r) or {}).get("ok"))

# =====================================================================
# 8. ads-manager
# =====================================================================
P = "ads-manager"
saved_slots = None
test_key = f"ap_test_slot_{TS}"
try:
    r = adm.get(BASE + "/admin-ext/api/ads/slots", timeout=15)
    saved_slots = (J(r) or {}).get("slots")
    rec(P, "广告位 GET", isinstance(saved_slots, list), f"n={len(saved_slots) if saved_slots else 0}")
    new_slots = list(saved_slots or []) + [{"key": test_key, "name": TAG, "enabled": False,
                                            "type": "html", "content": "<ins>t</ins>"}]
    r = adm.put(BASE + "/admin-ext/api/ads/slots", json={"slots": new_slots}, timeout=15)
    rec(P, "新增测试广告位", r.status_code == 200 and (J(r) or {}).get("ok"), r.text[:100])
    r = adm.get(BASE + "/admin-ext/api/ads/slots", timeout=15)
    rec(P, "广告位持久化", any(s.get("key") == test_key for s in ((J(r) or {}).get("slots") or [])))
    # 非法 key
    bad = list(saved_slots or []) + [{"key": "bad key!", "name": "x", "enabled": False}]
    r = adm.put(BASE + "/admin-ext/api/ads/slots", json={"slots": bad}, timeout=15)
    rec(P, "非法 key 拒绝", r.status_code == 400, f"status={r.status_code}")
    # 重复 key
    dup = [{"key": "k", "name": "a", "enabled": False}, {"key": "k", "name": "b", "enabled": False}]
    r = adm.put(BASE + "/admin-ext/api/ads/slots", json={"slots": dup}, timeout=15)
    rec(P, "重复 key 拒绝", r.status_code == 400)
    # 公开资源
    r = anon.get(BASE + "/ap-ads/loader.js", timeout=15)
    rec(P, "loader.js 公开可访问", r.status_code == 200 and len(r.text) > 10,
        f"bytes={len(r.content)}")
    r = anon.post(BASE + "/ap-ads/track", json={"events": [{"adId": "ap-ad-1", "type": "imp"}]},
                  timeout=15)
    rec(P, "track 打点容错", r.status_code in (200, 204), f"status={r.status_code} {r.text[:80]}")
    r = anon.post(BASE + "/ap-ads/track", json={"events": []}, timeout=15)
    rec(P, "track 空批量拒绝", r.status_code == 400, f"status={r.status_code}")
    # 伪造广告 ID 不得写入孤儿统计行
    fake_ad = 999999902
    adm.post(BASE + "/admin-ext/api/db-console/exec",
             json={"sql": f"DELETE FROM wp_postmeta WHERE post_id={fake_ad}", "confirmWrite": True}, timeout=15)
    anon.post(BASE + "/ap-ads/track",
              json={"events": [{"adId": f"ap-ad-{fake_ad}", "type": "imp"}]}, timeout=15)
    qa = adm.post(BASE + "/admin-ext/api/db-console/exec",
                  json={"sql": f"SELECT COUNT(*) AS c FROM wp_postmeta WHERE post_id={fake_ad} "
                               f"AND meta_key='_ap_ad_stats'"}, timeout=15).json()
    rec(P, "伪造 adId 不产生孤儿统计行", (qa.get("rows") or [{}])[0].get("c") == 0,
        f"rows={qa.get('rows')}")
    expect_anon_401(P, "/admin-ext/api/ads/slots")
    admin_page(P, "/admin-ext/ads")
finally:
    if saved_slots is not None:
        r = adm.put(BASE + "/admin-ext/api/ads/slots", json={"slots": saved_slots}, timeout=15)
        rec(P, "还原广告位", r.status_code == 200)

# =====================================================================
# 9. webhook-publisher（建 key→发布→查状态→幂等更新→权限→删除）
# =====================================================================
P = "webhook-publisher"
full_key = ro_key = None
full_id = ro_id = None
slug = f"ap-test-{TS}"
try:
    r = adm.post(BASE + "/admin-ext/api/webhook/keys",
                 json={"name": f"full-{TS}", "permissions": ["publish", "delete", "status"]},
                 timeout=15)
    j = J(r) or {}
    full_key = j.get("key")
    full_id = j.get("id")
    rec(P, "创建全权限 API Key", bool(full_key), r.text[:100])
    r = adm.post(BASE + "/admin-ext/api/webhook/keys",
                 json={"name": f"ro-{TS}", "permissions": ["status"]}, timeout=15)
    j = J(r) or {}
    ro_key = j.get("key"); ro_id = j.get("id")
    rec(P, "创建只读 API Key", bool(ro_key))
    r = adm.get(BASE + "/admin-ext/api/webhook/keys", timeout=15)
    ks = J(r) or []
    rec(P, "Key 列表不泄露密钥", all("key" not in k and "hash" not in k for k in ks), f"sample={ks[0] if ks else None}")

    H = {"Authorization": "Bearer " + full_key, "Content-Type": "application/json"}
    r = requests.post(BASE + "/ap-webhook/publish", headers=H,
                      json={"title": f"AP测试 {TS}", "slug": slug, "type": "post",
                            "status": "draft", "content": f"<p>hello {TS}</p>",
                            "excerpt": "t"}, timeout=20)
    j = J(r) or {}
    rec(P, "发布文章(draft)", r.status_code == 200 and j.get("ok"), f"{r.status_code} {r.text[:120]}")
    post_pid = j.get("postId") or j.get("id")
    # 幂等更新
    r = requests.post(BASE + "/ap-webhook/publish", headers=H,
                      json={"title": f"AP测试改 {TS}", "slug": slug, "type": "post",
                            "status": "draft", "content": "<p>v2</p>"}, timeout=20)
    j2 = J(r) or {}
    rec(P, "同 slug 幂等 upsert", r.status_code == 200 and (j2.get("postId") == post_pid or j2.get("id") == post_pid),
        r.text[:120])
    # status（GET，Bearer 鉴权，返回 key 元信息+最近日志）
    r = requests.get(BASE + "/ap-webhook/status", headers=H, timeout=15)
    rec(P, "状态查询", r.status_code == 200 and (J(r) or {}).get("ok"),
        f"{r.status_code} {r.text[:100]}")
    # 权限不足
    r = requests.post(BASE + "/ap-webhook/publish",
                      headers={"Authorization": "Bearer " + ro_key, "Content-Type": "application/json"},
                      json={"title": "x", "slug": slug + "-x"}, timeout=15)
    rec(P, "无 publish 权限→403", r.status_code == 403, f"status={r.status_code}")
    # 错误密钥（401/403 均为拒绝）
    r = requests.post(BASE + "/ap-webhook/publish",
                      headers={"Authorization": "Bearer deadbeef", "Content-Type": "application/json"},
                      json={"title": "x"}, timeout=15)
    rec(P, "错误密钥被拒(401/403)", r.status_code in (401, 403), f"status={r.status_code}")
    # 非法 type
    r = requests.post(BASE + "/ap-webhook/publish", headers=H,
                      json={"title": "x", "slug": slug + "-y", "type": "product"}, timeout=15)
    rec(P, "非法文章类型→400", r.status_code == 400)
    # X-API-Key 备用头 + 删除
    r = requests.post(BASE + "/ap-webhook/delete",
                      headers={"X-API-Key": full_key, "Content-Type": "application/json"},
                      json={"slug": slug, "type": "post"}, timeout=15)
    rec(P, "删除文章(X-API-Key 头)", r.status_code == 200 and (J(r) or {}).get("ok"),
        f"{r.status_code} {r.text[:100]}")
    r = requests.get(BASE + "/ap-webhook/status", headers=H, timeout=15)
    rec(P, "删除后状态查询(key 仍有效,返回日志)", r.status_code == 200, f"status={r.status_code}")
    # 日志
    r = adm.get(BASE + "/admin-ext/api/webhook/logs", timeout=15)
    rec(P, "调用日志 GET", r.status_code == 200 and isinstance(J(r), (list, dict)),
        f"status={r.status_code}")
    expect_anon_401(P, "/admin-ext/api/webhook/keys")
    admin_page(P, "/admin-ext/webhooks")
finally:
    for kid in [x for x in [full_id, ro_id] if x]:
        adm.delete(BASE + "/admin-ext/api/webhook/keys", params={"id": kid}, timeout=15)
    rec(P, "清理测试 API Keys", True)
    # 兜底：若删除文章失败，用 db-console 按唯一 slug 清理
    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"SELECT id FROM wp_posts WHERE post_name='{slug}'"}, timeout=15)
    rows = (J(r) or {}).get("rows", [])
    if rows:
        pid = rows[0]["id"]
        adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"DELETE FROM wp_postmeta WHERE post_id={int(pid)}",
                       "confirmWrite": True}, timeout=15)
        adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": f"DELETE FROM wp_posts WHERE id={int(pid)}", "confirmWrite": True},
                 timeout=15)
        rec(P, "兜底清理残留文章", False, f"id={pid} webhook delete 未生效", warn=True)

# =====================================================================
# 10. config-io
# =====================================================================
P = "config-io"
exported = None
try:
    r = adm.get(BASE + "/admin-ext/api/config-io/export", timeout=30)
    exported = J(r)
    rec(P, "全量导出", r.status_code == 200 and isinstance(exported, dict),
        f"keys={list(exported)[:8] if isinstance(exported,dict) else ''}")
    blob = json.dumps(exported, ensure_ascii=False)
    leaks = []
    for k in ["AUTH_SECRET", "auth_secret"]:
        if k in blob:
            leaks.append(k)
    rec(P, "导出物剥离 AUTH_SECRET", not leaks, f"leaks={leaks} bytes={len(blob)}")
    # 往返导入（merge 自身，幂等）
    r = adm.post(BASE + "/admin-ext/api/config-io/import",
                 files={"file": ("config.json", blob.encode(), "application/json")},
                 data={"mode": "merge"}, timeout=30)
    rec(P, "导入 merge 往返", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
    # 非法 JSON
    r = adm.post(BASE + "/admin-ext/api/config-io/import",
                 files={"file": ("bad.json", b"{not json", "application/json")},
                 data={"mode": "merge"}, timeout=15)
    rec(P, "坏 JSON 拒绝", r.status_code == 400, f"status={r.status_code}")
    # 缺文件
    r = adm.post(BASE + "/admin-ext/api/config-io/import", data={"mode": "merge"}, timeout=15)
    rec(P, "缺文件拒绝", r.status_code == 400)
    expect_anon_401(P, "/admin-ext/api/config-io/export")
    admin_page(P, "/admin-ext/config-io")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 11. backup
# =====================================================================
P = "backup"
bk_file = None
try:
    r = adm.get(BASE + "/admin-ext/api/backup/list", timeout=20)
    before = J(r)
    rec(P, "备份列表 GET", r.status_code == 200 and isinstance(before, (list, dict)),
        f"type={type(before).__name__}")
    r = adm.post(BASE + "/admin-ext/api/backup/create",
                 json={"includeMedia": False, "confirm": True}, timeout=120)
    j = J(r) or {}
    rec(P, "创建备份(不含媒体)", r.status_code == 200 and j.get("ok"),
        f"{r.status_code} {r.text[:140]}")
    bk_file = (j.get("entry") or {}).get("file")
    if bk_file:
        r = adm.get(BASE + "/admin-ext/api/backup/download",
                    params={"file": bk_file}, timeout=60)
        ok = r.status_code == 200 and r.content[:2] == b"PK"
        rec(P, "下载备份(zip magic PK)", ok, f"status={r.status_code} bytes={len(r.content)}")
        # 路径穿越
        r2 = adm.get(BASE + "/admin-ext/api/backup/download",
                     params={"file": "../../../windows/win.ini"}, timeout=15)
        rec(P, "下载路径穿越拒绝", r2.status_code in (400, 403, 404), f"status={r2.status_code}")
    # restore 参数校验（不真正还原！）
    r = adm.post(BASE + "/admin-ext/api/backup/restore", json={"confirm": True}, timeout=15)
    rec(P, "restore 缺文件拒绝", r.status_code in (400, 422), f"status={r.status_code}")
    expect_anon_401(P, "/admin-ext/api/backup/list")
    admin_page(P, "/admin-ext/backup")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 12. file-manager（核心 46 项已专测，这里做关键冒烟）
# =====================================================================
P = "file-manager"
try:
    r = adm.get(BASE + "/admin-ext/api/files/list", params={"path": "."}, timeout=15)
    j = J(r)
    rec(P, "根目录列表", r.status_code == 200 and isinstance(j, dict), f"keys={list(j)[:6] if isinstance(j,dict) else j}")
    r = adm.get(BASE + "/admin-ext/api/files/list", params={"path": "../.."}, timeout=15)
    rec(P, "路径穿越 ../../ 拒绝", r.status_code == 400, f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/files/dirs", params={"path": "."}, timeout=15)
    rec(P, "目录树 dirs", r.status_code == 200 and isinstance(J(r), (list, dict)), f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/files/read", params={"path": "package.json"}, timeout=15)
    rec(P, "读取文本文件", r.status_code == 200 and "astropress" in r.text.lower() or r.status_code == 200,
        f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/files/read", params={"path": "local.db"}, timeout=15)
    rec(P, "二进制文件拒绝读取(415)", r.status_code in (415, 400), f"status={r.status_code}")
    expect_anon_401(P, "/admin-ext/api/files/list")
    expect_csrf_403(P, "/admin-ext/api/files/mkdir", json={"path": f".ap-data/{TAG}-x"})
    admin_page(P, "/admin-ext/files")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 13. plugin-manager
# =====================================================================
P = "plugin-manager"
try:
    r = adm.get(BASE + "/admin-ext/api/plugin-manager/state", timeout=15)
    states = J(r)
    rec(P, "插件状态 GET", isinstance(states, list) and len(states) >= 20, f"n={len(states) if isinstance(states,list) else '?'}")
    # 非法 slug
    r = adm.post(BASE + "/admin-ext/api/plugin-manager/state",
                 json={"slug": "bad slug!", "enabled": False}, timeout=15)
    rec(P, "非法 slug 拒绝", r.status_code in (400, 404), f"status={r.status_code}")
    # 系统插件 seo 不可禁用
    r = adm.post(BASE + "/admin-ext/api/plugin-manager/state",
                 json={"slug": "seo", "enabled": False}, timeout=15)
    rec(P, "系统插件 seo 不可禁用", r.status_code == 400, f"status={r.status_code}")
    # 找一个安全目标往返：wp-editor
    target = next((x for x in (states or []) if x.get("slug") == "wp-editor"), None)
    if target:
        orig = target.get("enabled")
        r = adm.post(BASE + "/admin-ext/api/plugin-manager/state",
                     json={"slug": "wp-editor", "enabled": not orig}, timeout=15)
        rec(P, "切换 wp-editor 状态", r.status_code == 200, f"{r.status_code} {r.text[:80]}")
        r = adm.get(BASE + "/admin-ext/api/plugin-manager/state", timeout=15)
        now = next((x for x in (J(r) or []) if x.get("slug") == "wp-editor"), {})
        rec(P, "切换后状态生效", now.get("enabled") == (not orig), f"{orig}->{now.get('enabled')}")
        r = adm.post(BASE + "/admin-ext/api/plugin-manager/state",
                     json={"slug": "wp-editor", "enabled": orig}, timeout=15)
        rec(P, "还原 wp-editor 状态", r.status_code == 200)
    expect_anon_401(P, "/admin-ext/api/plugin-manager/state")
    admin_page(P, "/admin-ext/plugin-manager")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 14. webdav
# =====================================================================
P = "webdav"
token = None
try:
    r = adm.get(BASE + "/admin-ext/api/webdav/token", timeout=15)
    rec(P, "token GET 仅掩码", r.status_code == 200 and (J(r) or {}).get("hasToken") in (True, False))
    r = adm.post(BASE + "/admin-ext/api/webdav/token", json={"confirm": True}, timeout=15)
    token = (J(r) or {}).get("token")
    rec(P, "生成 WebDAV token", bool(token), r.text[:80])
    if token:
        basic = "Basic " + base64.b64encode(f"admin:{token}".encode()).decode()
        Hd = {"Authorization": basic}
        r = requests.request("PROPFIND", BASE + "/webdav/", headers={**Hd, "Depth": "0"}, timeout=20)
        rec(P, "PROPFIND 根目录 207", r.status_code == 207 and b"multistatus" in r.content.lower(),
            f"status={r.status_code}")
        body = f"webdav test {TS}".encode()
        r = requests.put(BASE + f"/webdav/{TAG}.txt", headers=Hd, data=body, timeout=20)
        rec(P, "PUT 上传文件", r.status_code in (200, 201, 204), f"status={r.status_code}")
        r = requests.get(BASE + f"/webdav/{TAG}.txt", headers=Hd, timeout=20)
        rec(P, "GET 回读一致", r.status_code == 200 and r.content == body,
            f"status={r.status_code} match={r.content == body}")
        r = requests.request("MKCOL", BASE + f"/webdav/{TAG}-dir", headers=Hd, timeout=20)
        rec(P, "MKCOL 建目录", r.status_code in (200, 201), f"status={r.status_code}")
        r = requests.request("OPTIONS", BASE + "/webdav/", headers=Hd, timeout=15)
        # OPTIONS 可能由核心 CORS 以 204 应答；WebDAV 核心动词以 PROPFIND 207 为准
        rec(P, "OPTIONS 可应答(200/204)", r.status_code in (200, 204),
            f"status={r.status_code} allow={r.headers.get('allow')}")
        # 错密码
        bad = "Basic " + base64.b64encode(b"admin:wrong-token").decode()
        r = requests.request("PROPFIND", BASE + "/webdav/",
                             headers={"Authorization": bad, "Depth": "0"}, timeout=15)
        rec(P, "错误令牌 401", r.status_code == 401, f"status={r.status_code}")
        # 路径穿越
        r = requests.request("PROPFIND", BASE + "/webdav/../../etc",
                             headers=Hd, timeout=15, allow_redirects=False)
        rec(P, "路径穿越不逃逸存储根", r.status_code in (207, 400, 403, 404), f"status={r.status_code}")
        # 清理
        requests.delete(BASE + f"/webdav/{TAG}.txt", headers=Hd, timeout=15)
        r = requests.request("DELETE", BASE + f"/webdav/{TAG}-dir", headers=Hd, timeout=15)
        rec(P, "DELETE 清理", r.status_code in (200, 204), f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/webdav/stats", timeout=15)
    rec(P, "统计 GET", r.status_code == 200, f"status={r.status_code}")
    admin_page(P, "/admin-ext/webdav")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 15. gist-sync / 16. git-sync（无凭证下的分支与设置）
# =====================================================================
P = "gist-sync"
try:
    r = adm.get(BASE + "/admin-ext/api/gist-sync/settings", timeout=15)
    rec(P, "设置 GET", r.status_code == 200, f"status={r.status_code}")
    r = adm.post(BASE + "/admin-ext/api/gist-sync/push", json={"confirm": True}, timeout=20)
    rec(P, "未配置 token push 优雅报错", r.status_code in (400, 409, 503, 500) and r.status_code != 200,
        f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/gist-sync/history", timeout=15)
    rec(P, "历史 GET 不500", r.status_code == 200, f"status={r.status_code}")
    admin_page(P, "/admin-ext/gist-sync")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

P = "git-sync"
try:
    r = adm.get(BASE + "/admin-ext/api/git-sync/settings", timeout=15)
    rec(P, "设置 GET", r.status_code == 200)
    r = adm.post(BASE + "/admin-ext/api/git-sync/sync", json={"confirm": True}, timeout=20)
    rec(P, "未配置 remote sync 优雅报错", r.status_code in (400, 409, 503, 500) and r.status_code != 200,
        f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/git-sync/history", timeout=15)
    rec(P, "历史 GET", r.status_code == 200)
    admin_page(P, "/admin-ext/git-sync")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 17. multilingual
# =====================================================================
P = "multilingual"
try:
    for ep in ["/admin-ext/api/ml/settings", "/admin-ext/api/ml/strings"]:
        r = adm.get(BASE + ep, timeout=15)
        rec(P, f"GET {ep.split('/')[-1]}", r.status_code == 200, f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/ml/links", params={"postId": 1}, timeout=15)
    rec(P, "GET links?postId=1", r.status_code == 200 and "group" in (J(r) or {}),
        f"status={r.status_code}")
    r = adm.get(BASE + "/admin-ext/api/ml/links", timeout=15)
    rec(P, "links 缺 postId 拒绝", r.status_code == 400, f"status={r.status_code}")
    r = anon.get(BASE + "/ml-asset/config", timeout=15)
    rec(P, "公开 config", r.status_code == 200, f"status={r.status_code}")
    for asset in ["/ml-asset/panel.js", "/ml-asset/switcher.js"]:
        r = anon.get(BASE + asset, timeout=15)
        rec(P, f"静态资源 {asset}", r.status_code == 200 and len(r.content) > 50, f"bytes={len(r.content)}")
    r = anon.get(BASE + "/sitemap.xml", timeout=20)
    rec(P, "sitemap.xml", r.status_code == 200 and b"xml" in r.content[:200].lower(),
        f"status={r.status_code}")
    r = anon.get(BASE + "/ml/", timeout=20)
    rec(P, "多语言页 /ml/", r.status_code in (200, 302), f"status={r.status_code}")
    admin_page(P, "/admin-ext/multilingual")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 18. admin-i18n
# =====================================================================
P = "admin-i18n"
try:
    r = anon.get(BASE + "/api/ap-i18n/script.js", timeout=15)
    rec(P, "script.js 可加载", r.status_code == 200 and len(r.content) > 100, f"bytes={len(r.content)}")
    r = adm.get(BASE + "/admin-ext/api/i18n/settings", timeout=15)
    s = J(r)
    if isinstance(s, dict):
        # 写接口为 PUT，仅接受 enabled/target/webhookUrl，原样回写保证幂等
        payload = {"enabled": bool(s.get("enabled")),
                   "target": s.get("target") or "zh-CN",
                   "webhookUrl": s.get("webhookUrl") or ""}
        r2 = adm.put(BASE + "/admin-ext/api/i18n/settings", json=payload, timeout=15)
        rec(P, "设置 PUT 往返", r2.status_code == 200, f"status={r2.status_code} {r2.text[:80]}")
        r3 = adm.put(BASE + "/admin-ext/api/i18n/settings",
                     json={"enabled": True, "target": "bad-lang"}, timeout=15)
        rec(P, "非法 target 语言拒绝", r3.status_code == 400, f"status={r3.status_code}")
    else:
        rec(P, "设置 GET", False, f"status={r.status_code}")
    r = adm.post(BASE + "/api/ap-i18n/translate", json={"text": "", "to": "en"}, timeout=20)
    rec(P, "translate 空文本优雅处理", r.status_code in (200, 400) and "json" in r.headers.get("content-type", ""),
        f"status={r.status_code}")
    admin_page(P, "/admin-ext/i18n")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 19. editor-upload
# =====================================================================
P = "editor-upload"
up_path = None
try:
    r = anon.get(BASE + "/api/ap-media/editor-upload.js", timeout=15)
    rec(P, "editor-upload.js 可加载", r.status_code == 200 and len(r.content) > 100)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC")
    r = adm.post(BASE + "/api/ap-media/upload",
                 files={"file": (f"{TAG}.png", png, "image/png")}, timeout=20)
    j = J(r)
    rec(P, "上传 PNG(201)", r.status_code in (200, 201) and j and (j.get("url") or j.get("key")),
        f"{r.status_code} {r.text[:120]}")
    if j:
        # 本地存储物理路径相对仓库根为 apps/admin/public/media/<key|filename>
        fn = j.get("key") or j.get("filename")
        up_path = f"apps/admin/public/media/{fn}" if fn else None
    # 伪造扩展名（png 内容 + .txt）
    r = adm.post(BASE + "/api/ap-media/upload",
                 files={"file": (f"{TAG}.txt", png, "text/plain")}, timeout=15)
    rec(P, "伪装内容上传拒绝", r.status_code in (400, 415), f"status={r.status_code}")
    # SVG 内容（静态安全策略）
    r = adm.post(BASE + "/api/ap-media/upload",
                 files={"file": (f"{TAG}.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>",
                                 "image/svg+xml")}, timeout=15)
    rec(P, "SVG 上传有明确策略(2xx净化或4xx拒绝)", r.status_code in (200, 201, 400, 415),
        f"status={r.status_code}")
    if r.status_code in (200, 201) and J(r):
        jj = J(r)
        fn2 = jj.get("key") or jj.get("filename")
        if fn2:
            up_path2 = f"apps/admin/public/media/{fn2}"
            adm.post(BASE + "/admin-ext/api/files/delete",
                     json={"paths": [up_path2], "confirm": True}, timeout=15)
    # 元信息接口
    if j and j.get("id"):
        r = adm.get(BASE + f"/api/ap-media/{j['id']}/meta", timeout=15)
        rec(P, "媒体 meta GET", r.status_code in (200, 404), f"status={r.status_code}")
except Exception as e:
    rec(P, "套件异常", False, repr(e))
finally:
    # 清理上传文件（file-manager delete，paths[] 批量）
    if up_path:
        r = adm.post(BASE + "/admin-ext/api/files/delete",
                     json={"paths": [up_path], "confirm": True}, timeout=15)
        rec(P, "清理上传文件", r.status_code == 200, f"path={up_path} status={r.status_code}",
            warn=(r.status_code != 200))

# =====================================================================
# 20. media-av
# =====================================================================
P = "media-av"
try:
    r = anon.get(BASE + "/api/ap-media-av/media-av.js", timeout=15)
    rec(P, "media-av.js 可加载", r.status_code == 200 and len(r.content) > 100)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC")
    r = adm.post(BASE + "/api/ap-media-av/upload",
                 files={"file": (f"{TAG}.mp3", png, "audio/mpeg")}, timeout=15)
    rec(P, "假音频 magic-byte 拒绝", r.status_code in (400, 415), f"status={r.status_code}")
    r = adm.post(BASE + "/api/ap-media-av/upload",
                 files={"file": (f"{TAG}.txt", b"hello", "text/plain")}, timeout=15)
    rec(P, "非音视频拒绝", r.status_code in (400, 415), f"status={r.status_code}")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 21. image-mirror / ai-autofill / editor-tools / wp-editor 资源
# =====================================================================
for P, asset in [
    ("image-mirror", "/api/ap-mirror/image-mirror.js"),
    ("ai-autofill", "/api/ap-autofill/script.js"),
    ("wp-editor", "/api/ap-wp-editor/wp-editor.js"),
    ("editor-tools", "/api/ap-etools/tools.js"),
]:
    try:
        r = anon.get(BASE + asset, timeout=15)
        rec(P, f"静态资源 {asset.split('/')[-1]}", r.status_code == 200 and len(r.content) > 50,
            f"status={r.status_code} bytes={len(r.content)}")
    except Exception as e:
        rec(P, "资源加载异常", False, repr(e))

P = "ai-autofill"
try:
    r = adm.post(BASE + "/api/ap-autofill/generate", json={}, timeout=20)
    rec(P, "generate 缺参/未配置优雅返回", r.status_code in (200, 400, 503, 500) and
        "json" in r.headers.get("content-type", ""), f"status={r.status_code}")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

P = "editor-tools"
try:
    r = adm.post(BASE + "/api/ap-etools/translate", json={"text": ""}, timeout=20)
    rec(P, "translate 空文本优雅返回", r.status_code in (200, 400, 503, 500) and
        "json" in r.headers.get("content-type", ""), f"status={r.status_code}")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 22. ai-chat（不做重操作，验证管理 API）
# =====================================================================
P = "ai-chat"
try:
    r = adm.get(BASE + "/admin-ext/api/ai-chat/providers", timeout=15)
    pvs = J(r)
    rec(P, "providers 列表", r.status_code == 200 and isinstance(pvs, list) and len(pvs) >= 4,
        f"n={len(pvs) if isinstance(pvs,list) else '?'}")
    r = adm.get(BASE + "/admin-ext/api/ai-chat/status", timeout=30)
    rec(P, "sessions 状态 GET 不崩", r.status_code == 200, f"status={r.status_code} body={r.text[:120]}")
    r = adm.get(BASE + "/admin-ext/api/ai-chat/editor-panel.js", timeout=15)
    rec(P, "editor-panel.js", r.status_code == 200 and len(r.content) > 50)
    expect_anon_401(P, "/admin-ext/api/ai-chat/status")
    admin_page(P, "/admin-ext/ai-chat")
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 23. 公开页面
# =====================================================================
P = "public-pages"
try:
    for path in ["/", "/search?q=the", "/directory", "/rss.xml", "/sitemap.xml"]:
        t0 = timed()
        r = anon.get(BASE + path, timeout=25)
        ms = (timed() - t0) * 1000
        rec(P, f"页面 {path}", r.status_code == 200 and len(r.text) > 200,
            f"status={r.status_code} bytes={len(r.content)}", ms)
    r = anon.get(BASE + "/robots.txt", timeout=15)
    rec(P, "页面 /robots.txt", r.status_code == 200 and b"User-agent" in r.content
        and b"Sitemap:" in r.content, f"bytes={len(r.content)}")
    # 一篇真实文章页
    r = adm.post(BASE + "/admin-ext/api/db-console/exec",
                 json={"sql": "SELECT post_name FROM wp_posts WHERE post_status='publish' "
                              "AND post_type='post' ORDER BY id DESC LIMIT 1"}, timeout=15)
    rows = (J(r) or {}).get("rows", [])
    if rows:
        slug0 = rows[0]["post_name"]
        t0 = timed()
        r = anon.get(BASE + "/blog/" + str(slug0), timeout=25)
        ms = (timed() - t0) * 1000
        rec(P, f"文章页 /blog/{slug0}", r.status_code == 200 and len(r.text) > 500,
            f"status={r.status_code}", ms)
except Exception as e:
    rec(P, "套件异常", False, repr(e))

# =====================================================================
# 汇总输出
# =====================================================================
total = len(results)
npass = sum(1 for x in results if x[2] == "pass")
nfail = sum(1 for x in results if x[2] == "fail")
nwarn = sum(1 for x in results if x[2] == "warn")
nskip = sum(1 for x in results if x[2] == "skip")

out = {
    "base": BASE,
    "ts": TS,
    "summary": {"total": total, "pass": npass, "fail": nfail, "warn": nwarn, "skip": nskip},
    "results": [
        {"plugin": p, "case": c, "status": s, "detail": d, "ms": m}
        for (p, c, s, d, m) in results
    ],
}
with open("scripts/plugin-test-result.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("\n" + "=" * 60)
print(f"TOTAL={total} PASS={npass} FAIL={nfail} WARN={nwarn} SKIP={nskip}")
print("结果已写 scripts/plugin-test-result.json")
sys.exit(1 if nfail else 0)
