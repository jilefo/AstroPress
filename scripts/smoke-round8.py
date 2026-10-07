#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第八轮：config-io 导出 → merge 原样导入回环 + 负例。
merge 只 upsert 导出中存在的键，导出端已剥离 secret，故回环不破坏现有配置。
"""
import os
import json
import sys
import requests

BASE = "http://localhost:4321"
passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print("  PASS ", name)
    else:
        failed += 1
        print("  FAIL ", name, " ", extra)


def main():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")},
               allow_redirects=False)
    check("login", r.status_code in (302, 303), str(r.status_code))

    # 1. 导出
    r = s.get(f"{BASE}/admin-ext/api/config-io/export", timeout=60)
    check("export 200", r.status_code == 200, r.text[:150])
    check("export 是 JSON 附件", "application/json" in r.headers.get("content-type", ""),
          r.headers.get("content-type"))
    data = r.json()
    check("envelope 顶层键", {"app", "kind", "version", "sections"} <= set(data),
          str(list(data)))
    blob = r.content
    # content 段含 post_password 列名（WP 兼容），但其值必须全部为空串；
    # 真正的密钥类 option（AUTH_SECRET 等）在导出端已剥离。
    text = blob.decode("utf-8", errors="replace")
    import re
    nonempty_pw = [v for v in re.findall(r'"post_password":\s*"([^"]*)"', text) if v]
    check("post_password 全部为空", not nonempty_pw, str(nonempty_pw[:3]))
    check("AUTH_SECRET 不导出", "auth_secret" not in text.lower()
          and '"AUTH_SECRET"' not in text, "")
    check("setup_complete 不导出", "setup_complete" not in text, "")

    # 2. 回环 merge 导入同一文件
    r = s.post(
        f"{BASE}/admin-ext/api/config-io/import",
        files={"file": ("config.json", blob, "application/json")},
        data={"mode": "merge"},
        timeout=60,
    )
    check("merge 回环 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    body = r.json() if r.ok else {}
    updated = (body.get("summary") or {}).get("updated")
    check("回环返回 updated 统计", isinstance(updated, int), str(body)[:200])
    check("回环 0 failed", (body.get("summary") or {}).get("failed") == 0, str(body)[:200])

    # 3. 再导出比对（忽略 exportedAt 时间戳，其余应字节一致）
    r2 = s.get(f"{BASE}/admin-ext/api/config-io/export", timeout=60)
    check("二次导出 200", r2.status_code == 200, r2.text[:150])
    norm = lambda b: re.sub(rb'"exportedAt"\s*:\s*"[^"]*"', b'"exportedAt":"T"', b)
    check("回环后配置一致（除时间戳）", norm(r2.content) == norm(blob),
          f"{len(blob)} vs {len(r2.content)}")

    # 4. 负例
    r = s.post(f"{BASE}/admin-ext/api/config-io/import",
               files={"file": ("x.json", b"{not json", "application/json")},
               data={"mode": "merge"}, timeout=30)
    check("非法 JSON 400", r.status_code == 400, str(r.status_code))

    r = s.post(f"{BASE}/admin-ext/api/config-io/import",
               files={"file": ("x.json", json.dumps({"app": "x"}), "application/json")},
               data={"mode": "merge"}, timeout=30)
    check("残缺 envelope 400", r.status_code in (400, 422), f"{r.status_code} {r.text[:120]}")

    r = s.post(f"{BASE}/admin-ext/api/config-io/import",
               files={"file": ("c.json", blob, "application/json")},
               data={"mode": "merge", "sections": "bogus-section"}, timeout=30)
    check("未知 section 400", r.status_code == 400, f"{r.status_code}")

    r = requests.post(f"{BASE}/admin-ext/api/config-io/import",
                      files={"file": ("c.json", blob, "application/json")},
                      data={"mode": "merge"}, timeout=30,
                      allow_redirects=False)
    check("未登录导入 302", r.status_code in (302, 303, 401), str(r.status_code))
    r = requests.get(f"{BASE}/admin-ext/api/config-io/export",
                     allow_redirects=False, timeout=30)
    check("未登录导出 302", r.status_code in (302, 303, 401), str(r.status_code))

    # 5. 20MB 上限
    big = b'{"app":"astropress","kind":"config","version":1,"sections":[],"x":"' + b"a" * (21 * 1024 * 1024) + b'"}'
    r = s.post(f"{BASE}/admin-ext/api/config-io/import",
               files={"file": ("big.json", big, "application/json")},
               data={"mode": "merge"}, timeout=60)
    check("超 20MB 413", r.status_code == 413, str(r.status_code))

    print(f"\n== round8: {passed} passed, {failed} failed ==")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
