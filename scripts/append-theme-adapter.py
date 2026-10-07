#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 10 个 hexo 移植主题追加 .ap-block-nav 适配层（块渲染页头套用主题风格），
并同步更新数据库中的 astropress_theme_css_<id>。幂等：已有适配层则跳过。"""
import json, os, sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "local.db")
# slug -> (阴影, 是否卡片式页头)
CFG = {
    "stack":     ("0px 4px 8px rgba(0,0,0,0.04), 0px 0px 2px rgba(0,0,0,0.06)", True),
    "ayer":      ("0 2px 8px rgba(0,0,0,0.06)", True),
    "butterfly": ("0 3px 8px 6px rgba(7,17,27,0.05)", True),
    "fluid":     ("0 2px 12px rgba(0,0,0,0.08)", True),
    "icarus":    ("0 2px 3px rgba(10,10,10,0.1)", True),
    "keep":      ("none", False),
    "mengd":     ("0 2px 12px rgba(229,138,138,0.15)", True),
    "next":      ("none", False),
    "redefine":  ("0 4px 24px rgba(0,0,0,0.06)", True),
    "volantis":  ("0 2px 8px rgba(0,0,0,0.1)", True),
}
MARK = "/* >>> ap-nav-adapter >>> */"

con = sqlite3.connect(DB, timeout=10)
row = con.execute("select option_value from wp_options where option_name='astropress_themes'").fetchone()
themes = json.loads(row[0])
by_name = {t["name"].lower(): t for t in themes}

for slug, (shadow, card) in CFG.items():
    d = os.path.join(ROOT, "wp-themes", f"{slug}-theme")
    css_path = os.path.join(d, "theme.css")
    css = open(css_path, encoding="utf-8").read()
    man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
    c = man["tokens"]["colors"]
    radius = man["tokens"]["spacing"]["borderRadius"]
    if MARK in css:
        print(slug, "skip (already)")
        continue
    border = "none" if card else f'1px solid {c["border"]}'
    adapter = f"""
{MARK}
/* 块渲染页头适配：当模板槽位输出 .ap-block-nav 时套用本主题设计语言 */
.ap-block-nav {{
  position: sticky; top: 0; z-index: 90;
  border-bottom: {border} !important;
  box-shadow: {shadow};
}}
.ap-block-nav > a {{ color: {c["text"]} !important; }}
.ap-block-nav nav ul li a {{
  border-radius: {radius};
  transition: color 0.3s ease, background-color 0.3s ease;
}}
.ap-block-nav nav ul li a:hover {{
  color: {c["primary"]} !important;
  background: {c["surface"]};
}}
@media (max-width: 640px) {{
  .ap-block-nav {{ height: auto !important; min-height: 56px; flex-wrap: wrap; padding: 8px 20px !important; row-gap: 4px; }}
  .ap-block-nav nav {{ width: 100%; }}
  .ap-block-nav nav ul {{ flex-wrap: wrap; }}
}}
/* <<< ap-nav-adapter <<< */
"""
    css = css.rstrip() + "\n" + adapter
    open(css_path, "w", encoding="utf-8").write(css)
    # 同步 DB
    t = by_name.get(man["name"].lower()) or by_name.get(slug)
    if not t:
        hit = [x for x in themes if slug in x["name"].lower()]
        t = hit[0] if hit else None
    if t:
        key = f"astropress_theme_css_{t['id']}"
        if con.execute("select option_id from wp_options where option_name=?", (key,)).fetchone():
            con.execute("update wp_options set option_value=? where option_name=?", (css, key))
        else:
            con.execute("insert into wp_options(option_name,option_value,autoload) values(?,?,'no')", (key, css))
        print(slug, "ok ->", key)
    else:
        print(slug, "WARN: theme not in db")

con.commit(); con.close()
print("done")
