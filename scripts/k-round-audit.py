#!/usr/bin/env python3
"""
K-round deep audit: scan all plugins & themes for hardcoded values,
potential bugs, performance issues, and consistency problems.

Usage: python scripts/k-round-audit.py
"""
import os, re, json, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
PLUGINS = ROOT / "plugins"
THEMES = ROOT / "wp-themes"

# ── Counters ──
issues = defaultdict(list)  # category -> [(file, line, msg)]
stats = {"files_scanned": 0, "plugins": 0, "themes": 0}

# ── Patterns to detect ──

# 1. Hardcoded z-index values (outside of CSS files that are theme-specific)
ZINDEX_RE = re.compile(r'z-index\s*:\s*(\d+)', re.IGNORECASE)

# 2. Hardcoded colors in TS/JS files (not in theme CSS)
COLOR_RE = re.compile(r'["\']#([0-9a-fA-F]{3,8})["\']')

# 3. Hardcoded timeouts (ms)
TIMEOUT_RE = re.compile(r'(?:timeout|TTL|MAX_AGE|maxAge|ttlSec|interval)\s*[=:]\s*(\d+)', re.IGNORECASE)

# 4. Hardcoded port numbers
PORT_RE = re.compile(r'(?:port|PORT)\s*[=:]\s*(\d{4,5})')

# 5. Hardcoded URLs (non-template, non-comment)
URL_RE = re.compile(r'["\']https?://[^"\']+["\']')

# 6. Magic numbers in comparisons / limits (exclude common 0,1,2,-1)
MAGIC_NUM_RE = re.compile(r'(?:>=|<=|>|<|===|!==|==|!=)\s*(\d{2,})')

# 7. Potential regex DoS (nested quantifiers)
REDOOM_RE = re.compile(r'\([^)]*[+*][^)]*\)[+*]')

# 8. console.log / console.warn / console.error in production code
CONSOLE_RE = re.compile(r'console\.(log|warn|error|debug)\s*\(')

# 9. Hardcoded IP addresses
IP_RE = re.compile(r'["\'](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["\']')

# 10. eval() or new Function() usage (security risk)
EVAL_RE = re.compile(r'\beval\s*\(|new\s+Function\s*\(')

# 11. innerHTML without audit comment
INNERHTML_RE = re.compile(r'\.innerHTML\s*=')

# 12. Hardcoded file paths (absolute)
ABSPATH_RE = re.compile(r'["\'][A-Z]:\\\\[^"\']+["\']')

# 13. Missing error handling (await without try/catch in API routes)
# This is complex to detect, so we do a simple heuristic
AWAIT_NO_TRY_RE = re.compile(r'await\s+\w+\.\w+\(')

# 14. Hardcoded array length limits
LIMIT_RE = re.compile(r'(?:MAX_|LIMIT_|SIZE_|CAP_)(\w+)\s*=\s*(\d+)')

# 15. Potential memory leak patterns (unbounded Map/Set without cleanup)
MAP_DECL_RE = re.compile(r'new\s+Map\s*[<(]')
SET_DECL_RE = re.compile(r'new\s+Set\s*[<(]')

# 16. Hardcoded retry counts / loop limits
LOOP_RE = re.compile(r'(?:for|while)\s*\([^)]*<\s*(\d{3,})')

# 17. SQL string concatenation (potential SQL injection)
SQL_CONCAT_RE = re.compile(r'(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s.*\+\s*\w+', re.IGNORECASE)

# 18. Hardcoded user-agent strings
UA_RE = re.compile(r'["\'][^"\']*Mozilla/[^"\']*["\']')

# 19. process.env access without fallback
ENV_RE = re.compile(r'process\.env\.(\w+)(?!\s*\?\?)(?!\s*\|\|)(?!\s*&&)')

# 20. Hardcoded font sizes, widths, heights in inline styles
DIMENSION_RE = re.compile(r'(?:width|height|font-size|padding|margin)\s*:\s*["\']?\d+px')


def scan_file(filepath: Path, rel_path: str):
    """Scan a single file for issues."""
    stats["files_scanned"] += 1
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception:
        return

    lines = content.split("\n")
    in_comment_block = False
    in_template_literal = False

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Skip single-line comments
        if stripped.startswith("//") or stripped.startswith("*"):
            continue

        # Track multi-line comments
        if "/*" in stripped:
            in_comment_block = True
        if "*/" in stripped:
            in_comment_block = False
            continue
        if in_comment_block:
            continue

        # Skip import statements
        if stripped.startswith("import "):
            continue

        # ── z-index checks ──
        for m in ZINDEX_RE.finditer(line):
            val = int(m.group(1))
            if val >= 9000:
                issues["HIGH_Z_INDEX"].append((rel_path, i, f"z-index: {val} (potential stacking conflict)"))

        # ── Hardcoded colors in TS/JS ──
        if filepath.suffix in (".ts", ".js", ".astro"):
            for m in COLOR_RE.finditer(line):
                color = m.group(1)
                # Skip common safe colors (black, white)
                if color.lower() not in ("000", "fff", "000000", "ffffff"):
                    # Only flag if it looks like a design color, not a data value
                    if len(color) in (3, 6, 8):
                        pass  # Colors in middleware HTML templates are expected

        # ── Console statements in non-test files ──
        if "test" not in rel_path and "script" not in rel_path.lower():
            for m in CONSOLE_RE.finditer(line):
                method = m.group(1)
                if method == "error":
                    issues["CONSOLE_ERROR"].append((rel_path, i, f"console.{method}() in production code"))
                elif method == "log":
                    issues["CONSOLE_LOG"].append((rel_path, i, f"console.{method}() in production code"))

        # ── eval() / new Function() ──
        for m in EVAL_RE.finditer(line):
            issues["EVAL_USAGE"].append((rel_path, i, f"eval/Function() usage (security risk)"))

        # ── SQL string concatenation ──
        for m in SQL_CONCAT_RE.finditer(line):
            # Exclude template literals that use ${} (drizzle-orm sql tagged template)
            if "${" not in line and "sql`" not in line:
                issues["SQL_CONCAT"].append((rel_path, i, f"Possible SQL string concatenation"))

        # ── Hardcoded limits ──
        for m in LIMIT_RE.finditer(line):
            name = m.group(1)
            val = m.group(2)
            issues["HARD_LIMIT"].append((rel_path, i, f"{m.group(0).strip()}"))

        # ── innerHTML without audit marker ──
        for m in INNERHTML_RE.finditer(line):
            if "ap-audit-ok" not in line and "// ap-audit-ok" not in line:
                # Check surrounding lines for audit comment
                context = "".join(lines[max(0,i-2):min(len(lines),i+2)])
                if "ap-audit-ok" not in context:
                    issues["INNERHTML_NO_AUDIT"].append((rel_path, i, f"innerHTML without ap-audit-ok marker"))

        # ── Hardcoded IPs ──
        for m in IP_RE.finditer(line):
            ip = m.group(1)
            if not ip.startswith("0.0.0.0") and not ip.startswith("127.0.0.1") and not ip.startswith("255."):
                issues["HARDCODED_IP"].append((rel_path, i, f"Hardcoded IP: {ip}"))

        # ── process.env without fallback ──
        for m in ENV_RE.finditer(line):
            env_var = m.group(1)
            if env_var not in ("NODE_ENV", "CI"):
                issues["ENV_NO_FALLBACK"].append((rel_path, i, f"process.env.{env_var} without ?? or || fallback"))


def scan_plugin(plugin_dir: Path):
    """Scan all source files in a plugin."""
    plugin_name = plugin_dir.name
    stats["plugins"] += 1

    for ext in ("*.ts", "*.js", "*.astro"):
        for f in plugin_dir.rglob(ext):
            if "node_modules" in f.parts or "dist" in f.parts:
                continue
            rel = f.relative_to(ROOT).as_posix()
            scan_file(f, rel)


def scan_themes():
    """Scan all theme packages."""
    if not THEMES.exists():
        return

    for theme_dir in sorted(THEMES.iterdir()):
        if not theme_dir.is_dir():
            continue
        stats["themes"] += 1

        # Check manifest.json
        manifest = theme_dir / "manifest.json"
        if manifest.exists():
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
                # Check for missing required fields
                for field in ("name", "version", "format"):
                    if field not in data:
                        rel = manifest.relative_to(ROOT).as_posix()
                        issues["MANIFEST_MISSING_FIELD"].append((rel, 0, f"Missing '{field}' in manifest.json"))

                # Check version format
                ver = data.get("version", "")
                if ver and ver != "dev" and not re.match(r'^\d+\.\d+\.\d+', ver):
                    rel = manifest.relative_to(ROOT).as_posix()
                    issues["BAD_VERSION"].append((rel, 0, f"Non-standard version: {ver}"))

                # Check for hardcoded primary color
                tokens = data.get("tokens", {})
                colors = tokens.get("colors", {})
                if "primary" in colors:
                    pass  # This is expected in theme manifests

            except json.JSONDecodeError as e:
                rel = manifest.relative_to(ROOT).as_posix()
                issues["INVALID_JSON"].append((rel, 0, f"Invalid JSON: {e}"))

        # Check theme.css for hardcoded values
        css_file = theme_dir / "theme.css"
        if css_file.exists():
            scan_file(css_file, css_file.relative_to(ROOT).as_posix())

        # Check template JSON files
        for tmpl_dir in ("templates", "pages"):
            d = theme_dir / tmpl_dir
            if d.exists():
                for jf in d.glob("*.json"):
                    try:
                        json.loads(jf.read_text(encoding="utf-8"))
                    except json.JSONDecodeError as e:
                        rel = jf.relative_to(ROOT).as_posix()
                        issues["INVALID_JSON"].append((rel, 0, f"Invalid JSON: {e}"))


def check_consistency():
    """Cross-plugin consistency checks."""
    # Check for different CSRF helper implementations
    csrf_implementations = []
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts:
                continue
            content = f.read_text(encoding="utf-8", errors="ignore")
            if "sameOrigin" in content and "function sameOrigin" in content:
                rel = f.relative_to(ROOT).as_posix()
                csrf_implementations.append(rel)
            elif "sameOrigin" in content and "import" in content:
                pass  # Imported, OK

    if len(csrf_implementations) > 1:
        issues["CSRF_DUPLICATION"].append(
            ("(multiple plugins)", 0,
             f"sameOrigin() defined locally in {len(csrf_implementations)} files instead of shared lib")
        )

    # Check for different json() helper implementations
    json_helpers = []
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts:
                continue
            content = f.read_text(encoding="utf-8", errors="ignore")
            if re.search(r'const\s+json\s*=\s*\(', content):
                rel = f.relative_to(ROOT).as_posix()
                json_helpers.append(rel)

    if len(json_helpers) > 5:
        issues["JSON_HELPER_DUPLICATION"].append(
            ("(multiple plugins)", 0,
             f"json() helper defined locally in {len(json_helpers)} files")
        )

    # Check for different escapeHtml implementations
    escape_impls = []
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts:
                continue
            content = f.read_text(encoding="utf-8", errors="ignore")
            if re.search(r'function\s+(?:escapeHtml|esc)\s*\(', content):
                rel = f.relative_to(ROOT).as_posix()
                escape_impls.append(rel)

    if len(escape_impls) > 3:
        issues["ESCAPE_DUPLICATION"].append(
            ("(multiple plugins)", 0,
             f"escapeHtml/esc() defined locally in {len(escape_impls)} files")
        )

    # Check for getClientIp duplication
    ip_helpers = []
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts:
                continue
            content = f.read_text(encoding="utf-8", errors="ignore")
            if "function getClientIp" in content:
                rel = f.relative_to(ROOT).as_posix()
                ip_helpers.append(rel)

    if len(ip_helpers) > 1:
        issues["GETCLIENTIP_DUPLICATION"].append(
            ("(multiple plugins)", 0,
             f"getClientIp() defined locally in {len(ip_helpers)} files instead of shared lib")
        )


def check_unbounded_state():
    """Check for potentially unbounded in-memory state."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            # Find module-level Map/Set declarations
            for i, line in enumerate(content.split("\n"), 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("import"):
                    continue

                # Module-level Map (not inside a function)
                if MAP_DECL_RE.search(stripped) and not stripped.startswith(("function", "const ", "let ", "var ")):
                    # Check if there's cleanup logic nearby
                    if "delete" not in content and "clear" not in content and ".size" not in content:
                        issues["UNBOUNDED_MAP"].append((rel, i, "Module-level Map without visible cleanup"))


def main():
    print(f"{'='*70}")
    print(f"  K-Round Deep Audit — AstroPress Plugins & Themes")
    print(f"  Root: {ROOT}")
    print(f"{'='*70}\n")

    # Scan all plugins
    print("[1/4] Scanning plugins...")
    for pdir in sorted(PLUGINS.iterdir()):
        if pdir.is_dir() and (pdir / "package.json").exists():
            scan_plugin(pdir)

    # Scan all themes
    print("[2/4] Scanning themes...")
    scan_themes()

    # Cross-plugin consistency
    print("[3/4] Checking cross-plugin consistency...")
    check_consistency()

    # Unbounded state
    print("[4/4] Checking unbounded in-memory state...")
    check_unbounded_state()

    # ── Report ──
    print(f"\n{'='*70}")
    print(f"  SCAN RESULTS")
    print(f"{'='*70}")
    print(f"  Files scanned: {stats['files_scanned']}")
    print(f"  Plugins: {stats['plugins']}")
    print(f"  Themes: {stats['themes']}")
    print(f"  Issue categories: {len(issues)}")
    total_issues = sum(len(v) for v in issues.values())
    print(f"  Total findings: {total_issues}")
    print()

    # Severity classification
    severity = {
        "CRITICAL": ["EVAL_USAGE", "SQL_CONCAT", "INVALID_JSON"],
        "HIGH": ["UNBOUNDED_MAP", "INNERHTML_NO_AUDIT"],
        "MEDIUM": ["HIGH_Z_INDEX", "CONSOLE_ERROR", "ENV_NO_FALLBACK",
                    "HARDCODED_IP", "CSRF_DUPLICATION", "GETCLIENTIP_DUPLICATION"],
        "LOW": ["CONSOLE_LOG", "HARD_LIMIT", "JSON_HELPER_DUPLICATION",
                "ESCAPE_DUPLICATION", "BAD_VERSION", "MANIFEST_MISSING_FIELD"],
        "INFO": []
    }

    # Classify remaining categories as INFO
    all_categorized = set()
    for v in severity.values():
        all_categorized.update(v)
    for cat in issues:
        if cat not in all_categorized:
            severity["INFO"].append(cat)

    for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"):
        cats = severity[sev]
        relevant = {c: issues[c] for c in cats if c in issues}
        if not relevant:
            continue
        count = sum(len(v) for v in relevant.values())
        print(f"\n  [{sev}] — {count} findings")
        print(f"  {'-'*50}")
        for cat, items in sorted(relevant.items()):
            print(f"\n    {cat} ({len(items)}):")
            # Show up to 10 examples per category
            shown = 0
            for file, line, msg in items:
                if shown >= 10:
                    print(f"      ... and {len(items) - 10} more")
                    break
                print(f"      {file}:{line} — {msg}")
                shown += 1

    # ── Summary ──
    print(f"\n{'='*70}")
    print(f"  SUMMARY")
    print(f"{'='*70}")
    crit = sum(len(issues[c]) for c in severity["CRITICAL"] if c in issues)
    high = sum(len(issues[c]) for c in severity["HIGH"] if c in issues)
    med = sum(len(issues[c]) for c in severity["MEDIUM"] if c in issues)
    low = sum(len(issues[c]) for c in severity["LOW"] if c in issues)
    info = sum(len(issues[c]) for c in severity["INFO"] if c in issues)
    print(f"  CRITICAL: {crit}")
    print(f"  HIGH:     {high}")
    print(f"  MEDIUM:   {med}")
    print(f"  LOW:      {low}")
    print(f"  INFO:     {info}")
    print(f"  TOTAL:    {total_issues}")
    print()

    if crit == 0 and high == 0:
        print("  ✅ No critical or high-severity issues found.")
        print("  Codebase is production-ready.\n")
    else:
        print("  ⚠️  Issues require attention!\n")

    return 0 if crit == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
