#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""V8 任务5：写路径混沌复测快组门禁（A/C/D），部署后 ~90s 完成。

  A 组（7 项）：评论频控 D1 原子滑窗 3×201+3×429 / 429 中文 / 蜜罐 202 不占配额 /
               待审落库 / 并发审批幂等 / ≤8s 前台可见
  C 组（5 项）：重定向环检测 / 并发不同 from 零丢失 / 相同 from 去重 / 301 生效 / 并发删除无 500
  D 组（5 项）：网站目录建分类→建链接→审批→20 次并发点击全 302→clicks 原子 +20 零丢失

双形态：同一脚本，Node 直连传 http://127.0.0.1:4322（内置 Secure cookie 策略），
        Cloudflare 传 https://<worker>.workers.dev。

用法:
  python v8_gate_acd.py [BASE_URL] [OUT_JSON]
默认 BASE = https://astropress-v2.nqc715560.workers.dev
退出码 0 = 全部门禁通过；非 0 = 有失败项（适合接部署流水线）。
"""
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")

BASE = (sys.argv[1] if len(sys.argv) > 1
        else "https://astropress-v2.nqc715560.workers.dev").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.path.join(HERE, "..", "logs")
os.makedirs(LOGS, exist_ok=True)
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    LOGS, f"v8_gate_acd_{int(time.time())}.json")
TAG = sys.argv[3] if len(sys.argv) > 3 else str(int(time.time()))
STAMP = f"V8GATE-{TAG}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 V8GateACD/1.0"

_PWD = os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
if not _PWD:
    cred = os.path.join(HERE, "..", ".ap-data", "credential.txt")
    if os.path.exists(cred):
        for line in open(cred, encoding="utf-8"):
            if line.startswith("ASTROPRESS_TEST_PASSWORD="):
                _PWD = line.split("=", 1)[1].strip()
                break

checks = []


def ck(cid, name, ok, detail=""):
    checks.append({"id": cid, "name": name, "pass": bool(ok), "detail": str(detail)[:300]})
    print(f"[{'PASS' if ok else 'FAIL'}] {cid} {name} {('- ' + str(detail)[:90]) if detail else ''}")


def info(msg):
    print(f"  · {msg}")


def jl(text, default):
    try:
        return json.loads(text)
    except Exception:
        return default


# ---------- HTTP 基建（与 v8_node_chaos 同构） ----------
class _SecurePolicy(http.cookiejar.DefaultCookiePolicy):
    """Node 生产 session cookie 带 Secure；本机 http 压测强制收发。"""
    def return_ok_secure(self, cookie, request):
        return True

    def set_ok(self, cookie, request):
        return True


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


cj = http.cookiejar.CookieJar(policy=_SecurePolicy())
_ssl_ctx = ssl._create_unverified_context()
op = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=_ssl_ctx))
op_nr = urllib.request.build_opener(
    NoRedirect, urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=_ssl_ctx))


def req(method, path, body=None, ctype="application/json", origin=True, follow=True,
        raw_body=None, timeout=15):
    url = path if path.startswith("http") else BASE + path
    headers = {"User-Agent": UA}
    if origin is True:
        headers["Origin"] = BASE
    elif isinstance(origin, str):
        headers["Origin"] = origin
    if raw_body is not None:
        data = raw_body if isinstance(raw_body, bytes) else raw_body.encode()
        headers["Content-Type"] = ctype
    elif body is not None:
        if ctype != "application/json":
            data = urllib.parse.urlencode(body).encode()
        else:
            data = json.dumps(body, ensure_ascii=False).encode()
        headers["Content-Type"] = ctype
    else:
        data = None
    opener = op if follow else op_nr
    for attempt in range(2):
        rr = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with opener.open(rr, timeout=timeout) as x:
                return x.status, {k.lower(): v for k, v in x.headers.items()}, x.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt == 1:
                return -1, {}, f"{type(e).__name__}: {e}"
            time.sleep(2)


def parallel(calls, workers=10, hard_timeout=60, cf_degrade_threshold=0.2):
    """并发请求；硬超时兜底防止 urllib SSL 死锁；支持 CF 503 降级标记。

    共享 CookieJar 在多线程下非线程安全，可能死锁——
    用 as_completed + hard_timeout 保证线程池总能退出。

    cf_degrade_threshold: 允许的 5xx 比例上限（默认 20%），超过则整体标 FAIL。
    """
    def one(c):
        method, path, body, kw = c
        try:
            return req(method, path, body, **kw)
        except Exception as e:
            return -1, {}, f"{type(e).__name__}: {e}"
    results = [None] * len(calls)
    deadline = time.time() + hard_timeout
    with ThreadPoolExecutor(max_workers=workers) as ex:
        fut_to_idx = {ex.submit(one, c): i for i, c in enumerate(calls)}
        from concurrent.futures import wait, FIRST_COMPLETED
        pending = set(fut_to_idx)
        while pending and time.time() < deadline:
            done, pending = wait(pending, timeout=2, return_when=FIRST_COMPLETED)
            for f in done:
                results[fut_to_idx[f]] = f.result()
        # 超时未完成的填 -1 兜底
        for f in pending:
            results[fut_to_idx[f]] = (-1, {}, "hard_timeout")
    return results


def count_5xx(results):
    """统计并发结果中 5xx 的数量（CF D1 降级检测）。"""
    return sum(1 for r in results if isinstance(r, tuple) and len(r) >= 1 and 500 <= r[0] < 600)


# ---------- 登录 ----------
_LOGIN_OK = True
st = -1
for _li in range(3):  # CF D1 503 容错：登录最多重试 3 次
    st, _, _ = req("POST", "/api/auth/login", {"username": "admin", "password": _PWD},
                   ctype="application/x-www-form-urlencoded", origin=False)
    if st in (302, 200):
        break
    if st >= 500 or st == -1:
        time.sleep(1 + _li)
        continue
    break  # 4xx 不重试（凭证错误）
if st not in (302, 200):
    _LOGIN_OK = False
    info(f"登录失败 st={st}，全部 17 项判 FAIL")
    for cid, name in [("C01","重定向环检测"),("C02","并发不同from零丢失"),("C03","并发相同from去重"),
                      ("C04","301规则生效"),("C05","并发删除无500"),
                      ("D01","创建测试分类"),("D02","创建测试链接"),("D03","链接审批通过"),
                      ("D04","并发点击全302"),("D05","原子计数零丢失"),
                      ("A01","频控滑窗3×201+3×429"),("A02","429提示中文"),("A03","蜜罐并发全202"),
                      ("A04","蜜罐不占配额"),("A05","待审列表含本批"),("A06","并发审批无500"),
                      ("A07","批准评论8s内前台可见")]:
        ck(cid, name, False, f"登录失败 st={st}")
    summary = {"base": BASE, "stamp": STAMP, "time": time.strftime("%Y-%m-%d %H:%M:%S"),
               "total": len(checks), "passed": 0, "failed": len(checks), "checks": checks}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\n{'='*50}\n门禁结果：0/{len(checks)} PASS (登录失败)  ->  {OUT}")
    sys.exit(1)
else:
    info(f"登录成功 {BASE} STAMP={STAMP}")

created = {"redirects": [], "comment_ids": [], "link_id": None, "cat_id": None}


def cleanup(_hard=False):
    # 评论硬删（全状态扫描）
    ids = []
    for qs in ("pending", "approved", "spam", "trash", ""):
        arr = jl(req("GET", f"/admin-ext/api/comments/list?status={qs}")[2], {}).get("items", [])
        for c in arr:
            if str(c.get("content", "")).startswith(STAMP) and c["id"] not in ids:
                ids.append(c["id"])
    if ids:
        req("POST", "/admin-ext/api/comments/action", {"ids": ids, "action": "delete"})
    # 重定向
    for r in jl(req("GET", "/admin-ext/api/redirects")[2], []):
        if r["from"].startswith(f"/{STAMP}"):
            req("DELETE", f"/admin-ext/api/redirects?id={r['id']}")
    # 链接 / 分类
    if created["link_id"]:
        req("DELETE", f"/admin-ext/api/links?id={created['link_id']}")
    for x in jl(req("GET", "/admin-ext/api/links")[2], []):
        if STAMP in str(x.get("name", "")):
            req("DELETE", f"/admin-ext/api/links?id={x['id']}")
    if created["cat_id"]:
        req("DELETE", f"/admin-ext/api/links/cats?id={created['cat_id']}")
    for x in jl(req("GET", "/admin-ext/api/links/cats")[2], []):
        if STAMP in str(x.get("name", "")):
            req("DELETE", f"/admin-ext/api/links/cats?id={x['id']}")


# atexit 不注册：显式 cleanup() 在汇总前已调用，CF 上 DELETE 请求偶发慢可能导致 atexit 挂起


# ============================================================
# C 组：重定向并发（D1 JSON1 原子写）
# ============================================================
print("\n===== C 重定向并发 =====")
r1 = req("POST", "/admin-ext/api/redirects", {"from": f"/{STAMP}-a", "to": f"/{STAMP}-b", "type": 301})
if r1[0] == 200:
    created["redirects"].append(f"/{STAMP}-a")
r2 = req("POST", "/admin-ext/api/redirects", {"from": f"/{STAMP}-b", "to": f"/{STAMP}-a", "type": 301})
ck("C01", "重定向环 B→A→B 保存即400", r2[0] == 400, f"r1={r1[0]} r2={r2[0]} {r2[2][:60]}")
if r2[0] == 200:
    created["redirects"].append(f"/{STAMP}-b")
time.sleep(0.4)

calls = [("POST", "/admin-ext/api/redirects",
          {"from": f"/{STAMP}-p{i}", "to": "/wp-to-astro", "type": 301}, {}) for i in range(10)]
res_c02 = parallel(calls, workers=10)
ok200 = [r for r in res_c02 if r[0] == 200]
for r in ok200:
    try:
        created["redirects"].append(json.loads(r[2])["rule"]["from"])
    except Exception:
        pass
mine = [r for r in jl(req("GET", "/admin-ext/api/redirects")[2], [])
        if r["from"].startswith(f"/{STAMP}-p")]
n5xx_c02 = count_5xx(res_c02)
if n5xx_c02 > 2:  # >20% 5xx → 标记 CF 降级
    ck("C02", "并发10条不同from零丢失", False,
       f"CF平台降级: 5xx={n5xx_c02}/10 200响应={len(ok200)} 落库={len(mine)}")
else:
    ck("C02", "并发10条不同from零丢失", len(ok200) == 10 and len(mine) == 10,
       f"200响应={len(ok200)} 实际落库={len(mine)}" + (f" [CF降级5xx={n5xx_c02}]" if n5xx_c02 else ""))
time.sleep(0.4)

calls = [("POST", "/admin-ext/api/redirects",
          {"from": f"/{STAMP}-dup", "to": "/wp-to-astro", "type": 301}, {}) for _ in range(4)]
res_c03 = parallel(calls, workers=4)
dup_ok = [r for r in res_c03 if r[0] == 200]
dup_rules = [r for r in jl(req("GET", "/admin-ext/api/redirects")[2], [])
             if r["from"] == f"/{STAMP}-dup"]
for r in dup_rules:
    created["redirects"].append(r["from"])
ck("C03", "并发相同from去重≤1", len(dup_rules) <= 1,
   f"200响应={len(dup_ok)} 落库={len(dup_rules)}")
time.sleep(0.4)

hit_from = f"/{STAMP}-hit"
r = req("POST", "/admin-ext/api/redirects", {"from": hit_from, "to": "/wp-to-astro", "type": 301})
if r[0] == 200:
    created["redirects"].append(hit_from)
time.sleep(1.5)
st, h, _ = req("GET", hit_from, origin=False, follow=False)
ck("C04", "301规则线上生效", st in (301, 302) and "wp-to-astro" in h.get("location", ""),
   f"st={st} loc={h.get('location','')[:60]}")

rid = next((r["id"] for r in jl(req("GET", "/admin-ext/api/redirects")[2], [])
            if r["from"] == f"/{STAMP}-p9"), None)
if rid:
    rr = parallel([("DELETE", f"/admin-ext/api/redirects?id={rid}", None, {}) for _ in range(2)], workers=2)
    created["redirects"] = [f for f in created["redirects"] if f != f"/{STAMP}-p9"]
    ck("C05", "并发删除同id无500", all(x[0] != 500 and x[0] != -1 for x in rr),
       f"codes={[x[0] for x in rr]}")
else:
    ck("C05", "并发删除同id无500", False, "未找到 p9 规则")

# ============================================================
# D 组：链接点击原子计数
# ============================================================
print("\n===== D 链接点击原子计数 =====")
cat_name = f"{STAMP}分类"
st, _, t = req("POST", "/admin-ext/api/links/cats", {"name": cat_name})
if st == 200:
    _j = jl(t, {})
    created["cat_id"] = _j.get("cat", {}).get("id") or _j.get("id")
if not created["cat_id"]:
    created["cat_id"] = next((c["id"] for c in jl(req("GET", "/admin-ext/api/links/cats")[2], [])
                              if c.get("name") == cat_name), None)
ck("D01", "创建测试分类", bool(created["cat_id"]), f"cat_id={created['cat_id']} st={st}")

if created["cat_id"]:
    st, _, t = req("POST", "/admin-ext/api/links",
                   {"catId": created["cat_id"], "name": f"{STAMP}链接",
                    "url": "https://example.com/v8gate", "status": "pending"})
    if st == 200:
        created["link_id"] = jl(t, {}).get("link", {}).get("id")
    ck("D02", "创建测试链接", bool(created["link_id"]), f"link={created['link_id']} st={st}")
    if created["link_id"]:
        st, _, _ = req("PUT", "/admin-ext/api/links", {"id": created["link_id"], "status": "approved"})
        ck("D03", "链接审批通过", st == 200, f"st={st}")
        before = next((x["clicks"] for x in jl(req("GET", "/admin-ext/api/links")[2], [])
                       if x["id"] == created["link_id"]), 0)
        rr = parallel([("GET", f"/ap-links/click?id={created['link_id']}", None,
                        {"origin": False, "follow": False}) for _ in range(20)], workers=10)
        n302 = sum(1 for x in rr if x[0] == 302)
        time.sleep(1.0)
        after = next((x["clicks"] for x in jl(req("GET", "/admin-ext/api/links")[2], [])
                      if x["id"] == created["link_id"]), -1)
        n5xx_d04 = count_5xx(rr)
        if n5xx_d04 > 4:  # >20% 5xx → 标记 CF 降级
            ck("D04", "20次并发点击全部302", False,
               f"CF平台降级: 5xx={n5xx_d04}/20 302={n302}")
        else:
            ck("D04", "20次并发点击全部302", n302 == 20,
               f"302={n302} codes={sorted(set(x[0] for x in rr))}" + (f" [CF降级5xx={n5xx_d04}]" if n5xx_d04 else ""))
        ck("D05", "原子计数零丢失(+20)", after == before + 20, f"before={before} after={after}")

# ============================================================
# A 组：评论频控原子性（最后跑，避开频控窗口）
# ============================================================
print("\n===== A 评论并发 =====")


def comment_burst():
    return parallel([("POST", "/ap-comments/submit",
                      {"slug": "wp-to-astro", "author": f"{STAMP}作者",
                       "email": f"v8g{i}@example.com",
                       "content": f"{STAMP} 并发评论批次 {i} {time.time()}"},
                      {"origin": False}) for i in range(6)], workers=6)


rr_a = comment_burst()
codes = [x[0] for x in rr_a]
n201, n429 = codes.count(201), codes.count(429)
if not (n201 == 3 and n429 == 3):
    info(f"频控窗口未干净（201={n201} 429={n429}），等 32s 重测一次")
    time.sleep(32)
    rr_a = comment_burst()
    codes = [x[0] for x in rr_a]
    n201, n429 = codes.count(201), codes.count(429)
ck("A01", "并发6条：恰好3×201+3×429(D1原子滑窗)", n201 == 3 and n429 == 3,
   f"201={n201} 429={n429} all={codes}")
msg429 = next((x[2] for x in rr_a if x[0] == 429), "")
ck("A02", "429提示中文", "频繁" in msg429, msg429[:60])

info("等频控窗口 32s 后验证蜜罐不占配额 …")
time.sleep(32)
rr_h = parallel([("POST", "/ap-comments/submit",
                  {"slug": "wp-to-astro", "author": "bot", "email": "b@b.com",
                   "content": "spam", "ap_website": "http://x.example"},
                  {"origin": False}) for _ in range(3)], workers=3)
ck("A03", "3条蜜罐并发全202", all(x[0] == 202 for x in rr_h), f"codes={[x[0] for x in rr_h]}")

st, _, t = req("POST", "/ap-comments/submit",
               {"slug": "wp-to-astro", "author": f"{STAMP}作者", "email": "v8gok@example.com",
                "content": f"{STAMP} 蜜罐后合法评论 {time.time()}"}, origin=False)
ck("A04", "蜜罐不占频控配额(紧接合法评论201)", st == 201, f"st={st} {t[:60]}")

pending = jl(req("GET", "/admin-ext/api/comments/list?status=pending&perPage=100")[2], {}).get("items", [])
ids = [c["id"] for c in pending if str(c.get("content", "")).startswith(STAMP)]
ck("A05", "待审列表含本批4条评论", len(ids) >= 4, f"ids={ids[:8]}")
if len(ids) >= 4:
    rr_ap = parallel([("POST", "/admin-ext/api/comments/action",
                       {"ids": ids[:4], "action": "approve"}, {}) for _ in range(5)], workers=5)
    n5xx_a06 = count_5xx(rr_ap)
    if n5xx_a06 > 1:  # >20% 5xx → 标记 CF 降级
        ck("A06", "并发5次审批无500(幂等)", False,
           f"CF平台降级: 5xx={n5xx_a06}/5 codes={[x[0] for x in rr_ap]}")
    else:
        ck("A06", "并发5次审批无500(幂等)", all(x[0] == 200 for x in rr_ap),
           f"codes={[x[0] for x in rr_ap]}" + (f" [CF降级5xx={n5xx_a06}]" if n5xx_a06 else ""))
    created["comment_ids"] = ids[:4]
    # V8 epoch 收口为 2s；poll 0.5s × 16 次（8s 上限）
    t0 = time.time()
    visible = False
    for _ in range(16):
        time.sleep(0.5)
        s, _, page = req("GET", "/wp-to-astro", origin=False)
        if s == 200 and STAMP in page:
            visible = True
            break
    ck("A07", "批准评论8s内前台可见(epoch 2s收口)", visible, f"{time.time()-t0:.1f}s")

# ---------- 汇总 ----------
# 先写 JSON 再 cleanup：CF 上 DELETE 请求偶发慢，先落盘结果避免编排器超时读不到
passed = sum(1 for c in checks if c["pass"])
summary = {"base": BASE, "stamp": STAMP, "time": time.strftime("%Y-%m-%d %H:%M:%S"),
           "total": len(checks), "passed": passed, "failed": len(checks) - passed,
           "checks": checks}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"\n{'='*50}\n门禁结果：{passed}/{len(checks)} PASS  ->  {OUT}")
cleanup()
sys.exit(0 if passed == len(checks) else 1)
