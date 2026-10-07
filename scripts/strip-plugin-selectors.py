#!/usr/bin/env python3
# -*- coding: utf-8; -*-
"""移除新移植主题 theme.css 中对插件注入标识（#ap-comments 等）的引用，并同步 DB。"""
import json, os, re, sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "local.db")
SLUGS = ["stack", "ayer", "butterfly", "fluid", "icarus", "keep", "mengd", "next", "redefine", "volantis"]
# 匹配整块“注入插件区块留白协调”注释 + 规则（跨行）
PAT = re.compile(
    r"/\*[^*]*注入的?插件区块[^*]*\*/\s*main \.site-wrapper > article > [^{]*\{[^}]*\}\s*",
    re.S,
)

con = sqlite3.connect(DB, timeout=10)
themes = json.loads(con.execute("select option_value from wp_options where option_name='astropress_themes'").fetchone()[0])
for slug in SLUGS:
    p = os.path.join(ROOT, "wp-themes", f"{slug}-theme", "theme.css")
    css = open(p, encoding="utf-8").read()
    new, n = PAT.subn("", css)
    if n == 0:
        print(slug, "no-block")
        continue
    open(p, "w", encoding="utf-8").write(new)
    t = next((x for x in themes if slug in x["name"].lower()), None)
    if t:
        key = f"astropress_theme_css_{t['id']}"
        con.execute("update wp_options set option_value=? where option_name=?", (new, key))
    print(slug, f"removed {n} block(s)")
con.commit(); con.close()
print("done")
