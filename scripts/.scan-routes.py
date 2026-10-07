#!/usr/bin/env python3
"""Scan all plugin integration.admin.ts files and extract route patterns."""
import os, re, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGINS = ROOT / "plugins"

result = {}
for d in sorted(PLUGINS.iterdir()):
    if not d.is_dir():
        continue
    integ = d / "src" / "integration.admin.ts"
    if not integ.exists():
        continue
    text = integ.read_text(encoding="utf-8")
    patterns = re.findall(r'pattern:\s*"([^"]+)"', text)
    if patterns:
        result[d.name] = patterns

print(json.dumps(result, indent=2))
print(f"\nTotal: {len(result)} plugins with routes, {sum(len(v) for v in result.values())} routes")
