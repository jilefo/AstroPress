#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第七轮深度冒烟（在 round6 的 53 项之外补覆盖）：
  A. backup：创建 -> 列表 -> 下载 zip 魔数/条目 -> 路径穿越 400
  B. media-av：最小合法 mp3/mp4 真实上传 201 -> 回源 200 -> 附件入库
  C. ai-chat：12 路并发 screenshot 全部 200/JPEG（单飞队列不炸）
  D. comments：同 IP 连发 4 条必触发 429；随后清理 pending
  E. plugin-manager：disable/enable 循环（comments / link-directory / media-av）
全程不执行 restore。
"""
import os
import io
import json
import sys
import time
import zipfile
import concurrent.futures as cf

import requests

BASE = "http://localhost:4321"
passed = 0
failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {extra}")


def login():
    s = requests.Session()
    r = s.post(
        f"{BASE}/api/auth/login",
        data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")},
        allow_redirects=False,
    )
    check("login 302", r.status_code in (302, 303), f"got {r.status_code}")
    return s


def main():
    s = login()

    # ---------- A. backup ----------
    print("[A] backup create/download")
    r = s.post(f"{BASE}/admin-ext/api/backup/create", json={}, timeout=120)
    check("create 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    entry = r.json().get("entry", {}) if r.ok else {}
    fname = entry.get("file", "")
    check("entry.file 非空且 .apzip", fname.endswith(".apzip"), fname)
    check("tablesCount>0", (entry.get("tablesCount") or 0) > 0, str(entry))

    r = s.get(f"{BASE}/admin-ext/api/backup/list", timeout=60)
    check("list 200", r.status_code == 200, r.text[:150])
    files = [x.get("file") for x in r.json().get("entries", [])]
    check("list 含新备份", fname in files, str(files[:5]))

    r = s.get(f"{BASE}/admin-ext/api/backup/download", params={"file": fname}, timeout=120)
    check("download 200", r.status_code == 200, f"{r.status_code}")
    check("zip 魔数 PK\\x03\\x04", r.content[:4] == b"PK\x03\x04", r.content[:8].hex())
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    check("zip 内含 manifest.json", any(n.endswith("manifest.json") for n in names), str(names[:8]))
    check("zip 内含数据库 dump", any("local.db" in n or n.endswith(".sql") for n in names), str(names[:8]))
    bad = zf.testzip()
    check("zip CRC 完整", bad is None, str(bad))

    r = s.get(f"{BASE}/admin-ext/api/backup/download", params={"file": "../../../Windows/win.ini"})
    check("路径穿越 400", r.status_code == 400, f"{r.status_code}")
    r = s.get(f"{BASE}/admin-ext/api/backup/download", params={"file": "backup-does-not-exist.apzip"})
    check("不存在文件 404", r.status_code == 404, f"{r.status_code}")

    # ---------- B. media-av ----------
    print("[B] media-av 真实文件上传")
    mp3 = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\x00" * 4096
    r = s.post(
        f"{BASE}/api/ap-media-av/upload",
        data={"kind": "audio"},
        files={"file": ("round7.mp3", mp3, "audio/mpeg")},
        timeout=60,
    )
    check("mp3 上传 201", r.status_code == 201, f"{r.status_code} {r.text[:200]}")
    mp3info = r.json() if r.ok else {}
    check("mp3 mime 嗅探 audio/mpeg", mp3info.get("mime") == "audio/mpeg", str(mp3info))
    if mp3info.get("url"):
        g = s.get(mp3info["url"], timeout=30)
        check("mp3 回源 200", g.status_code == 200, f"{g.status_code}")
        check("mp3 字节一致", g.content == mp3, f"{len(g.content)} vs {len(mp3)}")
        check("mp3 Content-Type", g.headers.get("content-type", "").startswith("audio/"),
              g.headers.get("content-type"))

    # 最小 ftyp mp4（size=24, brand=mp42）
    box = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42"
    mp4 = box + b"\x00" * 4096
    r = s.post(
        f"{BASE}/api/ap-media-av/upload",
        data={"kind": "video"},
        files={"file": ("round7.mp4", mp4, "video/mp4")},
        timeout=60,
    )
    check("mp4 上传 201", r.status_code == 201, f"{r.status_code} {r.text[:200]}")
    mp4info = r.json() if r.ok else {}
    check("mp4 mime 嗅探 video/mp4", mp4info.get("mime") == "video/mp4", str(mp4info))
    if mp4info.get("url"):
        g = s.get(mp4info["url"], timeout=30)
        check("mp4 回源 200", g.status_code == 200, f"{g.status_code}")

    # 伪装：exe 改名 mp3 必须被 magic bytes 拒绝
    r = s.post(
        f"{BASE}/api/ap-media-av/upload",
        data={"kind": "audio"},
        files={"file": ("evil.mp3", b"MZ\x90\x00" + b"\x00" * 4096, "audio/mpeg")},
        timeout=60,
    )
    check("伪造扩展名 415", r.status_code == 415, f"{r.status_code} {r.text[:120]}")

    # ---------- C. ai-chat 并发 ----------
    print("[C] ai-chat 并发 screenshot")
    r = s.post(f"{BASE}/admin-ext/api/ai-chat/view",
               json={"provider": "deepseek", "action": "open", "target": "login"}, timeout=90)
    check("view open 200", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
    time.sleep(2)

    def shot(i):
        g = requests.get(
            f"{BASE}/admin-ext/api/ai-chat/screenshot",
            params={"provider": "deepseek", "t": str(time.time_ns())},
            cookies=s.cookies.get_dict(),
            timeout=60,
        )
        return g.status_code, g.headers.get("content-type", ""), g.content[:3]

    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(shot, range(12)))
    ok_shot = [x for x in results if x[0] == 200 and x[1].startswith("image/") and x[2] == b"\xff\xd8\xff"]
    check("12 路并发截图全部 200/JPEG", len(ok_shot) == 12, str(results[:3]))

    r = s.post(f"{BASE}/admin-ext/api/ai-chat/view", json={"provider": "deepseek", "action": "info"}, timeout=30)
    check("view info 200", r.status_code == 200 and bool(r.json().get("url")), r.text[:150])

    # ---------- D. comments 频控 ----------
    print("[D] comments 频控边界")
    slug = "pv-tips"  # 必须是已存在文章；autoApprove=false 时 pending 不公开
    codes = []
    for i in range(4):
        r = requests.post(
            f"{BASE}/ap-comments/submit",
            json={"slug": slug, "author": f"rl{i}", "email": f"rl{i}@example.com",
                  "website": "", "content": f"R7RATEPROBE {i} {time.time_ns()}"},
            timeout=30,
        )
        codes.append(r.status_code)
    check("4 连发中出现 429", 429 in codes, str(codes))
    check("没有 5xx", all(c < 500 for c in codes), str(codes))

    # 清理本轮探针 pending 评论（翻页查找；action 用 ids 数组）
    dead = []
    for page in range(1, 6):
        r = s.get(f"{BASE}/admin-ext/api/comments/list",
                  params={"status": "pending", "page": page}, timeout=30)
        if not r.ok:
            break
        data = r.json()
        for row in data.get("items", []):
            if row.get("postName") == slug and "R7RATEPROBE" in (row.get("content") or ""):
                dead.append(row["id"])
        if page * data.get("perPage", 20) >= data.get("total", 0):
            break
    if dead:
        d = s.post(f"{BASE}/admin-ext/api/comments/action",
                   json={"ids": dead, "action": "delete"}, timeout=30)
        check(f"清理 {len(dead)} 条频控探针评论", d.status_code == 200, d.text[:120])
    else:
        check("清理频控探针评论（无残留）", True)

    # ---------- E. 插件启停循环 ----------
    print("[E] plugin-manager disable/enable")
    r = s.get(f"{BASE}/admin-ext/api/plugin-manager/state", timeout=30)
    slugs = {p["slug"]: p.get("enabled") for p in r.json()}
    for need in ("comments", "link-directory", "media-av"):
        check(f"注册表含 {need}", need in slugs, str(sorted(slugs)))

    def toggle(slug, enabled):
        return s.post(f"{BASE}/admin-ext/api/plugin-manager/state",
                      json={"slug": slug, "enabled": enabled}, timeout=30)

    # comments
    check("disable comments", toggle("comments", False).status_code == 200)
    r = requests.post(f"{BASE}/ap-comments/submit",
                      json={"slug": slug, "author": "x", "email": "x@example.com",
                            "website": "", "content": "after disable"}, timeout=30)
    check("禁用后提交 404", r.status_code == 404, f"{r.status_code}")
    check("enable comments", toggle("comments", True).status_code == 200)
    r = requests.post(f"{BASE}/ap-comments/submit",
                      json={"slug": slug, "author": "bad", "email": "not-an-email",
                            "website": "", "content": "after enable"}, timeout=30)
    check("启用后路由复活(非404)", r.status_code != 404, f"{r.status_code}")

    # link-directory
    check("disable link-directory", toggle("link-directory", False).status_code == 200)
    r = requests.get(f"{BASE}/directory", timeout=30)
    check("禁用后 /directory 404", r.status_code == 404, f"{r.status_code}")
    r = requests.get(f"{BASE}/ap-links/click", params={"id": 1}, timeout=30)
    check("禁用后 /ap-links/click 404", r.status_code == 404, f"{r.status_code}")
    check("enable link-directory", toggle("link-directory", True).status_code == 200)
    r = requests.get(f"{BASE}/directory", timeout=30)
    check("启用后 /directory 200", r.status_code == 200, f"{r.status_code}")

    # media-av
    check("disable media-av", toggle("media-av", False).status_code == 200)
    r = s.get(f"{BASE}/api/ap-media-av/media-av.js", timeout=30)
    check("禁用后脚本 404", r.status_code == 404, f"{r.status_code}")
    check("enable media-av", toggle("media-av", True).status_code == 200)
    r = s.get(f"{BASE}/api/ap-media-av/media-av.js", timeout=30)
    check("启用后脚本 200", r.status_code == 200, f"{r.status_code}")

    # 非法 toggle
    r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state",
               json={"slug": "comments", "enabled": "yes"}, timeout=30)
    check("enabled 非布尔 400", r.status_code == 400, f"{r.status_code}")
    # 未知 slug：当前实现宽容落库（不影响守卫，因注册表无匹配）
    r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state",
               json={"slug": "does-not-exist", "enabled": False}, timeout=30)
    check("未知 slug 不 5xx", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
    r = s.post(f"{BASE}/admin-ext/api/plugin-manager/state",
               json={"slug": "bad slug!!", "enabled": False}, timeout=30)
    check("非法 slug 字符 400", r.status_code == 400, f"{r.status_code}")

    print(f"\n== round7: {passed} passed, {failed} failed ==")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
