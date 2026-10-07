#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F 轮 任务6：重新导入 10 个 Hexo/Hugo 移植主题（刷新保真修复），
逐主题激活并校验首页/文章/搜索/404 与全部前台插件注入标记。

用法:
  python scripts/test-f-themes.py            # 重新导入 + 矩阵
  python scripts/test-f-themes.py --no-import # 仅矩阵
结果写入 scripts/.f-themes-result.json
"""
import json, os, sqlite3, sys, time, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost:4321"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "local.db")
SLUGS = ["stack", "ayer", "butterfly", "fluid", "icarus", "keep", "mengd", "next", "redefine", "volantis"]
POST_URL = "/blog/pv-tips"
SNAP_KEYS = ("astropress_active_theme", "astropress_template_slots", "astropress_theme_config")

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def req(method, path, data=None, raw=None, ct=None, allow_redirects=True):
    h = {}
    body = None
    if raw is not None:
        body = raw.encode(); h["Content-Type"] = ct
    elif data is not None:
        body = json.dumps(data).encode(); h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=30) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def get_themes():
    st, body, _ = req("GET", "/api/themes")
    return json.loads(body)["themes"]


def build_pkg(slug):
    d = os.path.join(ROOT, "wp-themes", f"{slug}-theme")
    man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
    css = open(os.path.join(d, "theme.css"), encoding="utf-8").read()
    tmpls = []
    for fn in sorted(os.listdir(os.path.join(d, "templates"))):
        t = json.load(open(os.path.join(d, "templates", fn), encoding="utf-8"))
        tmpls.append({"name": t["name"], "type": t["type"], "blocks": t["blocks"]})
    pages = []
    pdir = os.path.join(d, "pages")
    if os.path.isdir(pdir):
        for fn in sorted(os.listdir(pdir)):
            pages.append(json.load(open(os.path.join(pdir, fn), encoding="utf-8")))
    return {"name": man["name"], "description": man.get("description", ""),
            "author": man.get("author", ""), "version": man.get("version", "1.0.0"),
            "tokens": man["tokens"], "css": css, "templates": tmpls, "pages": pages}


# 文章页必须出现的前台注入标记（40 插件全启用状态下）
POST_MARKERS = [
    ("comments", 'id="ap-comments"'),
    ("share", 'id="ap-share-root"'),
    ("donation", 'id="ap-donation"'),
    ("footer", 'id="ap-footer"'),
    ("customer-service", 'id="apcs-root"'),
    ("search-fab", 'id="ap-search-fab"'),
    ("related-track", "/ap-related/track"),
]
SEC_HEADERS = ["x-content-type-options", "x-frame-options", "referrer-policy"]


def main():
    do_import = "--no-import" not in sys.argv

    # ── 快照 ──
    con = sqlite3.connect(DB)
    snap = {}
    for k in SNAP_KEYS:
        row = con.execute("select option_value from wp_options where option_name=?", (k,)).fetchone()
        snap[k] = row[0] if row else None
    con.close()
    active_old_id = snap["astropress_active_theme"]

    st, _, _ = req("POST", "/api/auth/login", raw="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "",
                   ct="application/x-www-form-urlencoded")
    assert st in (200, 302), f"login {st}"

    themes = get_themes()
    active_old_name = next((t["name"] for t in themes if t["id"] == active_old_id), None)
    base_id = next((t["id"] for t in themes if t["id"] == "base-theme"), None)
    print("active before:", active_old_id, active_old_name)

    result = {"import": {}, "matrix": {}}
    try:
        if do_import:
            # 先切到 base，删除旧 10 主题，再重新导入
            req("POST", f"/api/themes/{base_id}")
            for slug in SLUGS:
                themes = get_themes()
                old = next((t for t in themes if t["name"].lower() == slug), None)
                if old:
                    st, body, _ = req("DELETE", f"/api/themes/{old['id']}")
                    result["import"].setdefault(slug, {})["delete"] = st
                st, body, _ = req("POST", "/api/themes/import",
                                  data={"package": build_pkg(slug), "createPages": False})
                try:
                    info = json.loads(body)
                    result["import"][slug]["import"] = f"{st} {info.get('themeId', info.get('error'))}"
                except Exception:
                    result["import"][slug]["import"] = f"{st} {body[:120]!r}"
                print("reimport", slug, st)
            time.sleep(0.5)

        themes = get_themes()
        for slug in SLUGS:
            t = next((x for x in themes if x["name"].lower() == slug), None)
            row = {"theme": t["name"] if t else None}
            if not t:
                row["error"] = "not found"
                result["matrix"][slug] = row
                continue
            st, _, _ = req("POST", f"/api/themes/{t['id']}")
            row["activate"] = st
            time.sleep(0.3)
            # 清缓存，保证拿到该主题最新渲染
            req("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})

            st_h, home, hdr_h = req("GET", "/")
            st_p, post, hdr_p = req("GET", POST_URL)
            st_s, search, _ = req("GET", "/search?q=test")
            st_4, nf, _ = req("GET", f"/no-such-f-round-{slug}")
            hs, ps = home.decode("utf-8", "replace"), post.decode("utf-8", "replace")
            ss = search.decode("utf-8", "replace")

            row["home_status"] = st_h
            row["post_status"] = st_p
            row["search_status"] = st_s
            row["404_status"] = st_4
            primary = t["tokens"]["colors"]["primary"].lower()
            row["primary_in_css"] = primary in ps.lower()
            row["article_struct"] = ("<article" in ps) and ('class="post-content"' in ps)
            row["markers"] = {name: (m in ps) for name, m in POST_MARKERS}
            row["security_headers"] = {h: (hdr_p.get(h) is not None) for h in SEC_HEADERS}
            row["home_has_blocks"] = "ap-blocks" in hs
            row["search_ok"] = ("search" in ss.lower()) and st_s == 200
            row["html_bytes"] = len(ps)
            ok = (st_h == 200 and st_p == 200 and st_s == 200 and st_4 == 404
                  and row["primary_in_css"] and row["article_struct"]
                  and all(row["markers"].values()) and all(row["security_headers"].values())
                  and row["home_has_blocks"])
            row["pass"] = ok
            result["matrix"][slug] = row
            print(f"{slug:10s} home={st_h} post={st_p} search={st_s} 404={st_4} "
                  f"css={'Y' if row['primary_in_css'] else 'N'} "
                  f"markers={sum(row['markers'].values())}/{len(POST_MARKERS)} "
                  f"sec={sum(row['security_headers'].values())}/{len(SEC_HEADERS)} "
                  f"{'PASS' if ok else 'FAIL'}")
    finally:
        # 还原激活主题（按旧名匹配新 id；找不到则 base）
        themes = get_themes()
        restore_id = base_id
        if active_old_name:
            hit = next((x for x in themes if x["name"] == active_old_name), None)
            if hit:
                restore_id = hit["id"]
        req("POST", f"/api/themes/{restore_id}")
        req("POST", "/admin-ext/api/page-cache/purge", data={"confirm": True})
        print("restored active theme:", restore_id, active_old_name)

    out = os.path.join(ROOT, "scripts", ".f-themes-result.json")
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    fails = [s for s, r in result["matrix"].items() if not r.get("pass")]
    print(f"\nRESULT: {len(SLUGS) - len(fails)}/{len(SLUGS)} themes pass; fails={fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
