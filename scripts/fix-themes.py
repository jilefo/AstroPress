#!/usr/bin/env python3
"""AstroPress 主题包可读性修复器（Python）

针对 wp-themes/ 下 34 个主题包在「真实运行时」下的对比度缺陷做定点修复。
背景（来自 apps/web/src/layouts/BaseLayout.astro + BlockRenderer.astro）：

  * BaseLayout 在 <head> 最后注入 :root{--color-*}，因此主题自带 :root 里的
    同名变量会被 token 覆盖；而适配层里的 --ap-* 是「快照字面量」，不受覆盖，
    才是 .ap-block-* 规则真正吃到的颜色。
  * 因此同一套配色存在三处副本：manifest.tokens / 主题自带 :root / 适配层 --ap-*。
    三者必须一起改，否则修了 token 前台依旧不可读。

修复项（全部只降明度，保持色相与饱和度）：

  C1  text / textMuted        —— 正文与小字，需 >= 4.5:1（AA 正文）
  C2  primary                 —— 链接/正文强调色（需对上背景 >= 4.5:1）
                                 且作为按钮底色时白字需 >= 4.5:1
  C3  primary-hover           —— 适配层吸顶导航 a:hover，需 >= 4.5:1
  C4  accent                  —— 适配层 .ap-block a:hover，需 >= 4.5:1
  C5  secondary               —— 后台主题预览按钮底色，白字需 >= 3:1（UI 组件）

实现方式：先从适配层 --ap-* 与主题 :root 解析出真实旧色，算出新色，得到一张
「旧色 -> 新色」映射表，然后把该表应用到主题包下 theme.css + 全部 *.json
（token、模板与页面的 html 块内联样式都会被一并同步，避免同色两值）。

作用范围限定：只改「前台真正会渲染的浅色调色板」。以下区域一律原样保留——
  * CSS 注释（含适配层里被注释掉的深色块）；
  * .dark / [data-theme=...] / @media (prefers-color-scheme: dark) 作用域。
理由：这些深色谱在当前平台永不生效（App 不会添加 .dark 类或 data-theme 属性），
若按「提高浅底对比度」的规则去压暗，只会变成日后启用深色时的隐患。

幂等：已达标颜色不进入映射表，可重复运行。

用法:
    python scripts/fix-themes.py --dry-run        # 只预览
    python scripts/fix-themes.py                  # 实际写入
    python scripts/fix-themes.py --only=ztheme    # 只处理名字含 ztheme 的包
"""

from __future__ import annotations

import colorsys
import json
import re
import sys
from pathlib import Path

# Windows 控制台默认 GBK，报告里的框图字符会炸；统一强制 UTF-8。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
THEMES_DIR = ROOT / "wp-themes"
ADAPTER_MARK = "/* >>> ap-adapter >>> */"

AA_TEXT = 4.5  # WCAG AA 正文
AA_UI = 3.0    # WCAG AA 非文本 / 大号文本（UI 组件）

DRY = "--dry-run" in sys.argv
ONLY = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)

_HEX_TOKEN = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_VAR_DECL = re.compile(r"(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)(?=[;}])")
_ROOT_BLOCK = re.compile(r":root\s*\{([^}]*)\}", re.S)


# ── 颜色工具 ────────────────────────────────────────────────────────────────

def norm_hex(value: object) -> str | None:
    """任意 CSS 颜色字面量 -> 归一化 6 位小写 #rrggbb；非纯 hex 返回 None。"""
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s.startswith("#"):
        return None
    s = s[1:]
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6 or any(c not in "0123456789abcdefABCDEF" for c in s):
        return None
    return "#" + s.lower()


def _channels(value: object) -> tuple[int, int, int] | None:
    h = norm_hex(value)
    if h is None:
        return None
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def _linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(value: object) -> float | None:
    if isinstance(value, tuple) and len(value) == 3:
        rgb = value
    else:
        rgb = _channels(value)
    if rgb is None:
        return None
    r, g, b = (x / 255 for x in rgb)
    return 0.2126 * _linear(r) + 0.7152 * _linear(g) + 0.0722 * _linear(b)


def contrast(a: object, b: object) -> float:
    la, lb = luminance(a), luminance(b)
    if la is None or lb is None:
        return 0.0
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def darken(color: str, ok, step: float = 0.004) -> str:
    """保持 H/S 不变、逐步降低 HLS 明度，直到 ok(candidate) 成立。"""
    channels = _channels(color)
    if channels is None or ok(color):
        return color
    h, l, s = colorsys.rgb_to_hls(*(x / 255 for x in channels))
    while l > 0:
        l = max(0.0, l - step)
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        cand = "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))
        if ok(cand):
            return cand
    return "#000000"


def on_light(bgs: list[str], ratio: float):
    """候选色对每个浅色背景都要达到 ratio。"""
    def ok(c: str) -> bool:
        return all(contrast(c, b) >= ratio for b in bgs)
    return ok


def under_white(ratio: float):
    """白字压在候选色上要 >= ratio。"""
    def ok(c: str) -> bool:
        return contrast("#ffffff", c) >= ratio
    return ok


# ── CSS 解析 ────────────────────────────────────────────────────────────────

def head_css(css: str) -> str:
    i = css.find(ADAPTER_MARK)
    return css if i == -1 else css[:i]


def adapter_root_vars(css: str) -> dict[str, str]:
    """适配层第一个 :root{} 里的 --ap-* 快照。"""
    tail = css[css.find(ADAPTER_MARK):] if ADAPTER_MARK in css else ""
    m = _ROOT_BLOCK.search(tail)
    if not m:
        return {}
    return {k: v.strip() for k, v in _VAR_DECL.findall(m.group(1))}


def theme_root_vars(css: str) -> dict[str, str]:
    """主题自带 CSS 中所有 :root{} 的变量（首个生效值）。"""
    out: dict[str, str] = {}
    for block in _ROOT_BLOCK.findall(head_css(css)):
        for k, v in _VAR_DECL.findall(block):
            out.setdefault(k, v.strip())
    return out


def resolve_var(value: str, theme_root: dict[str, str]) -> str | None:
    """把 `var(--color-accent, #ec4899)` 解析成主题 :root 里的真实值。"""
    m = re.fullmatch(r"var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*(.+?))?\s*\)", value.strip())
    if not m:
        return value.strip()
    name, fallback = m.group(1), m.group(2)
    return theme_root.get(name) or (fallback.strip() if fallback else None)


# ── 修复 ────────────────────────────────────────────────────────────────────

def build_remap(adapter: dict[str, str], theme_root: dict[str, str], tokens: dict) -> tuple[dict[str, str], list[str]]:
    """返回 (旧色->新色 映射表, 可读日志)。"""
    bg = norm_hex(adapter.get("--ap-bg")) or norm_hex(tokens.get("background")) or "#ffffff"
    surface = norm_hex(adapter.get("--ap-surface")) or norm_hex(tokens.get("surface")) or bg
    bgs = sorted({bg, surface})

    pairs: list[tuple[str, str, str, str]] = []  # (用途, 旧色, 新色, 阈值说明)

    def add(label: str, old: object, predicate, note: str) -> None:
        o = norm_hex(old)
        if o is None:
            return
        n = darken(o, predicate)
        pairs.append((label, o, n, note))

    add("text", adapter.get("--ap-text") or tokens.get("text"),
        on_light(bgs, AA_TEXT), f"{AA_TEXT}:1 正文")
    add("muted", adapter.get("--ap-muted") or tokens.get("textMuted"),
        on_light(bgs, AA_TEXT), f"{AA_TEXT}:1 次要文字")
    add("primary", adapter.get("--ap-primary") or tokens.get("primary"),
        lambda c: on_light(bgs, AA_TEXT)(c) and under_white(AA_TEXT)(c), f"{AA_TEXT}:1 链接+按钮")
    add("primary-hover", adapter.get("--ap-primary-hover"),
        lambda c: on_light(bgs, AA_TEXT)(c) and under_white(AA_TEXT)(c), f"{AA_TEXT}:1 hover")
    accent_raw = resolve_var(adapter.get("--ap-accent", ""), theme_root)
    add("accent", accent_raw, on_light(bgs, AA_TEXT), f"{AA_TEXT}:1 a:hover")
    add("secondary", tokens.get("secondary"), under_white(AA_UI), f"{AA_UI}:1 按钮底色")

    table: dict[str, str] = {}
    log: list[str] = []
    for label, old, new, note in pairs:
        if old == new:
            continue
        if old in table and table[old] != new:
            continue  # 同色被两个用途引用且结论不同：保留首个，避免自相矛盾
        table[old] = new
        log.append(f"{label:<13} {old} -> {new}   (需 {note})")
    return table, log


def remap_text(text: str, table: dict[str, str]) -> str:
    if not table:
        return text

    def sub(m: re.Match[str]) -> str:
        raw = m.group(0)
        if len(raw) == 9:  # #rrggbbaa：保留 alpha
            base, alpha = raw[:7], raw[7:].lower()
        else:
            base, alpha = raw, ""
        key = norm_hex(base)
        new = table.get(key) if key else None
        return (new + alpha) if new else raw

    return _HEX_TOKEN.sub(sub, text)


# ── 受保护区（注释 + 深色作用域） ────────────────────────────────────────────

_SCOPE_HINT = re.compile(r"\.dark\b|\[data-theme|prefers-color-scheme\s*:\s*dark", re.I)
_COMMENT = re.compile(r"/\*[\s\S]*?\*/")


def _merge(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for s, e in sorted(spans):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def _dark_scopes(text: str) -> list[tuple[int, int]]:
    """按选择器定位 .dark / [data-theme] / prefers-color-scheme:dark 的整块区间。

    注释先等长替换成空格，保证偏移量与原文对齐。
    """
    masked = _COMMENT.sub(lambda m: " " * len(m.group(0)), text)
    spans: list[tuple[int, int]] = []
    depth = 0
    block_start = 0
    for i, ch in enumerate(masked):
        if ch == "{":
            if depth == 0 and _SCOPE_HINT.search(masked[block_start:i]):
                d, end = 0, i
                while end < len(masked):
                    if masked[end] == "{":
                        d += 1
                    elif masked[end] == "}":
                        d -= 1
                        if d == 0:
                            break
                    end += 1
                spans.append((block_start, min(end + 1, len(masked))))
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
            if depth == 0:
                block_start = i + 1
    return spans


def remap_protected(text: str, table: dict[str, str]) -> str:
    """替换颜色，但跳过注释与深色作用域。"""
    if not table:
        return text
    spans = _merge([m.span() for m in _COMMENT.finditer(text)] + _dark_scopes(text))
    if not spans:
        return remap_text(text, table)
    out: list[str] = []
    cursor = 0
    for s, e in spans:
        if s > cursor:
            out.append(remap_text(text[cursor:s], table))
        out.append(text[s:e])  # 受保护区原样保留
        cursor = max(cursor, e)
    out.append(remap_text(text[cursor:], table))
    return "".join(out)


def main() -> int:
    if not THEMES_DIR.is_dir():
        print(f"找不到 {THEMES_DIR}")
        return 1

    dirs = sorted(p for p in THEMES_DIR.iterdir() if p.is_dir())
    if ONLY:
        dirs = [d for d in dirs if ONLY in d.name]

    changed_themes = 0
    touched_files = 0

    for d in dirs:
        css_path, man_path = d / "theme.css", d / "manifest.json"
        missing = [p.name for p in (css_path, man_path) if not p.exists()]
        if missing:
            print(f"  ! {d.name}: 缺少 {', '.join(missing)}，跳过")
            continue

        css = css_path.read_text(encoding="utf-8")
        if ADAPTER_MARK not in css:
            print(f"  ! {d.name}: theme.css 没有适配层，跳过")
            continue

        try:
            manifest = json.loads(man_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {d.name}: manifest.json 解析失败 -> {exc}")
            continue

        table, log = build_remap(
            adapter_root_vars(css), theme_root_vars(css), manifest.get("tokens", {}).get("colors", {}) or {}
        )
        if not table:
            continue

        changed_themes += 1
        print(f"\n▸ {d.name}")
        for line in log:
            print(f"    · {line}")

        if DRY:
            continue

        for path in [css_path, *sorted(d.rglob("*.json"))]:
            src = path.read_text(encoding="utf-8")
            # CSS 要避开注释与深色作用域；JSON 里只有浅色 token / 内联样式，直接映射。
            out = remap_protected(src, table) if path.suffix == ".css" else remap_text(src, table)
            if out != src:
                path.write_text(out, encoding="utf-8")
                touched_files += 1

    print("\n" + "=" * 72)
    print(f"{'[dry-run] ' if DRY else ''}主题 {len(dirs)} 个，需修复 {changed_themes} 个，写入文件 {touched_files} 个")
    if DRY:
        print("未写入任何文件。去掉 --dry-run 以实际应用。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
