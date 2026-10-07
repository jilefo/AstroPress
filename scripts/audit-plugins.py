# -*- coding: utf-8 -*-
r"""
AstroPress 插件静态审计器（Python，独立实现）。

扫描 plugins/*/ 全部源文件，机械检查历史上真实踩过的坑：
  E1  JSON 解析失败
  E2  injectRoute pattern 重复注册（跨插件冲突）
  E3  replace("</head>", X) 替换串丢失 </head> 锚点（下游中间件静默失效）
  W1  .astro 内联 <script> 中的 \w \d \s \b 正则转义（Astro 历史坑）
  W2  词典型对象字面量重复 key
  W3  注入的客户端脚本端点缺 Cache-Control（配置内嵌脚本必须 no-store）
  W4  疑似硬编码凭据
  W5  db.execute 模板串拼接（SQL 注入风险）
  W6  客户端脚本 innerHTML 赋值（XSS 面，人工复核）
  W7  package.json 工作区依赖未用 workspace: 协议
  W8  使用 ?raw 导入但缺 src/types/raw.d.ts
  I1  /api/* 路由清单（核心中间件对 /api/* 强制登录，供人工核对是否有匿名端点误放）

行内注释 ap-audit-ok 可抑制该行的 W 级命中。
退出码：有 E 或 W 时为 1。
"""
import json
import os
import re
import stat
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGINS = ROOT / "plugins"
OK_MARK = "ap-audit-ok"
SKIP_DIRS = {"node_modules", ".backup", ".turbo", "dist"}


def _is_reparse(path_str):
    """Windows junction/symlink：os.walk 下剪枝，避免递归 pnpm junction 森林。"""
    try:
        return bool(os.lstat(path_str).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (OSError, AttributeError):
        return os.path.islink(path_str)


def iter_sources():
    # 直接在 os.walk 层剪枝（旧实现 rglob 全量后再过滤，会先遍历所有
    # node_modules junction，冷盘/杀软扫描下单轮可阻塞数十秒甚至挂死）。
    for dirpath, dirnames, filenames in os.walk(PLUGINS):
        dirnames[:] = sorted(
            d for d in dirnames if d not in SKIP_DIRS and not _is_reparse(os.path.join(dirpath, d))
        )
        for fn in sorted(filenames):
            p = Path(dirpath) / fn
            yield p, p.relative_to(ROOT)


findings = []  # (severity, code, relpath, line, message)


def add(sev, code, rel, line, msg):
    findings.append((sev, code, str(rel), line, msg))


# ── E1 JSON ────────────────────────────────────────────────────────────
def check_json():
    for p, rel in iter_sources():
        if p.suffix != ".json":
            continue
        try:
            json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception as e:
            add("E", "E1", rel, 0, f"JSON 解析失败: {e}")


# ── E2 重复路由 + I1 /api/* 清单 ───────────────────────────────────────
ROUTE_RE = re.compile(
    r"injectRoute\(\s*\{[^}]*?pattern:\s*[\"'`]([^\"'`]+)[\"'`][^}]*?entrypoint:\s*p\(([^)]*)\)",
    re.S,
)


def check_routes():
    seen = {}
    api_routes = []
    for p, rel in iter_sources():
        if p.name not in ("integration.ts", "integration.admin.ts") or p.suffix != ".ts":
            continue
        text = p.read_text(encoding="utf-8")
        for m in ROUTE_RE.finditer(text):
            pattern = m.group(1).strip()
            entry_raw = m.group(2).strip().replace("\n", " ")
            line = text[: m.start()].count("\n") + 1
            if pattern in seen:
                add("E", "E2", rel, line, f"路由 pattern 重复: {pattern}（已在 {seen[pattern]} 注册）")
            else:
                seen[pattern] = f"{rel}:{line}"
            if pattern.startswith("/api/"):
                # 解析 entrypoint 相对路径，检查文件内是否自带鉴权
                parts = [s.strip().strip("\"'") for s in entry_raw.split(",")]
                entry_rel = Path(*[x for x in parts if x])
                entry_file = p.parent / entry_rel
                has_auth = False
                if entry_file.exists():
                    body = entry_file.read_text(encoding="utf-8")
                    # 匹配 locals.user / (locals as any).user / locals.userId / locals.session
                    has_auth = bool(re.search(r"locals[^;{}\n]{0,24}?\.\s*(user|userId|session)\b", body))
                api_routes.append((pattern, f"{rel}:{line}", has_auth))
    for pattern, where, has_auth in api_routes:
        add("I", "I1", where, 0, f"/api/* 路由 {pattern} — 自带鉴权: {has_auth}（核心中间件亦强制登录）")


# ── E3 </head> 锚点 ────────────────────────────────────────────────────
HEAD_RE = re.compile(
    r"""\.replace\(\s*(['"`])\s*(</head>)\s*\1\s*,\s*(['"`])(.*?)\3""",
    re.S,
)


def check_head_anchor():
    for p, rel in iter_sources():
        if p.suffix not in (".ts", ".js", ".astro"):
            continue
        text = p.read_text(encoding="utf-8")
        for m in HEAD_RE.finditer(text):
            line = text[: m.start()].count("\n") + 1
            repl = m.group(4)
            if "</head>" not in repl:
                add("E", "E3", rel, line, "replace('</head>', X) 的替换串丢失 </head> 锚点，下游注入将静默失效")


# ── W1 .astro 内联脚本正则转义 ─────────────────────────────────────────
SCRIPT_RE = re.compile(r"<script(\s[^>]*)?>(.*?)</script>", re.S | re.I)
ESCAPE_RE = re.compile(r"\\[wdsbWDSB]")


def check_inline_script_escapes():
    for p, rel in iter_sources():
        if p.suffix != ".astro":
            continue
        text = p.read_text(encoding="utf-8")
        for m in SCRIPT_RE.finditer(text):
            attrs, body = m.group(1) or "", m.group(2)
            line0 = text[: m.start()].count("\n") + 1
            for lm in ESCAPE_RE.finditer(body):
                line = line0 + body[: lm.start()].count("\n")
                add("W", "W1", rel, line, f".astro 内联 <script> 中的正则转义 {lm.group(0)}（历史坑：浏览器收到字面反斜杠）")


# ── W2 词典型重复 key ──────────────────────────────────────────────────
DICT_LINE_RE = re.compile(r"""^\s{2,}(["'])([^"']+)\1\s*:\s*["']""")


def check_duplicate_keys():
    for p, rel in iter_sources():
        if p.suffix not in (".ts", ".js"):
            continue
        text = p.read_text(encoding="utf-8")
        lines = text.splitlines()
        seen = {}
        for i, ln in enumerate(lines, 1):
            m = DICT_LINE_RE.match(ln)
            if not m:
                continue
            key = m.group(2)
            if key in seen:
                add("W", "W2", rel, i, f"对象字面量重复 key: {key!r}（首次出现于第 {seen[key]} 行）")
            else:
                seen[key] = i


# ── W3 配置内嵌脚本端点的 Cache-Control ────────────────────────────────
CONFIG_JS_ENDPOINTS = {
    "script.js.ts", "tools.js.ts", "loader.js.ts", "switcher.js.ts",
    "panel.js.ts", "editor-upload.js.ts", "image-mirror.js.ts",
}


def check_cache_headers():
    for p, rel in iter_sources():
        if p.name not in CONFIG_JS_ENDPOINTS:
            continue
        text = p.read_text(encoding="utf-8")
        if "Cache-Control" not in text and "cache-control" not in text:
            add("W", "W3", rel, 0, "JS 端点未设置 Cache-Control（内嵌配置/词典，必须 no-store 或短缓存）")


# ── W4 疑似硬编码凭据 ──────────────────────────────────────────────────
SECRET_RE = re.compile(
    r"""(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']([^"']{8,})["']""",
    re.I,
)
SECRET_ALLOW = re.compile(r"(your[-_].*|<[^>]*>|\$\{|\{\{|process\.env|example|placeholder|test)", re.I)


def check_secrets():
    for p, rel in iter_sources():
        if p.suffix not in (".ts", ".js", ".astro"):
            continue
        text = p.read_text(encoding="utf-8")
        for m in SECRET_RE.finditer(text):
            line = text[: m.start()].count("\n") + 1
            val = m.group(2)
            if SECRET_ALLOW.search(val):
                continue
            add("W", "W4", rel, line, f"疑似硬编码凭据: {m.group(1)} = {val[:4]}…")


# ── W5 db.execute 拼接 ─────────────────────────────────────────────────
SQL_RE = re.compile(r"""\.execute\(\s*`[^`]*\$\{""", re.S)


def check_sql_concat():
    for p, rel in iter_sources():
        if p.suffix != ".ts":
            continue
        text = p.read_text(encoding="utf-8")
        for m in SQL_RE.finditer(text):
            line = text[: m.start()].count("\n") + 1
            add("W", "W5", rel, line, "db.execute 模板串内含 ${} 拼接 — 确认参数已转义或改用占位符")


# ── W6 innerHTML 赋值 ──────────────────────────────────────────────────
INNER_RE = re.compile(r"\.innerHTML\s*=\s*(?!\s*['\"`]\s*['\"`$])")
# ±2 行内出现 escapeHtml(/esc( 视为已防护
ESCAPE_HINT_RE = re.compile(r"\b(escapeHtml|esc)\(")


def check_innerhtml():
    for p, rel in iter_sources():
        if p.suffix not in (".ts", ".js", ".astro"):
            continue
        text = p.read_text(encoding="utf-8")
        lines = text.splitlines()
        for m in INNER_RE.finditer(text):
            line = text[: m.start()].count("\n") + 1
            if OK_MARK in lines[line - 1]:
                continue
            window = "\n".join(lines[max(0, line - 3): line + 2])
            if ESCAPE_HINT_RE.search(window):
                continue  # 已走转义函数，视为已防护
            add("W", "W6", rel, line, "innerHTML 动态赋值 — 人工复核 XSS 面")


# ── W7 workspace 依赖 ──────────────────────────────────────────────────
def check_workspace_deps():
    for p, rel in iter_sources():
        if p.name != "package.json" or len(rel.parts) != 2:
            continue
        try:
            pkg = json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception:
            continue  # E1 已报
        name = pkg.get("name", "")
        expected = f"@astropress/plugin-{rel.parts[1]}"
        if name != expected:
            add("W", "W7", rel, 0, f"package name {name!r} 与目录约定 {expected!r} 不一致")
        for section in ("dependencies", "devDependencies", "peerDependencies"):
            for dep, ver in (pkg.get(section) or {}).items():
                if dep.startswith("@astropress/") and not str(ver).startswith("workspace:"):
                    add("W", "W7", rel, 0, f"工作区依赖 {dep}@{ver} 未用 workspace: 协议")


# ── W8 ?raw 导入与 raw.d.ts ────────────────────────────────────────────
def check_raw_types():
    for p, rel in iter_sources():
        if p.suffix not in (".ts", ".astro") or len(rel.parts) < 3:
            continue
        text = p.read_text(encoding="utf-8")
        if "?raw" in text:
            # 插件根 = plugins/<name>/，d.ts 约定位置 src/types/raw.d.ts
            dts = PLUGINS / rel.parts[1] / "src" / "types" / "raw.d.ts"
            if not dts.exists():
                add("W", "W8", rel, 0, f"使用 ?raw 导入但缺少 {dts.relative_to(ROOT)}")


def main():
    check_json()
    check_routes()
    check_head_anchor()
    check_inline_script_escapes()
    check_duplicate_keys()
    check_cache_headers()
    check_secrets()
    check_sql_concat()
    check_innerhtml()
    check_workspace_deps()
    check_raw_types()

    order = {"E": 0, "W": 1, "I": 2}
    findings.sort(key=lambda f: (order[f[0]], f[1], f[2], f[3]))

    # 通用 W 级抑制：命中行含 ap-audit-ok 视为人工复核通过（docstring 承诺的行为）
    def suppressed(f):
        sev, _code, rel, line, _msg = f
        if sev != "W" or not line:
            return False
        try:
            text = (ROOT / rel).read_text(encoding="utf-8").splitlines()
            return 0 < line <= len(text) and "ap-audit-ok" in text[line - 1]
        except OSError:
            return False

    findings[:] = [f for f in findings if f[0] != "W" or not suppressed(f)]

    n_e = sum(1 for f in findings if f[0] == "E")
    n_w = sum(1 for f in findings if f[0] == "W")
    n_i = sum(1 for f in findings if f[0] == "I")

    print("=" * 68)
    print("plugins 插件静态审计（Python）")
    print("=" * 68)
    for sev, code, rel, line, msg in findings:
        loc = f"{rel}:{line}" if line else rel
        print(f"[{sev}] {code:<3} {loc} — {msg}")
    print("-" * 68)
    print(f"E: {n_e}   W: {n_w}   I: {n_i}")
    if n_e or n_w:
        sys.exit(1)
    print("全部通过。")


if __name__ == "__main__":
    main()
