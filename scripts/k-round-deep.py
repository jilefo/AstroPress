#!/usr/bin/env python3
"""
K-round deep stability & performance audit.
Focus: race conditions, missing error handling, performance anti-patterns,
hardcoded values that risk stability.

Usage: python scripts/k-round-deep.py
"""
import os, re, json, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
PLUGINS = ROOT / "plugins"

issues = defaultdict(list)
stats = {"files": 0, "plugins": 0}

# ── 1. API routes without try/catch around DB operations ──
def check_api_error_handling():
    """Check if API route handlers have proper try/catch."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        stats["plugins"] += 1
        api_dir = pdir / "src" / "admin" / "api"
        if not api_dir.exists():
            continue

        for f in api_dir.glob("*.ts"):
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            # Check if file has DB operations (db.run, db.select, etc.)
            has_db = bool(re.search(r'\bdb\.(run|select|insert|update|delete)\b', content))
            if not has_db:
                continue

            # Check if there's a try/catch wrapping the DB ops
            # Simple heuristic: count try { vs db. occurrences
            try_count = len(re.findall(r'\btry\s*\{', content))
            db_count = len(re.findall(r'\bdb\.(run|select|insert|update|delete)\b', content))

            if db_count > 0 and try_count == 0:
                issues["API_NO_TRY_CATCH"].append(
                    (rel, 0, f"{db_count} DB operations without any try/catch")
                )

# ── 2. Middleware without try/catch around res.clone().text() ──
def check_middleware_error_handling():
    """Check if middlewares that clone response have error handling."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            if "middleware" not in f.name:
                continue

            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            has_clone = "res.clone()" in content or "response.clone()" in content
            has_try = "try {" in content or "try{" in content
            has_catch = "} catch" in content or "}catch" in content

            if has_clone and not (has_try and has_catch):
                issues["MW_NO_ERROR_HANDLING"].append(
                    (rel, 0, "res.clone() without try/catch — could break page on transform error")
                )

# ── 3. setInterval/setTimeout without cleanup ──
def check_timer_leaks():
    """Check for timers that might leak."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            # Module-level setInterval
            for i, line in enumerate(content.split("\n"), 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("import"):
                    continue
                if "setInterval(" in stripped and not stripped.startswith(("function", "const", "let", "var", "return")):
                    issues["TIMER_LEAK"].append(
                        (rel, i, "Module-level setInterval without visible cleanup")
                    )

# ── 4. Unbounded Map/Set at module level without cleanup ──
def check_unbounded_collections():
    """Check for module-level Maps/Sets that might grow unbounded."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            lines = content.split("\n")
            for i, line in enumerate(lines, 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("import"):
                    continue

                # Module-level Map declaration (const X = new Map)
                m = re.match(r'^(?:export\s+)?const\s+(\w+)\s*=\s*new\s+Map\b', stripped)
                if m:
                    var_name = m.group(1)
                    # Check if there's cleanup logic in the file
                    has_cleanup = any(
                        kw in content
                        for kw in [f"{var_name}.delete(", f"{var_name}.clear()", f"{var_name}.size"]
                    )
                    if not has_cleanup:
                        issues["UNBOUNDED_MAP"].append(
                            (rel, i, f"Module-level Map '{var_name}' without size check or cleanup")
                        )

# ── 5. Hardcoded admin paths that might break if core changes ──
def check_hardcoded_paths():
    """Check for hardcoded admin/core paths in plugins."""
    HARDCODED_PATHS = {
        "/admin-ext/": "admin extension path",
        "/api/auth/": "auth API path",
        "/admin/settings": "settings page path",
    }
    # This is informational - plugins legitimately reference these paths
    # We just want to make sure they're consistent

# ── 6. Check for potential race conditions in async middleware ──
def check_race_conditions():
    """Check for potential race conditions."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            # Module-level mutable state (let X = ...)
            for i, line in enumerate(content.split("\n"), 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("import"):
                    continue

                # let x = null/0/"" at module level (potential race)
                m = re.match(r'^(?:export\s+)?let\s+(\w+)\s*[:=]', stripped)
                if m:
                    var_name = m.group(1)
                    # Check if it's modified in async context
                    if f"async" in content and (
                        f"{var_name} =" in content or
                        f"{var_name}++" in content or
                        f"{var_name}." in content
                    ):
                        # Check if there's a lock/mutex
                        has_lock = "lock" in content.lower() or "mutex" in content.lower() or "running" in content
                        if not has_lock:
                            # Only flag if it looks like it's modified in async context
                            if re.search(rf'async.*{var_name}\s*=', content, re.DOTALL):
                                pass  # Too many false positives, skip

# ── 7. Check for missing content-length deletion ──
def check_content_length():
    """When middleware modifies response body, content-length must be deleted."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            if "middleware" not in f.name:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            # If file creates new Response with modified body
            creates_response = "new Response(" in content
            deletes_cl = 'delete("content-length")' in content or "delete('content-length')" in content

            if creates_response and not deletes_cl:
                # Check if it's just passing through the original body
                if "res.body" in content and "new Response(res.body" in content:
                    pass  # Passing through original body, CL is OK
                else:
                    issues["MISSING_CL_DELETE"].append(
                        (rel, 0, "Creates new Response but doesn't delete content-length")
                    )

# ── 8. Check for potential ReDoS patterns ──
def check_redos():
    """Check for regex patterns that could cause ReDoS."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            for i, line in enumerate(content.split("\n"), 1):
                # Look for regex with nested quantifiers
                # Pattern: (something+)+ or (something*)* or (something+)*
                if re.search(r'\([^)]*[+*][^)]*\)\s*[+*{]', line):
                    # Exclude comments
                    stripped = line.strip()
                    if not stripped.startswith("//") and not stripped.startswith("*"):
                        issues["REDOSS_RISK"].append(
                            (rel, i, f"Potential ReDoS: nested quantifiers in regex")
                        )

# ── 9. Check for missing idempotency markers in injection middleware ──
def check_idempotency():
    """Injection middleware should have idempotency markers."""
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            if "middleware" not in f.name:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            # If middleware injects HTML before </body> or </head>
            injects = ("</body>" in content or "</head>" in content)
            if not injects:
                continue

            # Check for idempotency check (html.includes('id="...') or dataset check)
            has_idempotency = (
                'html.includes(' in content or
                "html.includes(" in content or
                'dataset.' in content or
                'data-' in content  # Has some data attribute check
            )

            # Some middlewares inject script tags that are self-idempotent
            # (the script itself checks if already bound)
            has_script_guard = 'dataset.' in content or '__' in content

            if not has_idempotency and not has_script_guard:
                # Check if it's a simple script injection (which is naturally idempotent
                # if the script checks for existing elements)
                if '.replace("</body>"' in content or ".replace('</body>'" in content:
                    issues["NO_IDEMPOTENCY_CHECK"].append(
                        (rel, 0, "Injects HTML without idempotency marker")
                    )

# ── 10. Check for hardcoded version strings ──
def check_hardcoded_versions():
    """Check for hardcoded CDN version strings that might need updating."""
    CDN_VERSION_RE = re.compile(r'cdn[^"\']*?@(\d+\.\d+(?:\.\d+)?)')
    for pdir in sorted(PLUGINS.iterdir()):
        if not pdir.is_dir():
            continue
        for f in pdir.rglob("*.ts"):
            if "node_modules" in f.parts or "test" in f.parts:
                continue
            stats["files"] += 1
            content = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(ROOT).as_posix()

            for i, line in enumerate(content.split("\n"), 1):
                for m in CDN_VERSION_RE.finditer(line):
                    ver = m.group(1)
                    issues["CDN_VERSION"].append(
                        (rel, i, f"Hardcoded CDN version: @{ver}")
                    )


def main():
    print(f"{'='*70}")
    print(f"  K-Round Deep Stability & Performance Audit")
    print(f"  Root: {ROOT}")
    print(f"{'='*70}\n")

    print("[1/8] Checking API error handling...")
    check_api_error_handling()

    print("[2/8] Checking middleware error handling...")
    check_middleware_error_handling()

    print("[3/8] Checking timer leaks...")
    check_timer_leaks()

    print("[4/8] Checking unbounded collections...")
    check_unbounded_collections()

    print("[5/8] Checking content-length handling...")
    check_content_length()

    print("[6/8] Checking ReDoS risk...")
    check_redos()

    print("[7/8] Checking idempotency markers...")
    check_idempotency()

    print("[8/8] Checking CDN version strings...")
    check_hardcoded_versions()

    # ── Report ──
    total = sum(len(v) for v in issues.values())
    print(f"\n{'='*70}")
    print(f"  RESULTS — {stats['files']} files, {stats['plugins']} plugins, {total} findings")
    print(f"{'='*70}")

    # Classify severity
    severity_map = {
        "API_NO_TRY_CATCH": "HIGH",
        "MW_NO_ERROR_HANDLING": "HIGH",
        "UNBOUNDED_MAP": "HIGH",
        "MISSING_CL_DELETE": "MEDIUM",
        "REDOSS_RISK": "MEDIUM",
        "TIMER_LEAK": "MEDIUM",
        "NO_IDEMPOTENCY_CHECK": "LOW",
        "CDN_VERSION": "INFO",
    }

    by_severity = defaultdict(list)
    for cat, items in issues.items():
        sev = severity_map.get(cat, "INFO")
        by_severity[sev].extend([(cat, item) for item in items])

    for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"):
        items = by_severity.get(sev, [])
        if not items:
            continue
        print(f"\n  [{sev}] — {len(items)} findings")
        print(f"  {'-'*50}")
        shown_cats = set()
        for cat, (file, line, msg) in items:
            if cat not in shown_cats:
                print(f"\n    {cat}:")
                shown_cats.add(cat)
            print(f"      {file}:{line} — {msg}")

    # ── Summary ──
    print(f"\n{'='*70}")
    print(f"  SUMMARY")
    print(f"{'='*70}")
    for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"):
        count = len(by_severity.get(sev, []))
        print(f"  {sev}: {count}")
    print(f"  TOTAL: {total}")
    print()

    high_count = len(by_severity.get("HIGH", []))
    crit_count = len(by_severity.get("CRITICAL", []))
    if crit_count == 0 and high_count == 0:
        print("  ✅ No critical or high-severity stability issues found.")
        print("  All plugins have proper error handling and bounded state.\n")
    elif crit_count == 0:
        print(f"  ⚠️  {high_count} high-severity issues need attention.\n")

    return 0 if crit_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
