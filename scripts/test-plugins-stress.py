# -*- coding: utf-8 -*-
"""
深度压力/边界测试：
- 并发计数完整性（related track 原子加、ads track 互斥锁不产生重复行）
- 评论频控并发
- 插件状态并发切换
- 重定向快速 CRUD
- 文件并发建同名目录
- 全部写端点畸形 JSON（400 而不 500）
- 超长输入边界
- 100 并发混合请求稳定性
所有写操作均用临时标识并清理。
"""
import os
import json, time, sys, concurrent.futures as cf
import requests

BASE = "http://localhost:4321"
TS = int(time.time())
res = []
def rec(case, ok, detail=""):
    res.append((case, "pass" if ok else "fail", str(detail)[:300]))
    print(("[PASS] " if ok else "[FAIL] ") + case + (f" -- {detail}" if detail and not ok else ""))

s = requests.Session()
s.headers.update({"Origin": BASE, "Referer": BASE + "/admin/dashboard"})
s.post(BASE + "/api/auth/login", data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")},
       allow_redirects=False)
an = requests.Session()

def ex(sql, cw=False):
    b = {"sql": sql}
    if cw: b["confirmWrite"] = True
    return s.post(BASE + "/admin-ext/api/db-console/exec", json=b, timeout=30).json()

# 取一篇真实文章 ID/slug
row = ex("SELECT ID, post_name, comment_status FROM wp_posts WHERE post_status='publish' "
         "AND post_type='post' ORDER BY ID DESC LIMIT 1")["rows"][0]
PID = row["ID"]; SLUG = row["post_name"]; SAVED_CS = row["comment_status"]

# ---------- 1. related track 原子计数 ----------
try:
    r0 = ex(f"SELECT meta_value FROM wp_postmeta WHERE post_id={PID} AND meta_key='_ap_view_count'")
    before = int(r0["rows"][0]["meta_value"]) if r0["rows"] else 0
    def hit(_):
        return an.get(BASE + "/ap-related/track", params={"post": PID}, timeout=20).status_code
    with cf.ThreadPoolExecutor(20) as tp:
        codes = list(tp.map(hit, range(30)))
    time.sleep(0.5)
    r1 = ex(f"SELECT meta_value FROM wp_postmeta WHERE post_id={PID} AND meta_key='_ap_view_count'")
    after = int(r1["rows"][0]["meta_value"]) if r1["rows"] else 0
    rec("related track 30 并发精确 +30", all(c == 200 for c in codes) and after - before == 30,
        f"before={before} after={after} delta={after-before}")
    # 还原
    if r0["rows"]:
        ex(f"UPDATE wp_postmeta SET meta_value='{before}' WHERE post_id={PID} "
           f"AND meta_key='_ap_view_count'", True)
    else:
        ex(f"DELETE FROM wp_postmeta WHERE post_id={PID} AND meta_key='_ap_view_count'", True)
except Exception as e:
    rec("related track 并发", False, repr(e))

# ---------- 2. ads track 互斥锁：无重复 meta 行 ----------
# 注意：打点端点只对真实存在的 ap_ad 生效（伪造/非广告 ID 静默丢弃），
# 因此必须选一篇已发布的 ap_ad 作为夹具，而不能拿普通文章 ID 冒充。
try:
    adrows = ex("SELECT ID FROM wp_posts WHERE post_type='ap_ad' AND post_status='publish' "
                "ORDER BY ID LIMIT 1")["rows"]
    if not adrows:
        rec("ads track 20 并发仅 1 行且计数=20", True, "SKIP: 无已发布 ap_ad 夹具")
    else:
        APID = adrows[0]["ID"]
        prev = ex(f"SELECT meta_value FROM wp_postmeta WHERE post_id={APID} "
                  f"AND meta_key='_ap_ad_stats'")["rows"]
        prev_val = prev[0]["meta_value"] if prev else None
        def imp_of(v):
            return sum(x.get("imp", 0) for x in json.loads(v).values()) if v else 0
        before = imp_of(prev_val)
        if prev_val is None:
            ex(f"DELETE FROM wp_postmeta WHERE post_id={APID} AND meta_key='_ap_ad_stats'", True)
        def adhit(_):
            return an.post(BASE + "/ap-ads/track",
                           json={"events": [{"adId": f"ap-ad-{APID}", "type": "imp"}]}, timeout=20).status_code
        with cf.ThreadPoolExecutor(15) as tp:
            codes = list(tp.map(adhit, range(20)))
        time.sleep(0.5)
        rows_n = ex(f"SELECT COUNT(*) AS c FROM wp_postmeta WHERE post_id={APID} "
                    f"AND meta_key='_ap_ad_stats'")["rows"][0]["c"]
        val = ex(f"SELECT meta_value FROM wp_postmeta WHERE post_id={APID} "
                 f"AND meta_key='_ap_ad_stats'")["rows"][0]["meta_value"]
        imp_total = imp_of(val)
        rec("ads track 20 并发仅 1 行且计数=20",
            all(c in (200, 204) for c in codes) and rows_n == 1 and imp_total - before == 20,
            f"rows={rows_n} delta={imp_total - before} codes={set(codes)}")
        # 还原统计
        if prev_val is not None:
            safe = prev_val.replace("'", "''")
            ex(f"UPDATE wp_postmeta SET meta_value='{safe}' WHERE post_id={APID} "
               f"AND meta_key='_ap_ad_stats'", True)
        else:
            ex(f"DELETE FROM wp_postmeta WHERE post_id={APID} AND meta_key='_ap_ad_stats'", True)
except Exception as e:
    rec("ads track 并发", False, repr(e))

# ---------- 3. 评论频控并发 ----------
try:
    ex(f"UPDATE wp_posts SET comment_status='open' WHERE ID={PID}", True)
    cs = s.get(BASE + "/admin-ext/api/comments/settings").json()
    s.post(BASE + "/admin-ext/api/comments/settings",
           json={**cs, "enabled": True, "autoApprove": False})
    def submit(i):
        return an.post(BASE + "/ap-comments/submit", json={
            "slug": SLUG, "author": f"ST{TS}-{i}", "email": f"st{TS}-{i}@e.com",
            "content": f"stress {TS} {i}"}, timeout=20).status_code
    with cf.ThreadPoolExecutor(10) as tp:
        codes = list(tp.map(submit, range(10)))
    ok201 = codes.count(201)
    blocked = all(c in (201, 429) for c in codes)
    rec("评论 10 并发：≤3 入库其余 429", blocked and ok201 <= 3, f"201={ok201} codes={sorted(codes)}")
    # 清理
    ids = []
    for stt in ["pending", "approved", "spam", "trash"]:
        j = s.get(BASE + "/admin-ext/api/comments/list",
                  params={"status": stt, "q": f"ST{TS}", "page": 1}).json()
        ids += [it["id"] for it in j.get("items", [])]
    if ids:
        s.post(BASE + "/admin-ext/api/comments/action",
               json={"ids": ids, "action": "delete"})
    s.post(BASE + "/admin-ext/api/comments/settings", json=cs)
    ex(f"UPDATE wp_posts SET comment_status='{SAVED_CS}' WHERE ID={PID}", True)
except Exception as e:
    rec("评论频控并发", False, repr(e))

# ---------- 4. plugin-manager 并发切换 ----------
try:
    st0 = s.get(BASE + "/admin-ext/api/plugin-manager/state").json()
    orig = next(x["enabled"] for x in st0 if x["slug"] == "wp-editor")
    def toggle(i):
        return s.post(BASE + "/admin-ext/api/plugin-manager/state",
                      json={"slug": "wp-editor", "enabled": bool(i % 2)}, timeout=20).status_code
    with cf.ThreadPoolExecutor(10) as tp:
        codes = list(tp.map(toggle, range(10)))
    final = next(x["enabled"] for x in
                 s.get(BASE + "/admin-ext/api/plugin-manager/state").json() if x["slug"] == "wp-editor")
    rec("插件状态 10 并发无 5xx 且终态一致", all(c == 200 for c in codes) and isinstance(final, bool),
        f"codes={set(codes)} final={final}")
    s.post(BASE + "/admin-ext/api/plugin-manager/state",
           json={"slug": "wp-editor", "enabled": orig})
except Exception as e:
    rec("插件状态并发", False, repr(e))

# ---------- 5. 重定向快速 CRUD ----------
try:
    ids = []
    for i in range(5):
        r = s.post(BASE + "/admin-ext/api/redirects",
                   json={"from": f"/stress-{TS}-{i}", "to": "https://example.com", "type": 301},
                   timeout=20)
        if r.status_code == 200:
            ids.append(r.json()["rule"]["id"])
    lst = s.get(BASE + "/admin-ext/api/redirects").json()
    have = sum(1 for x in lst if x["id"] in ids)
    for i in ids:
        s.delete(BASE + "/admin-ext/api/redirects", params={"id": i}, timeout=20)
    rec("重定向快速建 5 删 5", len(ids) == 5 and have == 5, f"created={len(ids)} listed={have}")
except Exception as e:
    rec("重定向 CRUD 压力", False, repr(e))

# ---------- 6. 文件并发建同名目录 ----------
try:
    dpath = f".ap-data/stress-{TS}"
    def mk(_):
        return s.post(BASE + "/admin-ext/api/files/mkdir",
                      json={"path": dpath, "confirm": True}, timeout=20).status_code
    with cf.ThreadPoolExecutor(8) as tp:
        codes = list(tp.map(mk, range(8)))
    wins = codes.count(200)
    graceful = all(c in (200, 400, 409) for c in codes)
    rec("并发建同名目录：唯一成功无5xx", graceful and wins == 1, f"codes={sorted(codes)}")
    s.post(BASE + "/admin-ext/api/files/delete",
           json={"paths": [dpath], "confirm": True}, timeout=20)
except Exception as e:
    rec("文件并发建目录", False, repr(e))

# ---------- 7. 全部写端点畸形 JSON ----------
WRITE_EPS = [
    "/admin-ext/api/redirects",
    "/admin-ext/api/comments/action",
    "/admin-ext/api/comments/reply",
    "/admin-ext/api/comments/settings",
    "/admin-ext/api/db-console/exec",
    "/admin-ext/api/db-console/update",
    "/admin-ext/api/links",
    "/admin-ext/api/links/cats",
    "/admin-ext/api/ads/slots",
    "/admin-ext/api/webhook/keys",
    "/admin-ext/api/plugin-manager/state",
    "/admin-ext/api/files/mkdir",
    "/admin-ext/api/files/write",
    "/admin-ext/api/files/copy",
    "/admin-ext/api/backup/create",
    "/admin-ext/api/seo-tools/settings",
    "/admin-ext/api/search/settings",
    "/admin-ext/api/related-posts/settings",
]
bad = 0
for ep in WRITE_EPS:
    try:
        r = s.post(BASE + ep, data="{oops,,not json",
                   headers={"Content-Type": "application/json"}, timeout=20)
        if r.status_code not in (400, 401, 403, 404):
            rec(f"畸形 JSON {ep}", False, f"status={r.status_code}")
            bad += 1
    except Exception as e:
        rec(f"畸形 JSON {ep}", False, repr(e)); bad += 1
rec(f"全部 {len(WRITE_EPS)} 个写端点畸形 JSON 不 5xx", bad == 0, f"{len(WRITE_EPS)-bad}/{len(WRITE_EPS)}")

# ---------- 8. 超长/边界输入 ----------
# 搜索超长 q 不崩
r = an.get(BASE + "/search", params={"q": "a" * 10000}, timeout=30)
rec("搜索 q=10000 字符不 5xx", r.status_code in (200, 400), f"status={r.status_code}")
# 重定向超长 from 拒绝
r = s.post(BASE + "/admin-ext/api/redirects",
           json={"from": "/" + "a" * 10000, "to": "/x", "type": 301}, timeout=20)
rec("重定向超长 from 拒绝", r.status_code in (400, 414), f"status={r.status_code}")
# 评论超长 content 拒绝
r = an.post(BASE + "/ap-comments/submit", json={
    "slug": SLUG, "author": "x", "email": "x@x.com", "content": "a" * 5000}, timeout=20)
rec("评论超长 content 拒绝", r.status_code in (400, 429), f"status={r.status_code}")
# SQL 超长拒绝
r = s.post(BASE + "/admin-ext/api/db-console/exec", json={"sql": "SELECT '" + "a" * 200000 + "'"},
           timeout=30)
rec("超长 SQL 拒绝(400)", r.status_code == 400, f"status={r.status_code}")
# ads 批量超 50
r = an.post(BASE + "/ap-ads/track",
            json={"events": [{"adId": "ap-ad-1", "type": "imp"}] * 51}, timeout=20)
rec("ads track 批量超 50 拒绝", r.status_code == 400, f"status={r.status_code}")
# 非法 method（写端点 GET）
r = s.get(BASE + "/admin-ext/api/files/mkdir", timeout=15)
rec("写端点 GET 方法不 5xx", r.status_code in (401, 403, 404, 405), f"status={r.status_code}")

# ---------- 9. 100 并发混合只读 ----------
paths = ["/", "/search?q=a", "/directory", "/rss.xml", "/robots.txt",
         "/admin-ext/api/db-console/tables", "/admin-ext/api/plugin-manager/state",
         f"/blog/{SLUG}"]
def mixed(i):
    p = paths[i % len(paths)]
    sess = s if p.startswith("/admin") else an
    try:
        return sess.get(BASE + p, timeout=30).status_code
    except Exception:
        return 0
with cf.ThreadPoolExecutor(25) as tp:
    codes = list(tp.map(mixed, range(100)))
rec("100 并发混合请求全部 2xx/3xx", all(200 <= c < 400 for c in codes),
    f"bad={[c for c in codes if not (200 <= c < 400)][:5]}")

# ---------- 汇总 ----------
np_ = sum(1 for _, st, _ in res if st == "pass")
nf = sum(1 for _, st, _ in res if st == "fail")
out = {"summary": {"total": len(res), "pass": np_, "fail": nf},
       "results": [{"case": c, "status": st, "detail": d} for c, st, d in res]}
json.dump(out, open("scripts/plugin-stress-result.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\nTOTAL={len(res)} PASS={np_} FAIL={nf}")
sys.exit(1 if nf else 0)
