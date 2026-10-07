#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新插件注入点 × 34 个主题包 CSS 冲突矩阵扫描。
注入标识（id/class 前缀）来自插件源码真实输出；主题 CSS 中若出现这些
标识，才可能对注入节点产生样式覆盖。元素名级冲突（article button 等）
由本脚本第二部分单独扫描。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "wp-themes"

# 插件注入到前台的 id / class 前缀
INJECT_TOKENS = [
    "#ap-comments", ".ap-cmt-",       # comments
    "#ap-directory", ".ap-dir-",      # link-directory
    "ap-links",                        # link-directory 点击端点/类
]
# 仅后台的注入（不进前台主题）：.apwp- #apwp-bar / #ap-av-modal .apav-
ADMIN_TOKENS = ["#apwp-bar", ".apwp-", "#ap-av-modal", ".apav-"]

# 注入块内部用到的裸元素（主题若在文章页对这些元素写规则理论上会影响）
RAW_ELEMENTS = ["article", "button", "input", "textarea", "form", "label", "ul", "li", "select"]

css_files = sorted(THEMES.glob("*-theme/theme.css"))
print(f"发现 {len(css_files)} 个 theme.css")

token_hits = []
raw_warnings = []
sel_split = re.compile(r"[{}]")

for css in css_files:
    text = css.read_text(encoding="utf-8", errors="replace")
    for tok in INJECT_TOKENS + ADMIN_TOKENS:
        if tok in text:
            token_hits.append((css.parent.name, tok))
    # 裸元素规则：取选择器段（去掉 @ 规则与注释近似处理）
    body = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for chunk in sel_split.split(body):
        sel = chunk.strip()
        if not sel or sel.startswith("@") or ":" in sel and sel.startswith("@"):
            pass
        # 只看选择器段（偶数段），粗粒度：包含 article 上下文 + 裸元素
        if "article" in sel:
            for el in RAW_ELEMENTS[1:]:
                # article 后代元素：article button / article .x button 等
                if re.search(rf"article[^\w-][^{{}}]*\b{el}\b", sel):
                    raw_warnings.append((css.parent.name, sel[:120]))

print("\n== 1) 注入标识直接命中（应全为 0）==")
if token_hits:
    for t in token_hits:
        print("  HIT", t)
else:
    print("  0 命中：34 个主题均未定义任何 ap-comments/ap-cmt/ap-directory/ap-dir/apwp/apav 规则")

print("\n== 2) article 上下文内裸表单/列表元素规则（注入评论块在 article 内）==")
if raw_warnings:
    for w in raw_warnings:
        print("  WARN", w)
else:
    print("  0 条：没有主题在 article 选择器下写 button/input/textarea/form/label/ul/li/select")

# 3) 全局 reset 危险声明
print("\n== 3) 危险全局重置扫描 ==")
dangerous = []
pat = re.compile(r"(?:^|\})\s*(?:\*|\*::?(?:before|after))[^{}]*\{[^}]*(?:all\s*:\s*(?:revert|unset|initial))", re.M)
for css in css_files:
    text = css.read_text(encoding="utf-8", errors="replace")
    if pat.search(text) or re.search(r"\*\s*\{[^}]*all\s*:\s*(?:revert|unset|initial)", text):
        dangerous.append(css.parent.name)
print("  命中:", dangerous or "0")

ok = not token_hits and not raw_warnings and not dangerous
print("\nRESULT:", "CLEAN" if ok else "NEEDS REVIEW")
sys.exit(0 if ok else 1)
