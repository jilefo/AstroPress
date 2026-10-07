#!/usr/bin/env python3
"""独立校验 wp-themes/ 下的 AstroPress 主题包。

刻意不复用 scripts/audit-themes.mjs —— 审计器负责"发现问题"，本脚本负责
"确认修复结果"，两套实现互相交叉验证，避免同一个逻辑错误被复制两次。

用法:
    python scripts/verify-themes.py

退出码: 0 = 全部通过；1 = 存在 FAIL 项。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES_DIR = ROOT / "wp-themes"
BASE_THEME = THEMES_DIR / "base-theme.json"

ADAPTER_OPEN = "/* >>> ap-adapter >>> */"
ADAPTER_CLOSE = "/* <<< ap-adapter <<< */"

# manifest.tokens 必须完备，否则 upload.ts 直接返回 400
TOKEN_SHAPE = {
    "colors": ("primary", "secondary", "background", "surface", "text", "textMuted", "border"),
    "fonts": ("heading", "body"),
    "spacing": ("sectionY", "containerMax", "borderRadius"),
}

# BlockRenderer 只认这 4 个内置循环卡片模板
LOOP_TEMPLATES = {
    "default-with-image",
    "default-no-image",
    "default-horizontal",
    "default-magazine",
}

# base-theme.json 里 nav 块曾经写错的 prop（渲染器全部忽略）
NAV_BOGUS_PROPS = {
    "logo", "logoSize", "sticky", "links",
    "background", "textColor", "borderBottom",
}

# 通用字体族，不需要远程加载
GENERIC_FAMILIES = {
    "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto",
    "helvetica neue", "helvetica", "arial", "sans-serif", "serif", "monospace",
    "cursive", "fantasy", "georgia", "times new roman", "times", "courier new",
    "courier", "consolas", "monaco", "menlo", "ui-sans-serif", "ui-serif",
    "ui-monospace", "pingfang sc", "hiragino sans gb", "microsoft yahei",
    "simsun", "inter", "inherit", "initial", "unset", "revert",
}

failures: list[str] = []
warnings: list[str] = []
checks = 0


def fail(msg: str) -> None:
    failures.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def first_rule_index(css: str) -> int:
    """第一处 `selector {` 的位置；用来校验 @import 的先后顺序。"""
    m = re.search(r"[^\s@][^{}]*\{", css)
    return m.start() if m else -1


def parse_families(value: str) -> list[str]:
    if not isinstance(value, str):
        return []
    cleaned = re.sub(r"var\([^)]*\)", "", value)
    out = []
    for part in cleaned.split(","):
        name = part.strip().strip("'\"")
        # 丢弃空串与函数式取值（如 linear-gradient(...)）
        if name and "(" not in name and ")" not in name:
            out.append(name.lower())
    return out


def walk_blocks(node, out: list[dict]) -> None:
    """递归收集所有 { type, props } 形态的 block。"""
    if isinstance(node, dict):
        if isinstance(node.get("type"), str) and isinstance(node.get("props"), dict):
            out.append(node)
        for v in node.values():
            walk_blocks(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_blocks(v, out)


def check_json_integrity(theme_dir: Path) -> int:
    """该主题包下所有 JSON 必须可解析，且不得残留 default-card。"""
    n = 0
    for jf in sorted(theme_dir.rglob("*.json")):
        n += 1
        text = jf.read_text(encoding="utf-8")
        rel = jf.relative_to(theme_dir)
        try:
            json.loads(text)
        except Exception as exc:  # noqa: BLE001
            fail(f"{theme_dir.name}: {rel} JSON 解析失败 -> {exc}")
            continue
        if "default-card" in text:
            fail(f"{theme_dir.name}: {rel} 残留 loopTemplateId=default-card")
    return n


def check_manifest(theme_dir: Path) -> dict:
    mpath = theme_dir / "manifest.json"
    if not mpath.exists():
        fail(f"{theme_dir.name}: 缺少 manifest.json")
        return {}
    try:
        man = json.loads(mpath.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        fail(f"{theme_dir.name}: manifest.json 解析失败 -> {exc}")
        return {}

    for key in ("name", "version", "tokens"):
        if not man.get(key):
            fail(f"{theme_dir.name}: manifest 缺少必需字段 {key}")

    # upload.ts 会用 templates/ 与 pages/ 目录的结果覆盖这两个字段，
    # 内联数组是死数据且容易与真实内容不一致
    for key in ("templates", "pages"):
        if man.get(key):
            fail(f"{theme_dir.name}: manifest 仍含内联 {key}（upload.ts 会覆盖，属死数据）")

    tokens = man.get("tokens") or {}
    for group, keys in TOKEN_SHAPE.items():
        got = tokens.get(group) or {}
        missing = [k for k in keys if not got.get(k)]
        if missing:
            fail(f"{theme_dir.name}: tokens.{group} 缺少 {missing}")
    return tokens


def check_css(theme_dir: Path) -> dict:
    css_path = theme_dir / "theme.css"
    if not css_path.exists():
        fail(f"{theme_dir.name}: 缺少 theme.css")
        return {}
    css = css_path.read_text(encoding="utf-8")
    live = strip_comments(css)

    if css.count(ADAPTER_OPEN) != 1 or css.count(ADAPTER_CLOSE) != 1:
        fail(
            f"{theme_dir.name}: 适配层标记数量异常 "
            f"(open={css.count(ADAPTER_OPEN)}, close={css.count(ADAPTER_CLOSE)})"
        )

    if live.count("{") != live.count("}"):
        fail(
            f"{theme_dir.name}: theme.css 花括号不平衡 "
            f"({{={live.count('{')}, }}={live.count('}')})"
        )

    imp = live.find("@import")
    rule = first_rule_index(live)
    if imp != -1 and rule != -1 and imp > rule:
        fail(f"{theme_dir.name}: @import 位于其它规则之后，浏览器会整条忽略")

    # 适配层不应留下"定义了但从未使用"的 --ap-* 变量（生成器死代码）
    defs = set(re.findall(r"(--ap-[a-zA-Z0-9_-]+)\s*:", live))
    uses = set(re.findall(r"var\(\s*(--ap-[a-zA-Z0-9_-]+)", live))
    dead = sorted(defs - uses)
    if dead:
        fail(f"{theme_dir.name}: 适配层存在未使用的变量 {dead}")

    # 引用了非通用字体就必须真的有 @import / @font-face
    declared: set[str] = set()
    for m in re.finditer(r"font-family\s*:\s*([^;}]+)", live):
        declared.update(parse_families(m.group(1)))
    remote = {f for f in declared if f not in GENERIC_FAMILIES}
    loads = bool(re.search(r"@import\s+url\(|@font-face", css))
    if remote and not loads:
        warn(f"{theme_dir.name}: 引用字体 {sorted(remote)} 但未加载（会回退系统字体）")

    return {"defs": len(defs), "uses": len(uses), "loaded_fonts": loads}


def check_loop_templates(theme_dir: Path) -> None:
    for sub in ("templates", "pages"):
        folder = theme_dir / sub
        if not folder.is_dir():
            continue
        for jf in sorted(folder.glob("*.json")):
            try:
                data = json.loads(jf.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                continue  # 已由 check_json_integrity 报错
            for block in [] if not data else _blocks(data):
                tid = block.get("props", {}).get("loopTemplateId")
                if tid and tid not in LOOP_TEMPLATES:
                    fail(
                        f"{theme_dir.name}: {jf.name} loopTemplateId={tid!r} 不是内置模板 "
                        f"{sorted(LOOP_TEMPLATES)}，渲染器会静默回退"
                    )


def _blocks(data) -> list[dict]:
    out: list[dict] = []
    walk_blocks(data, out)
    return out


# ── 对比度（WCAG AA） ───────────────────────────────────────────────────────
# 前台配色有三处副本：manifest.tokens / 主题自带 :root / 适配层 --ap-* 快照。
# BaseLayout 注入的 token 会覆盖主题 :root 的同名变量，却覆盖不到 --ap-*，
# 而 --ap-* 才是 .ap-block-* 规则真正吃到的值 —— 因此以适配层快照为准做校验。
WCAG_TEXT = 4.5  # 正文、链接、按钮文字
WCAG_UI = 3.0    # 非文本 / 大号文本（后台预览按钮底色）


def _hex_rgb(value) -> tuple[int, int, int] | None:
    if not isinstance(value, str):
        return None
    s = value.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6 or any(c not in "0123456789abcdefABCDEF" for c in s):
        return None
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def _rel_luminance(value) -> float | None:
    rgb = _hex_rgb(value)
    if rgb is None:
        return None
    out = []
    for c in rgb:
        v = c / 255
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]


def contrast_ratio(fg, bg) -> float | None:
    lf, lb = _rel_luminance(fg), _rel_luminance(bg)
    if lf is None or lb is None:
        return None
    hi, lo = max(lf, lb), min(lf, lb)
    return (hi + 0.05) / (lo + 0.05)


def check_contrast(theme_dir: Path, tokens: dict) -> int:
    """校验前台真正会渲染的配色对是否达到 WCAG AA，返回受检配色对数量。"""
    css_path = theme_dir / "theme.css"
    if not css_path.exists():
        return 0
    css = css_path.read_text(encoding="utf-8")
    # 适配层标记本身也是注释，必须先定位标记再剥离注释，否则标记会一并消失。
    idx = css.find(ADAPTER_OPEN)
    if idx == -1:
        return 0

    block = re.search(r":root\s*\{([^}]*)\}", strip_comments(css[idx:]))
    if not block:
        return 0
    adv = {
        k: v.strip()
        for k, v in re.findall(r"(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)", block.group(1))
    }

    colors = tokens.get("colors") or {}
    pairs = [
        ("正文 text / background", adv.get("--ap-text"), adv.get("--ap-bg"), WCAG_TEXT),
        ("次要文字 muted / background", adv.get("--ap-muted"), adv.get("--ap-bg"), WCAG_TEXT),
        ("次要文字 muted / surface", adv.get("--ap-muted"), adv.get("--ap-surface"), WCAG_TEXT),
        ("链接 primary / background", adv.get("--ap-primary"), adv.get("--ap-bg"), WCAG_TEXT),
        ("链接 primary / surface", adv.get("--ap-primary"), adv.get("--ap-surface"), WCAG_TEXT),
        ("按钮文字 #fff / primary", "#ffffff", adv.get("--ap-primary"), WCAG_TEXT),
        ("导航文字 #fff / primary-hover", "#ffffff", adv.get("--ap-primary-hover"), WCAG_TEXT),
        ("后台预览 #fff / secondary", "#ffffff", colors.get("secondary"), WCAG_UI),
    ]

    checked = 0
    for label, fg, bg, need in pairs:
        ratio = contrast_ratio(fg, bg)
        if ratio is None:
            warn(f"{theme_dir.name}: 无法计算对比度「{label}」(fg={fg!r}, bg={bg!r})")
            continue
        checked += 1
        if ratio < need:
            fail(f"{theme_dir.name}: 「{label}」对比度 {ratio:.2f}:1 低于 {need}:1")
    return checked


def check_base_theme() -> None:
    if not BASE_THEME.exists():
        fail("wp-themes/base-theme.json 不存在")
        return
    try:
        base = json.loads(BASE_THEME.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        fail(f"base-theme.json 解析失败 -> {exc}")
        return

    by_type: dict[str, list[dict]] = {}
    for schema in (base.get("schemas") or {}).values():
        for block in schema.get("blocks") or []:
            by_type.setdefault(block.get("type"), []).append(block.get("props") or {})

    for props in by_type.get("nav", []):
        bogus = sorted(NAV_BOGUS_PROPS & set(props))
        if bogus:
            fail(f"base-theme.json nav 仍含渲染器会忽略的 prop {bogus}")
        if "logoText" not in props:
            fail("base-theme.json nav 缺少 logoText（否则不显示站点名）")

    for props in by_type.get("html", []):
        if "content" not in props:
            fail(f"base-theme.json html 块缺少 content，实际 props={sorted(props)}")


def main() -> int:
    global checks

    if not THEMES_DIR.is_dir():
        print(f"找不到 {THEMES_DIR}")
        return 1

    theme_dirs = sorted(p for p in THEMES_DIR.iterdir() if p.is_dir())
    json_total = 0
    css_ok = 0
    contrast_pairs = 0

    for theme_dir in theme_dirs:
        checks += 1
        json_total += check_json_integrity(theme_dir)
        tokens = check_manifest(theme_dir)
        css_stats = check_css(theme_dir)
        if css_stats:
            css_ok += 1
        contrast_pairs += check_contrast(theme_dir, tokens)
        check_loop_templates(theme_dir)

    check_base_theme()

    out: list[str] = []
    out.append("=" * 68)
    out.append("wp-themes 主题包独立校验（Python）")
    out.append("=" * 68)
    out.append(f"主题目录数          : {len(theme_dirs)}")
    out.append(f"JSON 文件数         : {json_total}")
    out.append(f"含适配层的 theme.css: {css_ok}")
    out.append(f"对比度达标配色对    : {contrast_pairs} (WCAG AA)")
    out.append(f"FAIL                : {len(failures)}")
    out.append(f"WARN                : {len(warnings)}")

    if failures:
        out.append("")
        out.append("-- FAIL --")
        out.extend(f"  ! {msg}" for msg in failures)
    if warnings:
        out.append("")
        out.append("-- WARN --")
        out.extend(f"  - {msg}" for msg in warnings)
    if not failures and not warnings:
        out.append("")
        out.append("全部通过。")

    report = "\n".join(out)

    # Some CI/sandbox environments do not capture Python's stdout, so always
    # also write the report to a file when a path is given.
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(report, encoding="utf-8")

    print(report)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
