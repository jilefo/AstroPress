#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AstroPress 主题包第二轮优化器（pass-2，在 fix-themes.mjs 的产物之上运行）

解决 pass-1 适配层"34 个主题同一套模板"的失真问题，按每个主题原始 CSS
自带的设计语言生成差异化适配层：

  O1  卡片语言识别与还原
        list   —— .post-list-item 仅底部分隔线（如 hello-elementor / twentytwelve）
        border —— 边框 + 底色卡片，无阴影（如 aiphoto / sakurairo / yesterday）
        shadow —— 带阴影 + 悬浮抬升，阴影颜色/位移取主题原值（如 argon / lyrargon）
      list 类用 !important 中和 query-loop 内联的卡片壳（背景/边框/圆角/间距）。

  O2  从原 CSS 提取设计特征：卡片阴影/抬升、导航高度、标题字重/颜色、正文字号行高、
      链接装饰、引用块样式、圆角、过渡时长、衬线标题字距 —— 全部数据驱动。

  O3  字体 @import 换国内可访问镜像（googleapis -> fonts.loli.net），
      避免大陆网络下 @import 阻塞渲染；jsDelivr（LXGW）保持不变。

  O4  保守清理永不命中前台真实 DOM 的死规则（.nav-bar/.main-container/.post-card/
      .sidebar-*/.article-title/.dark …），白名单驱动，只删"确定无效"的选择器。

幂等：与 fix-themes.mjs 共用 ap-fonts / ap-adapter 区块标记；死规则清理也是确定性的。
      建议顺序：fix-themes.mjs（pass-1） -> optimize-themes.py（pass-2）。

用法：
  python optimize-themes.py --analyze            # 只打印特征，不写盘
  python optimize-themes.py --dry-run            # 预览改动统计，不写盘
  python optimize-themes.py                      # 实际写入
  python optimize-themes.py --only=argon         # 只处理名字含 argon 的主题
  python optimize-themes.py --no-prune           # 只重生成适配层/字体，不清理死规则
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field, fields, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES_DIR = Path(os.environ.get("AP_THEMES_DIR", ROOT / "wp-themes"))

# ────────────────────────────────────────────────────────────────────────────
# 区块标记（与 fix-themes.mjs 一致，保证两轮脚本互相幂等）
# ────────────────────────────────────────────────────────────────────────────

REGION_RE = {
    "fonts": re.compile(
        r"/\* >>> ap-fonts >>> \*/[\s\S]*?/\* <<< ap-fonts <<< \*/\s*", re.M
    ),
    "adapter": re.compile(
        r"/\* >>> ap-adapter >>> \*/[\s\S]*?/\* <<< ap-adapter <<< \*/\s*", re.M
    ),
}

# ────────────────────────────────────────────────────────────────────────────
# 前台"真实可能出现"的 class 白名单（BlockRenderer.astro / BaseLayout.astro /
# web/src/pages 实际输出）。不在白名单的 class 规则视为死规则。
#   注意：用户富文本（.post-content 内）可能出现任意 class，但本批主题的骨架 CSS
#   只包含布局类，不包含 wp 正文类，故白名单可以收紧。
# ────────────────────────────────────────────────────────────────────────────

CLASS_PREFIX_KEEP = ("site-", "ap-block", "wp-block")
CLASS_EXACT_KEEP = {
    # BaseLayout 兜底结构
    "site-header", "site-wrapper", "site-branding", "site-description",
    "site-nav", "site-main", "site-footer",
    # 博客列表 / 正文（apps/web/src/pages）
    "post-header", "post-content", "post-meta", "post-excerpt",
    "post-list", "post-list-item", "post-list-item-title",
    "post-list-item-meta", "post-list-item-excerpt",
    "read-more", "pagination", "current", "not-found",
}

CLASS_RE = re.compile(r"\.([A-Za-z0-9_-]+)")
HAS_ID_RE = re.compile(r"#[A-Za-z0-9_-]")
HAS_ATTR_RE = re.compile(r"\[[^]]+\]")


# ────────────────────────────────────────────────────────────────────────────
# CSS 结构解析（极简：仅支持本批文件的形态 —— 顶层规则 + 一层 @media）
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class Rule:
    selector: str
    body: str
    raw: str          # 含选择器与花括号的原文
    prefix: str = ""  # 该规则前面的空白/注释


@dataclass
class Media:
    query: str
    rules: list[Rule] = field(default_factory=list)
    prefix: str = ""


def _scan_statements(css: str):
    """把 CSS 切成顶层 (kind, payload, leading) 序列。

    kind: "rule" -> Rule；"media" -> Media；"raw" -> 原样保留文本（注释/空白/@import 等）
    """
    out = []
    i = 0
    n = len(css)
    while i < n:
        # 保留规则之间的空白与注释
        m = re.match(r"(\s*)(/\*[\s\S]*?\*/\s*)?", css[i:])
        lead = ""
        if m:
            lead = m.group(0)
            i += len(m.group(0))
        if i >= n:
            if lead.strip():
                out.append(("raw", lead))
            break

        # @media 块（本批文件只有一层嵌套）
        if css.startswith("@media", i):
            open_brace = css.index("{", i)
            query = css[i:open_brace].strip()
            depth = 0
            j = open_brace
            while j < n:
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            inner = css[open_brace + 1:j]
            media = Media(query=query)
            media.prefix = lead
            inner_i = 0
            pending_lead = ""
            for r in _iter_plain_rules(inner):
                r.prefix = r.prefix if r.prefix.strip() else pending_lead
                media.rules.append(r)
                pending_lead = ""
            out.append(("media", media))
            i = j + 1
            continue

        # @import / @keyframes / @font-face 等原样保留
        if css[i] == "@":
            semi = css.find(";", i)
            brace = css.find("{", i)
            if semi != -1 and (brace == -1 or semi < brace):
                out.append(("raw", lead + css[i:semi + 1]))
                i = semi + 1
                continue

        # 普通规则
        brace = css.find("{", i)
        if brace == -1:
            tail = css[i:]
            if tail.strip():
                out.append(("raw", lead + tail))
            elif lead.strip():
                out.append(("raw", lead))
            break
        depth = 0
        j = brace
        while j < n:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        selector = css[i:brace].strip()
        body = css[brace + 1:j]
        out.append(("rule", Rule(selector=selector, body=body,
                                 raw=css[i:j + 1], prefix=lead)))
        i = j + 1
    return out


def _iter_plain_rules(css: str):
    """一层花括号规则枚举（@media 内部使用），保留前导空白。"""
    i = 0
    n = len(css)
    while i < n:
        m = re.match(r"\s*", css[i:])
        lead = m.group(0)
        i += len(lead)
        # 内联注释
        cm = re.match(r"/\*[\s\S]*?\*/\s*", css[i:])
        if cm:
            lead += cm.group(0)
            i += len(cm.group(0))
        if i >= n:
            break
        brace = css.find("{", i)
        if brace == -1:
            break
        depth = 0
        j = brace
        while j < n:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        yield Rule(
            selector=css[i:brace].strip(),
            body=css[brace + 1:j],
            raw=css[i:j + 1],
            prefix=lead,
        )
        i = j + 1


# ────────────────────────────────────────────────────────────────────────────
# 死规则判定
# ────────────────────────────────────────────────────────────────────────────

def _class_keepable(name: str) -> bool:
    if name.startswith(CLASS_PREFIX_KEEP):
        return True
    if name in CLASS_EXACT_KEEP:
        return True
    if name.startswith("post-list"):
        return True
    return False


def _selector_alive(selector: str) -> bool:
    """单个选择器是否可能命中前台。保守判定：不含任何 class/id/属性 选择器
    的（纯元素/伪类/::selection/:root）一律保留；含 class 的必须全部白名单。"""
    s = selector.strip()
    if not s:
        return True
    if HAS_ID_RE.search(s) or HAS_ATTR_RE.search(s):
        return False
    classes = CLASS_RE.findall(s)
    if not classes:
        return True
    return all(_class_keepable(c) for c in classes)


def _rule_alive(rule: Rule) -> bool:
    parts = [p.strip() for p in rule.selector.split(",") if p.strip()]
    return any(_selector_alive(p) for p in parts)


def prune_css(css: str) -> tuple[str, int, int]:
    """返回 (新css, 删除规则数, 删除字节数)。"""
    removed_rules = 0
    removed_bytes = 0
    chunks = _scan_statements(css)
    out_parts: list[str] = []

    for kind, payload in chunks:
        if kind == "raw":
            out_parts.append(payload)
            continue

        if kind == "rule":
            r: Rule = payload
            if _rule_alive(r):
                out_parts.append(r.prefix + r.raw)
            else:
                removed_rules += 1
                removed_bytes += len(r.prefix) + len(r.raw)
            continue

        if kind == "media":
            media: Media = payload
            kept: list[str] = []
            for r in media.rules:
                if _rule_alive(r):
                    kept.append(r.prefix + r.raw)
                else:
                    removed_rules += 1
                    removed_bytes += len(r.prefix) + len(r.raw)
            if kept:
                out_parts.append(
                    f"{media.prefix}@media {media.query} {{\n"
                    + "".join(kept)
                    + "\n}"
                )
    text = "".join(out_parts)
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    return text, removed_rules, removed_bytes


# ────────────────────────────────────────────────────────────────────────────
# 设计特征提取
# ────────────────────────────────────────────────────────────────────────────

PROP_RE = r"(?:^|;)\s*{prop}\s*:\s*([^;]+)"


def _props(body: str) -> dict[str, str]:
    out = {}
    for m in re.finditer(r"([A-Za-z-]+)\s*:\s*([^;}]+)", body):
        out.setdefault(m.group(1).strip().lower(), m.group(2).strip())
    return out


def _root_vars(css: str) -> dict[str, str]:
    vars_ = {}
    for m in re.finditer(r":root\s*\{([^}]*)\}", css):
        for d in re.finditer(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)", m.group(1)):
            vars_.setdefault(d.group(1), d.group(2).strip())
    return vars_


def _dark_block(css: str) -> str | None:
    """提取原 .dark / [data-theme=dark] 块的声明文本（适配层中以注释保留）。"""
    lines = []
    for m in re.finditer(r"([^{}]+)\{([^}]*)\}", css):
        sel = m.group(1).strip()
        if re.search(r'\.dark\b|data-theme\s*=\s*["\']?dark', sel):
            body = m.group(2)
            if "--color" in body:
                for d in re.finditer(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)", body):
                    lines.append(f"    {d.group(1)}: {d.group(2).strip()};")
    return "\n".join(lines) if lines else None


def _resolve(value: str | None, root: dict[str, str], depth: int = 0) -> str | None:
    if value is None or depth > 5:
        return value
    m = re.fullmatch(r"\s*var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)\s*", value)
    if not m:
        return value
    return _resolve(root.get(m.group(1)), root, depth + 1)


def _rule_map(css: str) -> dict[str, dict[str, str]]:
    """以"归一化选择器 -> props"收集规则（组选择器取首个）。"""
    out: dict[str, dict[str, str]] = {}
    for kind, payload in _scan_statements(css):
        if kind == "rule":
            rules = [payload]
        elif kind == "media":
            rules = payload.rules
        else:
            continue
        for r in rules:
            first = r.selector.split(",")[0].strip()
            out.setdefault(first, _props(r.body))
    return out


def _find_props(css: str, *selectors: str) -> dict[str, str] | None:
    rm = _rule_map(css)
    for s in selectors:
        if s in rm:
            return rm[s]
    # 退化：选择器可能带前缀（如 .post-content blockquote），按词界匹配，
    # 避免 ".post-list-item" 命中 ".post-list-item-title"
    for target in selectors:
        pat = re.compile(
            r"(?:^|[\s>+~,])" + re.escape(target) + r"(?=$|[\s:,+~.\[])"
        )
        for sel, props in rm.items():
            if pat.search(sel):
                return props
    return None


@dataclass
class Traits:
    card_style: str = "list"        # list / border / shadow
    card_has_border: bool = True    # border 类是否真有描边（mirage 为纯底色卡 False）
    card_shadow: str = "none"
    card_shadow_hover: str = "none"
    card_lift: str = "0px"          # hover translateY，0px = 原设计无位移
    radius: str = "8px"
    transition: str = "0.25s ease"
    nav_height: str = "64px"
    title_weight: str = "700"
    title_color_kind: str = "text"    # text / primary / custom
    title_color: str = ""
    heading_serif: bool = False
    heading_spacing: str = "-0.01em"
    body_line_height: str = "1.75"
    link_underline: bool = False
    quote_width: str = "4px"
    quote_color: str = "var(--ap-primary)"
    quote_radius: str = "0"
    image_radius: bool = True
    dark_text: str | None = None


def extract_traits(css: str, tokens: dict) -> Traits:
    root = _root_vars(css)
    t = Traits()

    def rv(name, default=None):
        return _resolve(root.get(name), root) or default

    t.radius = rv("--radius", "8px")
    t.transition = rv("--transition", "0.25s ease")

    # ── 卡片语言：标准类 + 主题自定义类（nirvana=.photo-card, wpno-vc=.novel-item）──
    card = _find_props(css, ".post-card", ".photo-card", ".post-list-item", ".novel-item")
    card_hover = _find_props(
        css, ".post-card:hover", ".photo-card:hover",
        ".post-list-item:hover", ".novel-item:hover",
    )
    hover_shadow = (card_hover or {}).get("box-shadow", "")
    hover_transform = (card_hover or {}).get("transform", "")

    if card:
        static_shadow = card.get("box-shadow", "")
        bg = (card.get("background") or card.get("background-color") or "").lower()
        # 完整四周边框才算描边卡；只有 border-bottom 的归列表流
        full_border = bool(re.search(r"\bsolid\b|\bdashed\b|\bdotted\b", card.get("border", "")))
        has_bg = bool(bg) and "transparent" not in bg and "var(--color-bg)" not in bg.replace(" ", "")
        has_shadow = static_shadow not in ("", "none") or hover_shadow not in ("", "none")

        if has_shadow:
            t.card_style = "shadow"
            if static_shadow not in ("", "none"):
                t.card_shadow = static_shadow
        elif has_bg:
            # surface 底色块 = 卡片（mirage 无描边，其余为完整边框卡）
            t.card_style = "border"
            t.card_has_border = full_border
        else:
            # 无底色无阴影（通常仅 border-bottom）→ 列表流
            t.card_style = "list"

    if hover_shadow and hover_shadow != "none":
        t.card_shadow_hover = hover_shadow
    m = re.search(r"translateY\(\s*(-?\d+(?:\.\d+)?px)\s*\)", hover_transform)
    if m:
        t.card_lift = m.group(1)

    if t.card_style == "shadow":
        if not hover_shadow or hover_shadow == "none":
            t.card_shadow_hover = "0 12px 28px rgba(0,0,0,.12)"
        if t.card_lift == "0px":
            t.card_lift = "-2px"
    elif t.card_style == "border":
        t.card_shadow = "none"
        t.card_shadow_hover = "none"
    else:
        t.card_shadow = "none"
        t.card_shadow_hover = "none"
        t.card_lift = "0px"

    # ── 导航高度 ──
    nav = _find_props(css, ".nav-inner", ".nav-bar")
    if nav and nav.get("height"):
        t.nav_height = nav["height"]

    # ── 标题字重 / 颜色 / 字体 ──
    art = _find_props(css, ".article-title")
    if art:
        t.title_weight = art.get("font-weight", t.title_weight)
        col = _resolve(art.get("color"), root)
        if col:
            primary = rv("--color-primary")
            text = rv("--color-text")
            if primary and col.replace(" ", "").lower() == primary.replace(" ", "").lower():
                t.title_color_kind = "primary"
            elif text and col.replace(" ", "").lower() == text.replace(" ", "").lower():
                t.title_color_kind = "text"
            else:
                t.title_color_kind = "custom"
                t.title_color = col

    head_family = rv("--font-heading", "") or ""
    body_family = rv("--font-body", "") or ""
    fam = (head_family + "," + body_family).lower()
    if re.search(r"serif|georgia|playfair|cormorant|literata|noto serif|lxgw|wenkai|courgette", fam):
        t.heading_serif = True
        t.heading_spacing = "0"
    # 手写体保持正常字距但字重不取粗
    if "courgette" in fam:
        t.heading_serif = True
        t.heading_spacing = "0"

    # ── 正文行高 ──
    body = _find_props(css, "body")
    if body and body.get("line-height"):
        t.body_line_height = body["line-height"]

    # ── 链接下划线 ──
    a = _find_props(css, "a")
    if a and "underline" in (a.get("text-decoration") or ""):
        t.link_underline = True

    # ── 引用块 ──
    q = _find_props(css, ".post-content blockquote", "blockquote")
    if q:
        blw = q.get("border-left-width")
        if blw:
            t.quote_width = blw
        elif q.get("border-left"):
            mm = re.match(r"(\d+px)", q["border-left"])
            if mm:
                t.quote_width = mm.group(1)
        blc = _resolve((q.get("border-left-color") or ""), root)
        if not blc:
            mm = re.search(r"(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|var\([^)]+\))", q.get("border-left", ""))
            blc = mm.group(1) if mm else None
        accent = rv("--color-accent")
        primary = rv("--color-primary")
        if blc:
            blc_n = blc.replace(" ", "").lower()
            if accent and blc_n == accent.replace(" ", "").lower():
                t.quote_color = "var(--ap-accent)"
            elif primary and blc_n == primary.replace(" ", "").lower():
                t.quote_color = "var(--ap-primary)"
            else:
                t.quote_color = blc
        t.quote_radius = q.get("border-radius", "0").split()[0] if q.get("border-radius") else "0"

    # ── 图片圆角 ──
    img = _find_props(css, "img")
    if img and ("border-radius" in img) and img["border-radius"].strip() in ("0", "0px"):
        t.image_radius = False
    if t.radius in ("0px", "0"):
        t.image_radius = False

    # ── 暗色块 ──
    t.dark_text = _dark_block(css)
    return t


# ────────────────────────────────────────────────────────────────────────────
# 配色快照（沿用 pass-1 的 collectFacts 逻辑）
# ────────────────────────────────────────────────────────────────────────────

TOKEN_OVERRIDDEN = {
    "--color-primary", "--color-primary-hover", "--color-bg", "--color-surface",
    "--color-border", "--color-text", "--color-muted", "--font-sans",
    "--font-heading", "--max-width", "--radius-md", "--radius-sm", "--section-y",
}


def collect_colors(css: str, tokens: dict) -> dict:
    root = _root_vars(css)
    tc = (tokens or {}).get("colors", {})

    def first(*names):
        return next((n for n in names if n in root), None)

    def val(*names, default=None):
        n = first(*names)
        return root[n] if n else default

    def ref(varname, literal):
        if not varname:
            return literal
        if varname in TOKEN_OVERRIDDEN:
            return literal
        return f"var({varname}, {literal})"

    primary = val("--color-primary", default=tc.get("primary", "#2271b1"))
    primary_hover = val("--color-primary-hover", default=primary)
    accent_n = first("--color-accent", "--color-secondary", "--color-link", "--link-color")
    accent = val("--color-accent", "--color-secondary", "--color-link", "--link-color",
                 default=primary)
    bg = val("--color-bg", "--background", "--bg-color", default=tc.get("background", "#ffffff"))
    surface = val("--color-surface", "--surface", default=tc.get("surface", "#f8f9fa"))
    border = val("--color-border", "--border-color", default=tc.get("border", "#e9ecef"))
    text = val("--color-text", default=tc.get("text", "#212529"))
    muted = val("--color-muted", "--color-text-muted", default=tc.get("textMuted", "#6c757d"))
    radius_n = first("--radius", "--radius-md", "--radius-base", "--border-radius", "--card-radius")
    radius = val("--radius", "--radius-md", "--radius-base", "--border-radius", "--card-radius",
                 default="8px")
    shadow_n = first("--shadow", "--shadow-md", "--card-shadow", "--box-shadow")
    shadow = val("--shadow", "--shadow-md", "--card-shadow", "--box-shadow",
                 default="0 2px 10px rgba(0,0,0,.06)")
    fb_n = first("--font-body", "--font-family", "--font-sans")
    fb = val("--font-body", "--font-family", "--font-sans", default="system-ui, sans-serif")
    fh_n = first("--font-heading", "--font-title")
    fh = val("--font-heading", "--font-title", default=fb)

    return {
        "primary": primary, "primaryHover": primary_hover,
        "accentRef": ref(accent_n, accent),
        "bg": bg, "surface": surface, "border": border, "text": text, "muted": muted,
        "radiusRef": ref(radius_n, radius),
        "shadowRef": ref(shadow_n, shadow),
        "fontBodyRef": ref(fb_n, fb),
        "fontHeadingRef": ref(fh_n, fh),
    }


# ────────────────────────────────────────────────────────────────────────────
# v2 适配层生成
# ────────────────────────────────────────────────────────────────────────────

def build_adapter(c: dict, t: Traits) -> str:
    L = []
    L.append("/* >>> ap-adapter >>> */")
    # 机器可读特征快照：死规则清理后 .post-card 等来源规则已删除，
    # 重跑时凭此行 + 区块内 .dark 文本无损往返，保证脚本幂等
    snap = asdict(t)
    snap.pop("dark_text", None)
    snap = {k: v for k, v in snap.items() if v is not None}
    L.append("/* ap-traits-v2: "
             + json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + " */")
    L.append("/* ═══════════════════════════════════════════════════════════════════════")
    L.append("   AstroPress 适配层 v2（optimize-themes.py 按主题原始设计语言生成）")
    L.append("")
    L.append("   原 theme.css 的布局选择器来自 WordPress DOM，AstroPress 前台不输出，故不生效。")
    L.append("   本层把每个主题的设计特征（卡片语言/导航高度/标题/引用块/圆角/阴影/行高）映射到")
    L.append("   BlockRenderer 的真实 DOM（.ap-block-*）。设计特征均提取自本文件原始规则：")
    L.append(f"     · 卡片语言 = {t.card_style:<6}（阴影={t.card_shadow[:40]}）")
    L.append(f"     · 导航高度 = {t.nav_height}   标题字重 = {t.title_weight}   正文行高 = {t.body_line_height}")
    L.append("   内联 style 已设置的性质（背景/边框/圆角/网格/高度）仅在必要处用 !important 覆盖。")
    L.append("   ═══════════════════════════════════════════════════════════════════════ */")
    L.append("")
    L.append(":root {")
    L.append(f"  --ap-primary: {c['primary']};")
    L.append(f"  --ap-primary-hover: {c['primaryHover']};")
    L.append(f"  --ap-bg: {c['bg']};")
    L.append(f"  --ap-surface: {c['surface']};")
    L.append(f"  --ap-border: {c['border']};")
    L.append(f"  --ap-text: {c['text']};")
    L.append(f"  --ap-muted: {c['muted']};")
    L.append(f"  --ap-radius: {c['radiusRef']};")
    if t.card_style == "shadow":
        # 仅阴影卡分支消费这三个变量，其余卡片语言不输出（避免死变量）
        L.append(f"  --ap-card-shadow: {t.card_shadow};")
        L.append(f"  --ap-card-shadow-hover: {t.card_shadow_hover};")
        L.append(f"  --ap-card-lift: {t.card_lift};")
    L.append(f"  --ap-nav-height: {t.nav_height};")
    L.append(f"  --ap-transition: {t.transition};")
    L.append("}")
    L.append("")
    L.append("/* ── 基础排版 ─────────────────────────────────────────────────────── */")
    L.append(f".ap-blocks {{ font-family: {c['fontBodyRef']}; color: var(--ap-text); line-height: {t.body_line_height}; }}")
    title_color = {
        "text": "var(--ap-text)",
        "primary": "var(--ap-primary)",
        "custom": t.title_color or "var(--ap-text)",
    }[t.title_color_kind]
    L.append(".ap-block h1, .ap-block h2, .ap-block h3, .ap-block h4,")
    L.append(".post-header h1 {")
    L.append(f"  font-family: {c['fontHeadingRef']};")
    L.append(f"  font-weight: {t.title_weight};")
    L.append(f"  letter-spacing: {t.heading_spacing};")
    L.append(f"  color: {title_color};")
    L.append("}")
    L.append(".post-header h1 { font-size: clamp(1.8rem, 4vw, 2.4rem); line-height: 1.25; margin: 0 0 12px; }")
    if t.image_radius:
        L.append(".ap-block img { border-radius: var(--ap-radius); }")
    L.append(".ap-block a:hover { color: var(--ap-primary-hover); }")
    if t.link_underline:
        L.append(".ap-block-text a, .ap-block-columns a, .ap-block-html a, .post-content a { text-decoration: underline; text-underline-offset: 2px; }")
    L.append("")
    L.append("/* ── 导航：主题原高度（内联固定 64px，需 !important）+ 吸顶 ──────── */")
    L.append("body > .ap-blocks:has(> .ap-block-nav) {")
    L.append("  position: sticky; top: 0; z-index: 90; background: var(--ap-bg);")
    L.append("}")
    L.append(".ap-block-nav { box-shadow: 0 1px 0 var(--ap-border); height: var(--ap-nav-height) !important; }")
    L.append(".ap-block-nav nav ul li a {")
    L.append("  border-radius: var(--ap-radius);")
    L.append("  transition: color var(--ap-transition), background-color var(--ap-transition);")
    L.append("}")
    L.append(".ap-block-nav nav ul li a:hover { color: var(--ap-primary-hover); background: var(--ap-surface); }")
    L.append("")

    # ── 卡片语言 ──
    L.append("/* ── query-loop 卡片（设计语言："
             + {"list": "列表流，分隔线", "border": "边框卡", "shadow": "阴影卡"}[t.card_style]
             + "） ── */")
    if t.card_style == "list":
        L.append("/* 中和内联卡片壳：去底色/边框/圆角/阴影，改为行间分隔线，网格间距归零 */")
        L.append(".ap-block-query-loop > div > div { gap: 0 !important; }")
        L.append(".ap-block-query-loop article {")
        L.append("  background: transparent !important;")
        L.append("  border: 0 !important;")
        L.append("  border-bottom: 1px solid var(--ap-border) !important;")
        L.append("  border-radius: 0 !important;")
        L.append("  box-shadow: none !important;")
        L.append("}")
        L.append(".ap-block-query-loop article:last-child { border-bottom: 0 !important; }")
        L.append(".ap-block-query-loop article:hover { transform: none; box-shadow: none; }")
        L.append(".ap-block-query-loop article a { text-decoration: none; }")
        L.append(".ap-block-query-loop article a:hover { color: var(--ap-primary-hover); }")
        L.append(".ap-block-features > div > div > div { box-shadow: none; }")
        L.append(".ap-block-features > div > div > div:hover { transform: none; box-shadow: none; }")
    elif t.card_style == "border":
        lift = t.card_lift != "0px"
        L.append("/* 内联壳已提供底色/1px 描边/圆角，这里只接管阴影与 hover；原样式无阴影 */")
        L.append(".ap-block-query-loop article {")
        L.append("  box-shadow: none;")
        if lift:
            L.append("  transition: transform var(--ap-transition);")
        if not t.card_has_border:
            # 纯底色卡（如 mirage）：中和内联 1px 描边，保留占位避免布局抖动
            L.append("  border-color: transparent !important;")
        L.append("}")
        if lift:
            # 原设计 hover 仅上浮，边框色不变
            L.append(f".ap-block-query-loop article:hover {{ transform: translateY({t.card_lift}); }}")
        L.append(".ap-block-query-loop article a { text-decoration: none; }")
        L.append(".ap-block-query-loop article a:hover { color: var(--ap-primary-hover); }")
        L.append(".ap-block-features > div > div > div {")
        L.append("  box-shadow: none;")
        if lift:
            L.append("  transition: transform var(--ap-transition);")
        if not t.card_has_border:
            L.append("  border-color: transparent;")
        L.append("}")
        if lift:
            L.append(f".ap-block-features > div > div > div:hover {{ transform: translateY({t.card_lift}); }}")
    else:
        L.append(".ap-block-query-loop article {")
        L.append("  box-shadow: var(--ap-card-shadow);")
        L.append("  transition: transform var(--ap-transition), box-shadow var(--ap-transition);")
        L.append("}")
        L.append(".ap-block-query-loop article:hover {")
        L.append("  transform: translateY(var(--ap-card-lift));")
        L.append("  box-shadow: var(--ap-card-shadow-hover);")
        L.append("}")
        L.append(".ap-block-query-loop article a { text-decoration: none; }")
        L.append(".ap-block-query-loop article a:hover { color: var(--ap-primary-hover); }")
        L.append(".ap-block-features > div > div > div {")
        L.append("  box-shadow: var(--ap-card-shadow);")
        L.append("  transition: transform var(--ap-transition), box-shadow var(--ap-transition);")
        L.append("}")
        L.append(".ap-block-features > div > div > div:hover {")
        L.append("  transform: translateY(var(--ap-card-lift));")
        L.append("  box-shadow: var(--ap-card-shadow-hover);")
        L.append("}")
    L.append("")

    # ── 富文本（引用块用主题原值） ──
    L.append("/* ── 富文本（text / columns / html 块内原生标签） ───────────────── */")
    L.append(".ap-block-text h2, .ap-block-columns h2 { font-size: 1.5rem; margin: 1.75rem 0 0.75rem; }")
    L.append(".ap-block-text h3, .ap-block-columns h3 { font-size: 1.25rem; margin: 1.5rem 0 0.6rem; }")
    L.append(".ap-block-text ul, .ap-block-text ol,")
    L.append(".ap-block-columns ul, .ap-block-columns ol { margin: 0 0 1.25rem; padding-left: 1.4rem; }")
    quote_full_radius = f"0 {t.quote_radius} {t.quote_radius} 0" if t.quote_radius not in ("0", "0px") else "0"
    L.append(".ap-block-text blockquote, .ap-block-columns blockquote, .ap-block-html blockquote,")
    L.append(".post-content blockquote {")
    L.append("  margin: 0 0 1.25rem;")
    L.append("  padding: 1rem 1.25rem;")
    L.append(f"  border-left: {t.quote_width} solid {t.quote_color};")
    L.append("  background: var(--ap-surface);")
    L.append(f"  border-radius: {quote_full_radius};")
    L.append("  color: var(--ap-muted);")
    L.append("}")
    L.append(".ap-block-text pre, .ap-block-columns pre, .ap-block-html pre, .post-content pre {")
    L.append("  background: var(--ap-surface); padding: 1rem;")
    L.append("  border-radius: var(--ap-radius); overflow-x: auto;")
    L.append("}")
    L.append(".ap-block-text code, .ap-block-columns code, .ap-block-html code, .post-content code {")
    L.append("  background: var(--ap-surface); padding: 2px 6px; border-radius: 4px; font-size: 0.9em;")
    L.append("}")
    L.append(".ap-block-text a, .ap-block-columns a, .ap-block-html a,")
    L.append(".read-more, .post-content a { color: var(--ap-primary); }")
    L.append(".ap-block-html { font-size: 0.92rem; line-height: 1.75; color: var(--ap-muted); }")
    L.append("")
    L.append("/* ── 博客列表/正文 ────────────────────────────────────────────────── */")
    L.append(".post-list-item h2 a, .post-list-item-title a { color: var(--ap-text); }")
    L.append(".post-list-item h2 a:hover, .post-list-item-title a:hover,")
    L.append(".post-list-item a:hover { color: var(--ap-primary-hover); }")
    L.append(".post-meta, .post-list-item-meta { color: var(--ap-muted); }")
    L.append("")
    L.append("/* ── 品牌色细节 ───────────────────────────────────────────────────── */")
    L.append("::selection { background: var(--ap-primary); color: #fff; }")
    L.append("")
    L.append("/* ── 响应式（内联 padding / grid-template-columns / height 必须 !important） ── */")
    L.append("@media (max-width: 900px) {")
    L.append("  .ap-block-hero, .ap-block-text, .ap-block-cta, .ap-block-features,")
    L.append("  .ap-block-columns, .ap-block-image, .ap-block-form, .ap-block-divider {")
    L.append("    padding-left: 24px !important; padding-right: 24px !important;")
    L.append("  }")
    L.append("  .ap-block-nav { padding-left: 20px !important; padding-right: 20px !important; }")
    L.append("  .ap-block-query-loop { padding-left: 20px !important; padding-right: 20px !important; }")
    L.append("  .ap-block-query-loop > div > div { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }")
    L.append("  .ap-block-features > div > div { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }")
    L.append("  .ap-block-columns > div { grid-template-columns: minmax(0, 1fr) !important; }")
    L.append("}")
    L.append("@media (max-width: 640px) {")
    L.append("  .ap-block-query-loop > div > div,")
    L.append("  .ap-block-features > div > div { grid-template-columns: minmax(0, 1fr) !important; }")
    L.append("  .ap-block-nav {")
    L.append("    height: auto !important; min-height: 56px; flex-wrap: wrap; row-gap: 2px;")
    L.append("    padding-top: 8px !important; padding-bottom: 8px !important;")
    L.append("  }")
    L.append("  .ap-block-nav nav { width: 100%; }")
    L.append("  .ap-block-nav nav ul { flex-wrap: wrap; }")
    L.append("}")
    L.append("@media (prefers-reduced-motion: reduce) {")
    L.append("  .ap-block-query-loop article, .ap-block-features > div > div > div { transition: none; }")
    L.append("  [data-ap-animation] { animation: none !important; }")
    L.append("}")

    if t.dark_text:
        L.append("")
        L.append("/* ── 暗色模式（默认注释掉：AstroPress 不会给 <html> 加 .dark，block 的")
        L.append("      背景色也是内联字面量，直接启用会与内联色冲突导致对比度异常。")
        L.append("      如需启用，请先在平台侧把 block 颜色改为变量驱动） ────────────────")
        L.append(".dark {")
        L.append(t.dark_text)
        L.append("}")
        L.append("*/")

    L.append("/* <<< ap-adapter <<< */")
    return "\n".join(L)


# ────────────────────────────────────────────────────────────────────────────
# 字体镜像
# ────────────────────────────────────────────────────────────────────────────

def mirror_fonts(css: str) -> tuple[str, int]:
    """googleapis -> fonts.loli.net（Google Fonts 国内镜像，海外同样可访问）。
    返回(新css,替换数)。已镜像的区块原样返回，保证重复运行字节级幂等。"""
    if "fonts.loli.net" in css:
        return css, 0
    n = css.count("fonts.googleapis.com")
    css = css.replace("fonts.googleapis.com", "fonts.loli.net")
    css = css.replace("fonts.gstatic.com", "gstatic.loli.net")
    # 更新使用说明注释
    css = css.replace(
        "若网络无法访问 Google Fonts（例如中国大陆），删除本区块即可，字体会回退到系统字体。",
        "字体源为 fonts.loli.net（Google Fonts 国内镜像，海外同样可访问）；\n   如需官方源把域名改回 fonts.googleapis.com 即可；完全离线时删除本区块则回退系统字体。",
    )
    return css, n


# ────────────────────────────────────────────────────────────────────────────
# 主流程
# ────────────────────────────────────────────────────────────────────────────

def strip_regions(css: str) -> str:
    css = REGION_RE["fonts"].sub("", css)
    css = REGION_RE["adapter"].sub("", css)
    return css.strip()


TRAITS_SNAP_RE = re.compile(r"/\* ap-traits-v2: (\{.*?\}) \*/")


def restore_traits(adapter_block: str) -> Traits | None:
    """从已生成适配层的特征快照恢复 Traits（死规则已清理后的重跑场景）。"""
    m = TRAITS_SNAP_RE.search(adapter_block)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except Exception:
        return None
    valid = {f.name for f in fields(Traits)}
    t = Traits(**{k: v for k, v in data.items() if k in valid})
    dm = re.search(r"\.dark\s*\{([\s\S]*?)\}", adapter_block)
    if dm and "--color" in dm.group(1):
        # 只去首尾空行，保留各声明行自身的 4 空格缩进
        dlines = dm.group(1).splitlines()
        while dlines and not dlines[0].strip():
            dlines.pop(0)
        while dlines and not dlines[-1].strip():
            dlines.pop()
        t.dark_text = "\n".join(dlines)
    return t


def load_tokens(theme_dir: Path) -> dict:
    try:
        return json.loads((theme_dir / "manifest.json").read_text(encoding="utf-8")).get("tokens") or {}
    except Exception:
        return {}


def process(theme_dir: Path, do_prune: bool = True):
    css_path = theme_dir / "theme.css"
    original = css_path.read_text(encoding="utf-8")
    tokens = load_tokens(theme_dir)

    fonts_block = ""
    m = re.search(r"(/\* >>> ap-fonts >>> \*/[\s\S]*?/\* <<< ap-fonts <<< \*/)", original)
    if m:
        fonts_block, mirrored = mirror_fonts(m.group(1))

    # 重跑场景：死规则已清理，优先从旧适配层快照恢复特征
    old_adapter = re.search(
        r"(/\* >>> ap-adapter >>> \*/[\s\S]*?/\* <<< ap-adapter <<< \*/)", original
    )
    prev = restore_traits(old_adapter.group(1)) if old_adapter else None

    base = strip_regions(original)
    if prev is not None:
        traits = prev
    else:
        # 特征必须在死规则清理前提取（.post-card/.nav-inner/.article-title 会被清掉）
        traits = extract_traits(base, tokens)
    colors = collect_colors(base, tokens)

    pruned = 0
    saved = 0
    if do_prune:
        base, pruned, saved = prune_css(base)

    adapter = build_adapter(colors, traits)
    parts = [fonts_block, base, adapter]
    out = "\n\n".join(p for p in parts if p).strip() + "\n"
    return out, traits, pruned, saved, len(original), len(out)


def main():
    analyze = "--analyze" in sys.argv
    dry = "--dry-run" in sys.argv
    do_prune = "--no-prune" not in sys.argv
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)

    if not THEMES_DIR.exists():
        print(f"找不到目录: {THEMES_DIR}", file=sys.stderr)
        sys.exit(1)

    dirs = sorted(p for p in THEMES_DIR.iterdir() if p.is_dir())
    if only:
        dirs = [p for p in dirs if only in p.name]

    rows = []
    total_saved = 0
    for d in dirs:
        try:
            out, t, pruned, saved, old_len, new_len = process(d, do_prune)
        except Exception as e:
            print(f"✗ {d.name}: {e.__class__.__name__}: {e}")
            raise
        changed = out != (d / "theme.css").read_text(encoding="utf-8")
        rows.append((d.name, t, pruned, saved, old_len, new_len, changed))
        total_saved += max(0, old_len - new_len)
        if not analyze and not dry and changed:
            (d / "theme.css").write_text(out, encoding="utf-8", newline="\n")

    print(f"{'主题':<28} {'卡片':<7} {'描边':<4} {'圆角':<6} {'导航':<5} {'标题':<5} {'hover阴影':<8} {'lift':<6} {'删规则':<5} {'字节':>6}")
    print("─" * 100)
    for name, t, pruned, saved, old_len, new_len, changed in rows:
        flag = "" if changed else "  ="
        sh = "有" if t.card_shadow_hover not in ("", "none") else "-"
        bd = "有" if t.card_style != "list" and t.card_has_border else ("无" if t.card_style == "border" else "-")
        lift = t.card_lift if t.card_lift != "0px" else "-"
        print(f"{name:<28} {t.card_style:<7} {bd:<4} {t.radius:<6} {t.nav_height:<5} "
              f"{t.title_weight:<5} {sh:<8} {lift:<6} {pruned:<5} {old_len - new_len:>+6}{flag}")
    print("─" * 100)
    counts = {}
    for _, t, *_ in rows:
        counts[t.card_style] = counts.get(t.card_style, 0) + 1
    mode = "analyze（未写盘）" if analyze else ("dry-run（未写盘）" if dry else "已写入")
    print(f"卡片语言分布: {counts}")
    print(f"主题 {len(rows)} 个 | {mode} | 总体积变化 {total_saved:+d} 字节")


if __name__ == "__main__":
    main()
