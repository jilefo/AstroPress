#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AstroPress GitHub Release 上传脚本（零硬编码凭据，跨平台纯标准库）。

功能：
  1. 校验发布物料（zip / checksums.txt / release-notes.md）齐备；
  2. 重算 zip 的 SHA256 并与 checksums.txt 比对，不一致即中止；
  3. 校验 git tag vX.Y.Z 存在（本地）且已推送远端（可 --skip-tag-check 跳过）；
  4. 调 GitHub REST API 创建 Release（正文取 release-notes.md），上传
     astropress-vX.Y.Z-source.zip 与 checksums.txt 两个资产；
  5. 幂等保护：Release 已存在时报错退出，需显式 --force 才覆盖资产。

凭据来源（优先级）：
  环境变量 GH_TOKEN / GITHUB_TOKEN → `gh auth token`（GitHub CLI）。

用法：
  python scripts/github_release.py                      # 发布 releases/ 下最新版本
  python scripts/github_release.py --version 1.0.4
  python scripts/github_release.py --version 1.0.4 --draft
  python scripts/github_release.py --version 1.0.4 --force
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_REPO = "jilefo/AstroPress"
API = "https://api.github.com"


def info(msg):
    print(f"[info] {msg}")


def fail(msg):
    print(f"[错误] {msg}", file=sys.stderr)
    sys.exit(1)


def get_token() -> str:
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if tok:
        return tok.strip()
    try:
        out = subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, timeout=30
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    fail("未获取到 GitHub 凭据：请先 `gh auth login`（含 workflow 与 repo 权限），"
         "或设置环境变量 GH_TOKEN。")


def api_call(method, url, token, data=None, content_type="application/json",
             raw_body=None):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "astropress-release-script",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if raw_body is not None:
        body = raw_body
        headers["Content-Type"] = content_type
    elif data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = content_type
    else:
        body = None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        try:
            detail = json.loads(detail).get("message", detail)
        except json.JSONDecodeError:
            pass
        return e.code, {"_error": detail}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git(args, cwd=ROOT):
    return subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True)


def latest_version() -> str:
    rel = os.path.join(ROOT, "releases")
    versions = [
        d for d in os.listdir(rel)
        if re.fullmatch(r"\d+\.\d+\.\d+", d)
        and os.path.isdir(os.path.join(rel, d))
    ]
    if not versions:
        fail("releases/ 下未找到版本目录")
    return sorted(versions, key=lambda v: tuple(map(int, v.split("."))))[-1]


def check_tag_pushed(version: str):
    tag = f"v{version}"
    r = git(["tag", "--list", tag])
    if tag not in r.stdout.split():
        fail(f"本地缺少 tag {tag}，请先创建：git tag -a {tag} -m \"...\"")
    r = git(["ls-remote", "--tags", "origin", tag])
    if f"refs/tags/{tag}" not in r.stdout:
        fail(f"tag {tag} 尚未推送远端，请先：git push origin {tag}")
    info(f"tag {tag} 本地与远端均存在")


def main():
    ap = argparse.ArgumentParser(description="AstroPress GitHub Release 上传脚本")
    ap.add_argument("--version", help="版本号（如 1.0.4），默认取 releases/ 下最新")
    ap.add_argument("--repo", default=DEFAULT_REPO, help=f"仓库（默认 {DEFAULT_REPO}）")
    ap.add_argument("--draft", action="store_true", help="创建为草稿 Release")
    ap.add_argument("--prerelease", action="store_true", help="标记为预发布")
    ap.add_argument("--force", action="store_true", help="Release 已存在时覆盖同名资产")
    ap.add_argument("--skip-tag-check", action="store_true", help="跳过 tag 远端校验")
    args = ap.parse_args()

    version = args.version or latest_version()
    tag = f"v{version}"
    vdir = os.path.join(ROOT, "releases", version)
    zip_name = f"astropress-v{version}-source.zip"
    zip_path = os.path.join(vdir, zip_name)
    sums_path = os.path.join(vdir, "checksums.txt")
    notes_path = os.path.join(vdir, "release-notes.md")

    for p, label in [(zip_path, "源码包"), (sums_path, "checksums.txt"),
                     (notes_path, "release-notes.md")]:
        if not os.path.isfile(p):
            fail(f"缺少{label}：{os.path.relpath(p, ROOT)}")
    info(f"发布版本 {tag}（{args.repo}）")

    # 1) SHA256 一致性
    digest = sha256_file(zip_path)
    sums_text = open(sums_path, encoding="utf-8").read()
    if digest not in sums_text.replace("\r\n", "\n"):
        fail(f"checksums.txt 与实际 zip 不一致\n  实际: {digest}")
    info(f"SHA256 校验一致：{digest[:12]}…")

    # 2) tag
    if not args.skip_tag_check:
        check_tag_pushed(version)

    # 3) token 与目标仓库
    token = get_token()
    st, repo_info = api_call("GET", f"{API}/repos/{args.repo}", token)
    if st != 200:
        fail(f"无法访问仓库 {args.repo}（HTTP {st}）：{repo_info.get('_error')}")
    info(f"目标仓库：{repo_info.get('html_url')}")

    # 4) Release 幂等检查
    st, rel = api_call("GET", f"{API}/repos/{args.repo}/releases/tags/{tag}", token)
    release_id = None
    if st == 200:
        release_id = rel["id"]
        if not args.force:
            fail(f"Release {tag} 已存在：{rel.get('html_url')}（确认覆盖请加 --force）")
        info(f"Release 已存在（id={release_id}），--force 覆盖资产")
    elif st != 404:
        fail(f"查询 Release 失败（HTTP {st}）：{rel.get('_error')}")

    notes = open(notes_path, encoding="utf-8").read()

    if release_id is None:
        payload = {
            "tag_name": tag,
            "name": tag,
            "body": notes,
            "draft": args.draft,
            "prerelease": args.prerelease,
        }
        st, rel = api_call("POST", f"{API}/repos/{args.repo}/releases", token, payload)
        if st not in (200, 201):
            fail(f"创建 Release 失败（HTTP {st}）：{rel.get('_error')}")
        release_id = rel["id"]
        info(f"Release 已创建：{rel.get('html_url')}")

    # 5) 上传资产
    assets = [
        (zip_path, zip_name, "application/zip"),
        (sums_path, "checksums.txt", "text/plain;charset=utf-8"),
    ]
    for path, name, ctype in assets:
        upload_url = (
            f"https://uploads.github.com/repos/{args.repo}/releases/"
            f"{release_id}/assets?name={name}"
        )
        with open(path, "rb") as f:
            raw = f.read()
        st, asset = api_call("POST", upload_url, token, content_type=ctype, raw_body=raw)
        if st in (422,) and args.force:
            # 同名资产已存在：删旧重传
            st2, existing = api_call(
                "GET",
                f"{API}/repos/{args.repo}/releases/{release_id}/assets",
                token,
            )
            if st2 == 200:
                for a in existing:
                    if a.get("name") == name:
                        api_call("DELETE",
                                 f"{API}/repos/{args.repo}/releases/assets/{a['id']}",
                                 token)
                        break
            st, asset = api_call("POST", upload_url, token, content_type=ctype,
                                 raw_body=raw)
        if st not in (200, 201):
            fail(f"上传资产 {name} 失败（HTTP {st}）：{asset.get('_error')}")
        info(f"已上传：{name}（{len(raw)/1024/1024:.1f} MB）")

    st, final = api_call(
        "GET", f"{API}/repos/{args.repo}/releases/{release_id}", token
    )
    print()
    print("发布完成：" + (final.get("html_url") or f"tag {tag}"))


if __name__ == "__main__":
    main()
