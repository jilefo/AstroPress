#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 hexothemes 移植主题 + 主题切换兼容测试
1. sqlite3 快照 astropress_active_theme / astropress_template_slots / astropress_theme_config
2. 通过 /api/themes/import 导入 10 个新主题（createPages=false）
3. 逐个激活并抓取前台首页+文章页，校验主题 CSS 标记与 <article>/.post-content 结构
4. 还原快照（直接 sqlite3 写回）
"""
import json, os, sqlite3, sys, time, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost:4321"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "local.db")
SLUGS = ["stack", "ayer", "butterfly", "fluid", "icarus", "keep", "mengd", "next", "redefine", "volantis"]
POST_URL = "/pv-tips"  # 已发布测试文章

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def req(method, path, data=None, raw=None, ct=None):
    h = {}
    body = None
    if raw is not None:
        body = raw.encode(); h["Content-Type"] = ct
    elif data is not None:
        body = json.dumps(data).encode(); h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=20) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

# ── 0. 快照 ──────────────────────────────────────────────────────────
SNAP_KEYS = ("astropress_active_theme", "astropress_template_slots", "astropress_theme_config")
snap = {}
con = sqlite3.connect(DB)
for k in SNAP_KEYS:
    row = con.execute("select option_value from wp_options where option_name=?", (k,)).fetchone()
    snap[k] = row[0] if row else None
con.close()
print("snapshot:", {k: (v[:60] + "..." if v and len(v) > 60 else v) for k, v in snap.items()})

def restore():
    con = sqlite3.connect(DB, timeout=10)
    for k, v in snap.items():
        if v is None:
            con.execute("delete from wp_options where option_name=?", (k,))
        else:
            cur = con.execute("select option_id from wp_options where option_name=?", (k,))
            if cur.fetchone():
                con.execute("update wp_options set option_value=? where option_name=?", (v, k))
            else:
                con.execute("insert into wp_options(option_name, option_value, autoload) values(?,?,'yes')", (k, v))
    con.commit(); con.close()

results = {"import": {}, "compat": {}}
try:
    # ── 1. 登录 ───────────────────────────────────────────────────────
    st, _ = req("POST", "/api/auth/login", raw="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "", ct="application/x-www-form-urlencoded")
    assert st in (200, 302), f"login failed {st}"

    st, body = req("GET", "/api/themes")
    themes = json.loads(body)["themes"]
    by_name = {t["name"]: t for t in themes}
    print(f"existing themes: {len(themes)}")

    # ── 2. 导入 ───────────────────────────────────────────────────────
    for slug in SLUGS:
        d = os.path.join(ROOT, "wp-themes", f"{slug}-theme")
        man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
        if man["name"] in by_name:
            results["import"][slug] = "skip(exists)"
            continue
        css = open(os.path.join(d, "theme.css"), encoding="utf-8").read()
        tmpls = []
        for fn in sorted(os.listdir(os.path.join(d, "templates"))):
            t = json.load(open(os.path.join(d, "templates", fn), encoding="utf-8"))
            tmpls.append({"name": t["name"], "type": t["type"], "blocks": t["blocks"]})
        pages = []
        for fn in sorted(os.listdir(os.path.join(d, "pages"))):
            pages.append(json.load(open(os.path.join(d, "pages", fn), encoding="utf-8")))
        pkg = {"name": man["name"], "description": man.get("description", ""),
               "author": man.get("author", ""), "version": man.get("version", "1.0.0"),
               "tokens": man["tokens"], "css": css, "templates": tmpls, "pages": pages}
        st, body = req("POST", "/api/themes/import", data={"package": pkg, "createPages": False})
        try:
            d2 = json.loads(body)
            results["import"][slug] = f"{st} id={d2.get('themeId', d2.get('error'))}"
        except Exception:
            results["import"][slug] = f"{st} {body[:100]!r}"
        print("import", slug, results["import"][slug])

    # ── 3. 逐个激活 + 前台校验 ────────────────────────────────────────
    st, body = req("GET", "/api/themes")
    themes = json.loads(body)["themes"]
    markers = {  # theme.css 内的特征字符串
        "stack": "--stack-bg", "ayer": None, "butterfly": None, "fluid": None, "icarus": None,
        "keep": None, "mengd": None, "next": None, "redefine": None, "volantis": None,
    }
    for slug in SLUGS:
        t = next((x for x in themes if x["name"].lower().startswith(slug) or slug in x["name"].lower()), None)
        if not t:
            results["compat"][slug] = "theme not found"
            continue
        st, _ = req("POST", f"/api/themes/{t['id']}")
        if st != 200:
            results["compat"][slug] = f"activate {st}"
            continue
        time.sleep(0.3)
        st_h, home = req("GET", "/")
        st_p, post = req("GET", POST_URL)
        home_s, post_s = home.decode("utf-8", "replace"), post.decode("utf-8", "replace")
        # CSS 标记：manifest 主色或 theme.css 的 :root 变量应出现在 <style> 中
        primary = t["tokens"]["colors"]["primary"]
        css_in = primary.lower() in post_s.lower()
        struct = ("<article" in post_s) and ('class="post-content"' in post_s)
        checks = dict(home=st_h == 200, post=st_p == 200, css=css_in, article=struct,
                      footer=("site-footer" in post_s) or ("<footer" in post_s))
        results["compat"][slug] = checks
        print("compat", slug, checks)
finally:
    restore()
    print("\nrestored snapshot")

fails = [s for s, c in results["compat"].items() if not (isinstance(c, dict) and all(c.values()))]
print("\n=== IMPORT ==="); [print(f"  {k}: {v}") for k, v in results["import"].items()]
print("=== COMPAT FAILS ===", fails or "none")
print(f"RESULT: {len(SLUGS) - len(fails)}/{len(SLUGS)} themes compatible")
