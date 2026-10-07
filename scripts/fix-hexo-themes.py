#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复新移植主题的两个校验问题：
1. loopTemplateId 'default' 非内置 → 按 showImage 改 default-with-image / default-no-image（文件 + DB schema）
2. 适配层标记 ap-nav-adapter → ap-adapter（theme.css 文件 + DB css）
"""
import json, os, re, sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "local.db")
SLUGS = ["stack", "ayer", "butterfly", "fluid", "icarus", "keep", "mengd", "next", "redefine", "volantis"]

# ── 1. 文件修复 ──────────────────────────────────────────────────────
for slug in SLUGS:
    d = os.path.join(ROOT, "wp-themes", f"{slug}-theme")
    for rel in ("templates/archive.json", "templates/search.json", "pages/home.json"):
        p = os.path.join(d, rel)
        data = json.load(open(p, encoding="utf-8"))
        changed = False
        for b in data.get("blocks", []):
            props = b.get("props", {})
            if props.get("loopTemplateId") == "default":
                props["loopTemplateId"] = "default-with-image" if props.get("showImage") else "default-no-image"
                changed = True
        if changed:
            json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            print("fix file", slug, rel)
    css_path = os.path.join(d, "theme.css")
    css = open(css_path, encoding="utf-8").read()
    if "ap-nav-adapter" in css:
        css = css.replace("ap-nav-adapter", "ap-adapter")
        open(css_path, "w", encoding="utf-8").write(css)
        print("fix markers", slug)

# ── 2. DB 同步 ───────────────────────────────────────────────────────
con = sqlite3.connect(DB, timeout=10)
# 2a. theme css
row = con.execute("select option_value from wp_options where option_name='astropress_themes'").fetchone()
themes = json.loads(row[0])
for slug in SLUGS:
    t = next((x for x in themes if slug in x["name"].lower()), None)
    if not t:
        continue
    key = f"astropress_theme_css_{t['id']}"
    css = open(os.path.join(ROOT, "wp-themes", f"{slug}-theme", "theme.css"), encoding="utf-8").read()
    if con.execute("select option_id from wp_options where option_name=?", (key,)).fetchone():
        con.execute("update wp_options set option_value=? where option_name=?", (css, key))
# 2b. 导入的模板 schema 中的 loopTemplateId
rows = con.execute("select option_name, option_value from wp_options where option_name like 'astropress_page_schema___%'").fetchall()
n = 0
for name, val in rows:
    if '"loopTemplateId":"default"' in val or '"loopTemplateId": "default"' in val:
        new = re.sub(r'"loopTemplateId"\s*:\s*"default"', '"loopTemplateId":"default-with-image"', val)
        # showImage=false 的改为 no-image
        try:
            obj = json.loads(new)
            for b in obj.get("blocks", []):
                pr = b.get("props", {})
                if pr.get("loopTemplateId") == "default-with-image" and not pr.get("showImage"):
                    pr["loopTemplateId"] = "default-no-image"
            new = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            pass
        con.execute("update wp_options set option_value=? where option_name=?", (new, name))
        n += 1
con.commit(); con.close()
print(f"db synced, {n} schemas fixed")
