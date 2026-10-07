# G-round verification: 6 new plugins (asset-cache / maintenance-mode / rate-limit /
# activity-log / revisions / cache-warmer) — pages, APIs, middleware behaviors.
import os
import json
import re
import time
import urllib.request
import urllib.error
import urllib.parse
import http.cookiejar

BASE = "http://localhost:4321"

cj = http.cookiejar.CookieJar()
admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
anon = urllib.request.build_opener()  # no cookies

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), name, ("| " + detail) if detail else "")


def req(opener, method, path, body=None, form=None, headers=None, timeout=30):
    url = BASE + path
    data = None
    h = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    elif form is not None:
        data = urllib.parse.urlencode(form).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        resp = opener.open(r, timeout=timeout)
        hd = {k.lower(): v for k, v in resp.headers.items()}
        return resp.status, hd, resp.read()
    except urllib.error.HTTPError as e:
        hd = {k.lower(): v for k, v in e.headers.items()}
        return e.code, hd, e.read()


# ---------- login ----------
st, hd, body = req(admin, "POST", "/api/auth/login",
                   form={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")})
check("login", st in (200, 302) and any("auth_session" in str(c) for c in cj), f"status={st}")

# ---------- A. admin pages ----------
for slug in ["asset-cache", "maintenance-mode", "rate-limit", "activity-log", "revisions", "cache-warmer"]:
    st, _, _ = req(admin, "GET", f"/admin-ext/{slug}")
    check(f"page /admin-ext/{slug}", st == 200, f"status={st}")

# ---------- B. settings/status GET APIs ----------
for path in ["/admin-ext/api/asset-cache/settings",
             "/admin-ext/api/maintenance/settings",
             "/admin-ext/api/rate-limit/settings",
             "/admin-ext/api/rate-limit/stats",
             "/admin-ext/api/activity-log/list",
             "/admin-ext/api/cache-warmer/settings",
             "/admin-ext/api/cache-warmer/status"]:
    st, _, body = req(admin, "GET", path)
    ok = st == 200
    if ok:
        try:
            json.loads(body)
        except Exception:
            ok = False
    check(f"api GET {path}", ok, f"status={st}")

# ---------- C. asset-cache middleware ----------
# 注意：dev 模式下 public/ 静态文件与 Vite 内部资源（/@fs/*）由 Vite 静态中间件直接伺服，
# 不经过 Astro 中间件链（dev-only）；这里改用经 Astro 路由的 /robots.txt + extraRules 验证。
st, hd, body = req(anon, "GET", "/")
cc = hd.get("cache-control", "")
check("asset-cache: html untouched", "immutable" not in cc and "max-age" not in cc, f"cc={cc!r}")

st, _, body = req(admin, "GET", "/admin-ext/api/asset-cache/settings")
orig_ac = json.loads(body) if st == 200 else {}
mod_ac = dict(orig_ac)
mod_ac["extraRules"] = [{"ext": "txt", "maxAge": 3600}]
st, _, _ = req(admin, "POST", "/admin-ext/api/asset-cache/settings", body=mod_ac)
check("asset-cache: save extraRules", st == 200, f"status={st}")

st, hd, _ = req(anon, "GET", "/robots.txt")
cc = hd.get("cache-control", "")
check("asset-cache: robots.txt extraRule", st == 200 and "max-age=3600" in cc, f"status={st} cc={cc!r}")

req(admin, "POST", "/admin-ext/api/asset-cache/settings", body=orig_ac)

# ---------- D. rate-limit ----------
st, _, _ = req(admin, "POST", "/admin-ext/api/rate-limit/reset", body={"confirm": True})
check("rate-limit: reset", st == 200, f"status={st}")

codes = []
retry_after = None
for _ in range(35):
    st, hd, _ = req(anon, "GET", "/search", timeout=15)
    codes.append(st)
    if st == 429 and retry_after is None:
        retry_after = hd.get("retry-after")
n429 = codes.count(429)
check("rate-limit: /search 429 after burst", n429 >= 1 and retry_after is not None,
      f"429s={n429}/35 retryAfter={retry_after}")

st, _, body = req(admin, "GET", "/admin-ext/api/rate-limit/stats")
try:
    stats = json.loads(body)
    blocked = stats.get("blocked", {})
    hit = any(v > 0 for v in blocked.values())
except Exception:
    hit = False
check("rate-limit: stats blocked>0", hit, body.decode()[:120])

st, _, _ = req(admin, "POST", "/admin-ext/api/rate-limit/reset", body={"confirm": True})
st2, _, body2 = req(admin, "GET", "/admin-ext/api/rate-limit/stats")
try:
    zeroed = all(v == 0 for v in json.loads(body2).get("blocked", {}).values())
except Exception:
    zeroed = False
check("rate-limit: reset clears", st == 200 and zeroed, f"reset={st} zeroed={zeroed}")

# ---------- E. maintenance-mode ----------
st, _, body = req(admin, "GET", "/admin-ext/api/maintenance/settings")
orig = json.loads(body) if st == 200 else {}
st, _, _ = req(admin, "POST", "/admin-ext/api/maintenance/settings",
               body={"enabled": True, "title": "站点维护中", "message": "系统升级，请稍后再来", "eta": "", "allowedIps": []})
check("maintenance: enable", st == 200, f"status={st}")

st, hd, body = req(anon, "GET", "/")
body_txt = body.decode("utf-8", "ignore")
check("maintenance: anon 503", st == 503 and hd.get("retry-after") == "300" and "站点维护中" in body_txt,
      f"status={st} ra={hd.get('retry-after')}")

st, _, _ = req(admin, "GET", "/")
check("maintenance: admin bypass", st == 200, f"status={st}")

st, _, _ = req(admin, "POST", "/admin-ext/api/maintenance/settings", body=orig)
st2, _, _ = req(anon, "GET", "/")
check("maintenance: disable restores", st == 200 and st2 == 200, f"save={st} anon={st2}")

# ---------- F. activity-log ----------
st, _, body = req(admin, "GET", "/admin-ext/api/activity-log/list?path=maintenance")
try:
    data = json.loads(body)
    rows = data.get("rows", [])
    hit = any(r.get("method") == "POST" and "maintenance" in str(r.get("path", "")) for r in rows)
except Exception:
    hit, rows = False, []
check("activity-log: recorded maintenance POST", hit, f"rows={len(rows)}")

st, _, body = req(admin, "GET", "/admin-ext/api/activity-log/list")
try:
    data = json.loads(body)
    leak = any("password" in str(r.get("path", "")).lower() or "?" in str(r.get("path", "")) for r in data.get("rows", []))
except Exception:
    leak = True
check("activity-log: no query string stored", not leak)

# ---------- G. revisions ----------
st, _, body = req(admin, "GET", "/api/posts")
posts = json.loads(body)
items = posts if isinstance(posts, list) else posts.get("items") or posts.get("posts") or []
pid = items[0].get("id") if items else None
check("revisions: found a post", pid is not None, f"pid={pid}")

if pid:
    st, _, body = req(admin, "GET", f"/api/posts/{pid}")
    post = json.loads(body)
    orig_title = post.get("postTitle") or post.get("title") or ""
    orig_content = post.get("postContent") or post.get("content") or ""

    st, _, _ = req(admin, "PUT", f"/api/posts/{pid}", body={"title": orig_title + " [revtest]"})
    check("revisions: PUT post", st == 200, f"status={st}")

    time.sleep(0.3)
    st, _, body = req(admin, "GET", f"/admin-ext/api/revisions/list?post={pid}")
    try:
        revs = json.loads(body).get("items", [])
    except Exception:
        revs = []
    check("revisions: snapshot created", len(revs) >= 1 and str(revs[0].get("title")) == orig_title,
          f"revs={len(revs)} latest={revs[0].get('title') if revs else None!r}")

    if revs:
        rid = revs[0].get("id")
        st, _, body = req(admin, "GET", f"/admin-ext/api/revisions/read?id={rid}")
        try:
            full = json.loads(body).get("item", {})
            has_content = str(full.get("title")) == orig_title and str(full.get("content")) == orig_content
        except Exception:
            has_content = False
        check("revisions: read snapshot", st == 200 and has_content, f"status={st}")

        st, _, body = req(admin, "POST", "/admin-ext/api/revisions/restore", body={"id": rid, "confirm": True})
        st2, _, body2 = req(admin, "GET", f"/api/posts/{pid}")
        post2 = json.loads(body2)
        restored = (post2.get("postTitle") or post2.get("title")) == orig_title
        check("revisions: restore", st == 200 and restored, f"restore={st} title_ok={restored}")

# ---------- H. cache-warmer ----------
st, _, _ = req(admin, "POST", "/admin-ext/api/cache-warmer/run", body={})
check("cache-warmer: run accepted", st in (202, 409), f"status={st}")

done = False
last = {}
for _ in range(30):
    time.sleep(2)
    st, _, body = req(admin, "GET", "/admin-ext/api/cache-warmer/status")
    try:
        last = json.loads(body)
    except Exception:
        continue
    if not last.get("running"):
        done = True
        break
batches = last.get("records") or []
ok_n = batches[0].get("ok", 0) if batches else 0
total_n = batches[0].get("total", 0) if batches else 0
check("cache-warmer: batch completed", done and len(batches) >= 1 and total_n > 0,
      f"done={done} batches={len(batches)} total={total_n} ok={ok_n}")

# ---------- summary ----------
fails = [r for r in results if not r[1]]
print()
print(f"TOTAL {len(results)} | PASS {len(results) - len(fails)} | FAIL {len(fails)}")
for name, _, detail in fails:
    print("  FAIL:", name, "|", detail)
raise SystemExit(1 if fails else 0)
