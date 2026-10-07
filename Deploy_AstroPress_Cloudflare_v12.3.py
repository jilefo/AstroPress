#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AstroPress 一体化部署管理 v12.3 (Python 版)
运行: 双击 deploy.bat; 或命令行 deploy.bat RESET 一键重装
保存为 UTF-8 编码。仅用 Python 标准库, 零第三方依赖。

核心逻辑:
  - [03] Git 自动安装: PATH检测 → 常见目录 → 本地工具回收
    (扫描 D:\DevTools 任意命名目录如 yq/xh, 复用不下载)
    → GitHub API取链接 + 三通道下载 + 完整版静默安装
    (注册表持久写PATH) → MinGit zip 兜底
  - [06b] Go 自动安装: 同五层策略, 官方 JSON API取链接
    + 三通道下载 + SHA256校验 + MSI静默安装到 D:\DevTools\Go
    → zip 免安装兜底; GOPATH 隔离到 D:\DevTools\go-path
  - [07] 本地仓库不存在时自动 Clone (两种模式均会经过此步)
  - [10] d1 list 获取真实 database_id → [13] 按官方 deployment.md
    Pages 模板重建 wrangler.toml (nodejs_compat + vars + DB/R2/AI)
  - [15] pages deploy, 目录/项目名由 toml 统一提供
  - [16] 迁移 SQL 优先在 packages/core/migrations 查找
  - [09]~[12] 在 BASE_DIR 执行, 不被仓库原生坏 toml 拦截
  - run() 对命令不存在免疫 (返回 127, 不抛异常)
  - 重建模式: 删 Pages/R2/D1 后自动接续完整部署, R2 非空可用
    REST API 自动清空(需配置凭据), 否则降级 Dashboard 指引
"""
import os
import sys
import re
import json
import time
import ctypes
import shutil
import zipfile
import hashlib
import subprocess
import urllib.request
import urllib.error

# ==================== 用户配置区 ====================
TOOLS_DIR     = r"D:\DevTools"
REPO_URL      = "https://github.com/jilefo/AstroPress"
PROJECT_NAME  = "astropress"
R2_BUCKET     = "astropress-media"
GIT_VER       = "2.47.1"
GIT_INSTALL_DIR     = os.path.join(TOOLS_DIR, "Git")   # 完整版安装目标目录
GIT_INSTALL_TIMEOUT = 600                              # 安装器超时(秒)
GO_INSTALL_DIR = os.path.join(TOOLS_DIR, "Go")         # Go 安装目标目录
GO_TIMEOUT     = 900                                    # Go 下载/安装超时(秒)
GH_PROXY      = ""   # 可填自用镜像, 如 https://ghfast.top/
CF_API_TOKEN  = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CF_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
# ====================================================

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
REPO      = os.path.join(BASE_DIR, "AstroPress")
APP_DIR   = os.path.join(REPO, "apps", "admin")
LOG_PATH  = os.path.join(BASE_DIR, "astropress-deploy.log")
TOML_PATH = os.path.join(APP_DIR, "wrangler.toml")

LOG_FH = None
GIT_EXE = None   # ensure_git 解析后缓存


def log(msg, to_console=True):
    if LOG_FH:
        LOG_FH.write(msg + "\n")
        LOG_FH.flush()
    if to_console:
        print(msg)


def banner(n, name):
    log(f">> [{n}] {name}")


def ok(msg=""):
    log(f"  [OK] {msg}")


def warn(msg):
    log(f"  [WARN] {msg}")


def fail(msg):
    log(f"  [FAIL] {msg}")
    raise RuntimeError(msg)


# ==================== 环境准备 ====================
def setup_env():
    """直接修改 os.environ: 本进程是专用部署进程, 污染自身环境
    零风险, 且 shutil.which / 子进程 / 一切辅助函数读同一份 PATH"""
    for d in ("npm-cache", "npm-global", "pnpm", "pnpm-store", "corepack",
              "node-gyp", "temp", "wrangler", "python", "openssh", "git",
              "go-path"):
        os.makedirs(os.path.join(TOOLS_DIR, d), exist_ok=True)
    home = os.path.join(TOOLS_DIR, "openssh", "home")
    os.makedirs(os.path.join(home, ".ssh"), exist_ok=True)

    tmp = os.path.join(TOOLS_DIR, "temp")
    os.environ["TEMP"] = tmp
    os.environ["TMP"] = tmp
    os.environ["npm_config_cache"] = os.path.join(TOOLS_DIR, "npm-cache")
    os.environ["npm_config_prefix"] = os.path.join(TOOLS_DIR, "npm-global")
    os.environ["npm_config_store_dir"] = os.path.join(TOOLS_DIR, "pnpm-store")
    os.environ["npm_config_yes"] = "true"
    os.environ["NPM_CONFIG_YES"] = "true"
    os.environ["PNPM_HOME"] = os.path.join(TOOLS_DIR, "pnpm")
    os.environ["COREPACK_HOME"] = os.path.join(TOOLS_DIR, "corepack")
    os.environ["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    os.environ["COREPACK_ENABLE_AUTO_PIN"] = "0"
    os.environ["XDG_CONFIG_HOME"] = os.path.join(TOOLS_DIR, "wrangler")
    os.environ["HOME"] = home
    os.environ["CI"] = "1"
    os.environ["WRANGLER_SEND_METRICS"] = "false"
    os.environ["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    # Go 环境隔离: GOPATH/模块缓存全在 TOOLS_DIR, 国内加速 GOPROXY
    gopath = os.path.join(TOOLS_DIR, "go-path")
    os.makedirs(os.path.join(gopath, "bin"), exist_ok=True)
    os.environ["GOPATH"] = gopath
    os.environ["GOMODCACHE"] = os.path.join(gopath, "pkg", "mod")
    os.environ["GOPROXY"] = "https://goproxy.cn,direct"
    os.environ["PATH"] = os.pathsep.join([
        os.path.join(TOOLS_DIR, "npm-global"),
        os.path.join(TOOLS_DIR, "pnpm"),
        os.environ.get("PATH", ""),
    ])


setup_env()


# ==================== 子进程封装 ====================
def run(cmd, cwd=None, capture=True):
    """执行命令, 返回 (returncode, 合并输出); 环境继承 os.environ
    命令文件不存在时返回 127, 不抛异常"""
    try:
        p = subprocess.run(
            cmd, cwd=cwd,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.STDOUT if capture else None,
            text=True, errors="replace")
        return p.returncode, (p.stdout or "")
    except FileNotFoundError:
        return 127, f"command not found: {cmd[0]}"


def npx_wrangler(args, cwd=None, capture=True):
    npx = shutil.which("npx") or "npx"
    return run([npx, "--yes", "wrangler"] + args, cwd=cwd, capture=capture)


# ==================== 基础下载 ====================
def download(url, dest):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        return os.path.getsize(dest) > 0
    except Exception as e:
        warn(f"下载失败 {url}: {e}")
        return False


def dl_github(url, dest):
    if GH_PROXY and download(GH_PROXY + url, dest):
        return True
    if download(url, dest):
        return True
    for m in ("https://ghfast.top/", "https://gh-proxy.com/", "https://ghproxy.net/"):
        if download(m + url, dest):
            return True
    return False


def download_with_progress(url, dest, timeout=600):
    """带进度条的下载, 成功返回 True"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Python-urllib/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r, open(dest, "wb") as f:
            total = int(r.headers.get("Content-Length", 0))
            got = 0
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                got += len(chunk)
                if total:
                    print(f"\r  下载 {got*100//total}% "
                          f"({got>>20}MB/{total>>20}MB)", end="", flush=True)
        print()
        return os.path.getsize(dest) > 1_000_000
    except Exception as e:
        print()
        warn(f"下载失败 {url}: {e}")
        return False


def download_and_verify(url, dest, sha256):
    """带进度条下载 + SHA256 校验, 任一失败返回 False"""
    if not download_with_progress(url, dest):
        return False
    if not sha256:
        return True
    h = hashlib.sha256()
    with open(dest, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest().lower() != sha256.lower():
        warn(f"SHA256 校验失败: {url}")
        try:
            os.remove(dest)
        except OSError:
            pass
        return False
    return True


# ==================== 本地工具回收 (先找后下, 不重复安装) ====================
SCAN_SKIP_DIRS = {"npm-cache", "npm-global", "pnpm", "pnpm-store", "corepack",
                  "node-gyp", "temp", "wrangler", "python", "openssh",
                  "git", "go", "go-path", "node_modules", "$recycle.bin"}

TOOL_REL_PATHS = {
    "go.exe":  (r"bin\go.exe",),
    "git.exe": (r"cmd\git.exe", r"bin\git.exe", r"mingit64\cmd\git.exe"),
}


def adopt_local_tool(exe_name, dest_dir, label):
    """L2.5 本地回收: 扫描 TOOLS_DIR 下任意命名的子目录(yq/xh等),
    复用已有工具, 绝不下载。
    规范位置已有 → 直接返回
    其他目录发现 → 整目录复制到规范位置 → 校验 → 删除原目录
    都没有 → 返回 None, 交给下载安装层"""
    rels = TOOL_REL_PATHS[exe_name]
    # 规范位置已存在, 什么都不用做
    for rel in rels:
        p = os.path.join(dest_dir, rel)
        if os.path.exists(p):
            return p
    try:
        entries = os.listdir(TOOLS_DIR)
    except OSError:
        return None
    dest_norm = os.path.abspath(dest_dir).lower()
    for entry in entries:
        src = os.path.join(TOOLS_DIR, entry)
        if not os.path.isdir(src):
            continue
        if entry.lower() in SCAN_SKIP_DIRS:
            continue
        if os.path.abspath(src).lower() == dest_norm:
            continue
        for rel in rels:
            cand = os.path.join(src, rel)
            if not os.path.exists(cand):
                continue
            print(f"  [..] 在 {src} 发现已有 {label}, 迁移到 {dest_dir} ...")
            try:
                shutil.copytree(src, dest_dir, dirs_exist_ok=True)
            except Exception as e:
                warn(f"迁移失败, 直接使用原位置: {e}")
                return cand
            new_exe = os.path.join(dest_dir, rel)
            if os.path.exists(new_exe):
                shutil.rmtree(src, ignore_errors=True)
                ok(f"{label} 已迁移到 {dest_dir} (原目录已删除)")
                return new_exe
            shutil.rmtree(dest_dir, ignore_errors=True)
            return cand
    return None


# ==================== Git 自动安装 ====================
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def git_latest_url_via_api():
    """GitHub API 取最新版 64 位安装包真实链接, 避免版本号拼错 404"""
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/git-for-windows/git/releases/latest",
            headers={"User-Agent": "Python-urllib/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        tag = data.get("tag_name", "")
        for a in data.get("assets", []):
            n = a.get("name", "")
            if n.startswith("Git-") and n.endswith("64-bit.exe"):
                return tag, a.get("browser_download_url"), n
    except Exception as e:
        warn(f"GitHub API 查询失败: {e}")
    return None, None, None


def download_installer_any(tag, url, fname, dest):
    """三通道: API直链 → 镜像代理 → 华为云完整版(拼版本号)"""
    # 1) API 直链
    if url and download_with_progress(url, dest):
        return True
    # 2) GitHub 镜像代理(API 直链)
    if url:
        for m in ("https://ghfast.top/", "https://gh-proxy.com/",
                  "https://ghproxy.net/"):
            if GH_PROXY and download_with_progress(GH_PROXY + url, dest):
                return True
            if download_with_progress(m + url, dest):
                return True
    # 3) 华为云(需拼版本号, 仅兜底)
    if tag:
        v = tag.lstrip("v").split(".windows")[0]          # 2.47.1
        w = tag.split(".windows.")[1] if ".windows." in tag else "1"
        h = (f"https://repo.huaweicloud.com/git-for-windows/"
             f"v{v}.windows.{w}/{fname}")
        if download_with_progress(h, dest):
            return True
    return False


def silent_install_git(installer, install_dir):
    """静默安装完整版 Git 到 install_dir, 返回 cmd/git.exe 路径"""
    tmp = os.path.dirname(installer)
    inf = os.path.join(tmp, "git_install.inf")
    with open(inf, "w", encoding="utf-8") as f:
        f.write(f"""[Setup]
Lang=default
Dir={install_dir}
Group=Git
NoIcons=0
SetupType=default
Components=gitlfs,assoc,assoc_sh,windowsterminal
Tasks=
""")
    print("  [..] 静默安装 Git for Windows, 请稍候(1-3 分钟)...")
    try:
        p = subprocess.run(
            [installer, "/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-",
             f"/LOADINF={inf}",
             f"/LOG={os.path.join(tmp, 'git_install.log')}"],
            capture_output=True, text=True, timeout=GIT_INSTALL_TIMEOUT)
    except subprocess.TimeoutExpired:
        warn("安装器超时")
        return None
    for exe in (os.path.join(install_dir, "cmd", "git.exe"),
                os.path.join(install_dir, "bin", "git.exe")):
        if os.path.exists(exe):
            return exe
    warn(f"安装后未找到 git.exe (安装器返回码 {p.returncode})")
    return None


def persist_path(dirs):
    """把目录持久写入 PATH: 管理员写系统级, 否则写用户级;
    同时刷新当前进程 PATH"""
    added = []
    cur = [p for p in os.environ.get("PATH", "").split(os.pathsep) if p]
    for d in dirs:
        if d and not any(d.lower() == p.lower() for p in cur):
            cur.insert(0, d)
            added.append(d)
    os.environ["PATH"] = os.pathsep.join(cur)
    if not added:
        return True
    root = ("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"
            if is_admin() else "HKCU\\Environment")
    try:
        r = subprocess.run(["reg", "query", root, "/v", "Path"],
                           capture_output=True, text=True)
        old = ""
        for line in r.stdout.splitlines():
            if "REG_SZ" in line or "REG_EXPAND_SZ" in line:
                parts = line.split(None, 3)
                old = (parts[-1] if len(parts) >= 4
                       else (parts[2] if len(parts) == 3 else ""))
                break
        plist = [p.strip() for p in old.split(";") if p.strip()]
        for d in added:
            if not any(d.lower() == p.lower() for p in plist):
                plist.insert(0, d)
        subprocess.run(["reg", "add", root, "/v", "Path",
                        "/t", "REG_EXPAND_SZ", "/d", ";".join(plist), "/f"],
                       capture_output=True, text=True)
        ok(f"已写入{'系统' if is_admin() else '用户'} PATH: {', '.join(added)}")
        return True
    except Exception as e:
        warn(f"持久化 PATH 失败(不影响本次运行): {e}")
        return False


def ensure_git():
    """五层策略: PATH已有 → 常见目录 → 本地回收 → 完整版静默安装
    → MinGit zip 兜底(免管理员)"""
    global GIT_EXE
    if GIT_EXE:
        return GIT_EXE
    # L1: PATH
    w = shutil.which("git")
    if w:
        GIT_EXE = w
        return GIT_EXE
    # L2: 常见目录
    for p in (os.path.join(GIT_INSTALL_DIR, "cmd", "git.exe"),
              os.path.join(GIT_INSTALL_DIR, "bin", "git.exe"),
              r"C:\Program Files\Git\cmd\git.exe",
              r"C:\Program Files (x86)\Git\cmd\git.exe",
              os.path.join(TOOLS_DIR, "git", "cmd", "git.exe"),
              os.path.join(TOOLS_DIR, "git", "mingit64", "cmd", "git.exe")):
        if os.path.exists(p):
            persist_path([os.path.dirname(p)])
            GIT_EXE = p
            return GIT_EXE
    # L2.5: 本地回收 (扫描 D:\DevTools 任意命名目录, 复用不下载)
    exe = adopt_local_tool("git.exe", GIT_INSTALL_DIR, "Git")
    if exe:
        persist_path([os.path.dirname(exe)])
        GIT_EXE = exe
        return GIT_EXE
    # L3: 完整版静默安装
    print("  [..] 未检测到 Git, 查询最新版本...")
    tmp = os.path.join(os.environ["TEMP"], "git_install")
    os.makedirs(tmp, exist_ok=True)
    tag, url, fname = git_latest_url_via_api()
    if not fname:
        # API 挂了则用固定版本号兜底拼接
        tag, fname = f"v{GIT_VER}.windows.1", f"Git-{GIT_VER}-64-bit.exe"
        url = ("https://github.com/git-for-windows/git/releases/download/"
               f"{tag}/{fname}")
    installer = os.path.join(tmp, fname)
    print(f"  [..] 下载 {fname} ...")
    if download_installer_any(tag, url, fname, installer):
        exe = silent_install_git(installer, GIT_INSTALL_DIR)
        if exe:
            os.environ["GIT_HOME"] = GIT_INSTALL_DIR
            persist_path([os.path.join(GIT_INSTALL_DIR, "cmd"),
                          os.path.join(GIT_INSTALL_DIR, "bin")])
            GIT_EXE = exe
            shutil.rmtree(tmp, ignore_errors=True)
            return GIT_EXE
    # L4: MinGit zip 兜底(免管理员, 不写注册表)
    warn("完整版安装失败, 改用 MinGit 免安装包兜底...")
    huawei = (f"https://repo.huaweicloud.com/git-for-windows/"
              f"v{GIT_VER}.windows.1/MinGit-{GIT_VER}-64-bit.zip")
    ztmp = os.path.join(os.environ["TEMP"], "mingit.zip")
    got = download_with_progress(huawei, ztmp) or dl_github(
        f"https://github.com/git-for-windows/git/releases/download/"
        f"v{GIT_VER}.windows.1/MinGit-{GIT_VER}-64-bit.zip", ztmp)
    if not got:
        fail("Git 自动安装全部通道失败, 请手动安装: https://git-scm.com/")
    dest = os.path.join(TOOLS_DIR, "git")
    print("  [..] 解压中...")
    with zipfile.ZipFile(ztmp) as z:
        z.extractall(dest)
    os.remove(ztmp)
    exe = os.path.join(dest, "cmd", "git.exe")
    if not os.path.exists(exe):
        exe = os.path.join(dest, "mingit64", "cmd", "git.exe")
    if not os.path.exists(exe):
        fail("MinGit 解压异常")
    persist_path([os.path.dirname(exe)])
    GIT_EXE = exe
    return GIT_EXE


# ==================== Go 自动安装 ====================
def go_latest_info():
    """官方 JSON API 取最新稳定版: 返回 (版本号, msi文件名, zip文件名, 文件字典)"""
    try:
        req = urllib.request.Request(
            "https://go.dev/dl/?mode=json",
            headers={"User-Agent": "Python-urllib/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        if not isinstance(data, list) or not data:
            return None, None, None, {}
        stable = data[0]
        ver = stable.get("version", "").lstrip("go")   # "go1.24.0" → "1.24.0"
        files = {f.get("filename"): f.get("sha256", "")
                 for f in stable.get("files", [])
                 if f.get("os") == "windows" and f.get("arch") == "amd64"}
        msi = next((n for n in files if n.endswith("windows-amd64.msi")), None)
        zpk = next((n for n in files if n.endswith("windows-amd64.zip")), None)
        return ver, msi, zpk, files
    except Exception as e:
        warn(f"Go 版本查询失败: {e}")
        return None, None, None, {}


def go_download_any(fname, sha256, dest):
    """三通道: go.dev → golang.google.cn → 阿里云镜像, 全程 SHA256 校验"""
    for base in ("https://go.dev/dl/",
                 "https://golang.google.cn/dl/",
                 "https://mirrors.aliyun.com/golang/"):
        if download_and_verify(base + fname, dest, sha256):
            return True
    return False


def silent_install_go(installer):
    """msiexec 静默安装到 GO_INSTALL_DIR, 返回 go.exe 路径"""
    print("  [..] MSI 静默安装 Go, 请稍候(1-2 分钟)...")
    exe = os.path.join(GO_INSTALL_DIR, "bin", "go.exe")
    try:
        p = subprocess.run(
            ["msiexec", "/i", installer,
             "/qn", "/norestart",
             f"INSTALLDIR={GO_INSTALL_DIR}",
             "ALLUSERS=1"],
            capture_output=True, text=True, timeout=GO_TIMEOUT)
    except subprocess.TimeoutExpired:
        warn("msiexec 超时")
        return None
    if os.path.exists(exe):
        return exe
    warn(f"MSI 安装未生效 (返回码 {p.returncode}, "
         f"常因无管理员权限), 改用 zip 免安装兜底")
    return None


def install_go_zip(zfname, sha256):
    """zip 免安装兜底: 解压到 TOOLS_DIR, 生成 go/bin/go.exe"""
    ztmp = os.path.join(os.environ["TEMP"], "go_portable.zip")
    if not go_download_any(zfname, sha256, ztmp):
        return None
    print("  [..] 解压中...")
    with zipfile.ZipFile(ztmp) as z:
        z.extractall(TOOLS_DIR)          # zip 内含顶层 go/ 目录
    os.remove(ztmp)
    return os.path.join(TOOLS_DIR, "go", "bin", "go.exe")


def ensure_go():
    """五层策略: PATH已有 → 常见目录 → 本地回收 → MSI静默安装
    → zip 免安装兜底; 全程免交互"""
    # L1: PATH
    w = shutil.which("go")
    if w:
        return w
    # L2: 常见目录
    for p in (os.path.join(GO_INSTALL_DIR, "bin", "go.exe"),
              r"C:\Program Files\Go\bin\go.exe",
              os.path.join(TOOLS_DIR, "go", "bin", "go.exe")):
        if os.path.exists(p):
            persist_path([os.path.dirname(p)])
            return p
    # L2.5: 本地回收 (扫描 D:\DevTools 任意命名目录, 复用不下载)
    exe = adopt_local_tool("go.exe", GO_INSTALL_DIR, "Go")
    if exe:
        persist_path([os.path.dirname(exe)])
        return exe
    # L3: MSI 静默安装
    print("  [..] 未检测到 Go, 查询最新稳定版...")
    ver, msi, zpk, files = go_latest_info()
    if not msi:
        msi, zpk = (f"go{ver}.windows-amd64.msi",
                    f"go{ver}.windows-amd64.zip") if ver else (None, None)
    if msi:
        tmp = os.path.join(os.environ["TEMP"], msi)
        if go_download_any(msi, files.get(msi, ""), tmp):
            exe = silent_install_go(tmp)
            if exe:
                os.remove(tmp)
                persist_path([os.path.dirname(exe)])
                return exe
    # L4: zip 兜底
    if zpk:
        exe = install_go_zip(zpk, files.get(zpk, ""))
        if exe and os.path.exists(exe):
            persist_path([os.path.dirname(exe)])
            return exe
    fail("Go 自动安装全部通道失败, 请手动: https://go.dev/dl/")


# ==================== 工具链 [00]-[06b] ====================
def node_major():
    """返回 Node 主版本号, 异常返回 0"""
    try:
        rc, out = run(["node", "-v"])
        if rc != 0:
            return 0
        m = re.match(r"v(\d+)", out.strip())
        return int(m.group(1)) if m else 0
    except Exception:
        return 0


def step_tools():
    banner("00", "下载器 urllib (内置)")
    banner("01", "识别系统版本")
    w = sys.getwindowsversion()
    print(f"  Windows {'11' if w.build >= 22000 else '10'} Build {w.build}")

    banner("02", "检测 Node.js")
    v = node_major()
    if v < 20:
        fail("未检测到 Node.js 20+, 请安装: https://nodejs.org/")
    ok(f"Node v{v}")

    banner("03", "检测 Git")
    ensure_git()
    rc, out = run([GIT_EXE, "--version"])
    ok(out.strip())

    banner("04", "检测 Python")
    ok(f"Python {sys.version.split()[0]} (当前解释器)")

    banner("05", "检测 OpenSSH")
    rc, out = run(["ssh", "-V"])
    if rc == 0:
        ok(out.strip())
    else:
        warn("OpenSSH 不可用, 不影响部署")

    banner("06", "检测 pnpm")
    ensure_pnpm()

    banner("06b", "检测 Go")
    gexe = ensure_go()
    rc, out = run([gexe, "version"])
    ok(out.strip())


def get_pnpm():
    """查找 pnpm, 含自定义目录回退"""
    w = shutil.which("pnpm")
    if w:
        return w
    for p in (os.path.join(TOOLS_DIR, "npm-global", "pnpm.cmd"),
              os.path.join(TOOLS_DIR, "pnpm", "pnpm.cmd")):
        if os.path.exists(p):
            return p
    return None


def ensure_pnpm():
    if get_pnpm():
        rc, out = run([get_pnpm(), "-v"])
        if rc == 0 and re.match(r"\d", out.strip()):
            ok("pnpm v" + out.strip())
            return
    print("  [..] 安装 pnpm...")
    npm = shutil.which("npm") or "npm"
    run([npm, "install", "-g", "pnpm@latest"])
    if get_pnpm():
        rc, out = run([get_pnpm(), "-v"])
        if rc == 0:
            ok("pnpm v" + out.strip())
            return
    fail("pnpm 安装失败, 请手动: npm install -g pnpm")


# ==================== [07][08] 仓库与依赖 ====================
def sync_repo():
    banner("07", "同步仓库")
    ensure_git()
    if not os.path.exists(os.path.join(REPO, ".git")):
        print("  [..] 本地仓库不存在, 自动 Clone...")
        if os.path.isdir(REPO):
            shutil.rmtree(REPO, ignore_errors=True)
        rc, out = run([GIT_EXE, "clone", REPO_URL, REPO])
        if rc != 0:
            fail("git clone 失败: " + out[-300:])
    else:
        rc, out = run([GIT_EXE, "fetch", "origin"], cwd=REPO)
        if rc != 0:
            warn("git fetch 失败, 使用本地代码继续")
        else:
            rc, out = run([GIT_EXE, "pull", "--ff-only"], cwd=REPO)
            if rc != 0:
                fail("git pull 失败, 本地可能有未提交修改")
    ok("仓库就绪")
    if not os.path.isdir(APP_DIR):
        fail(f"未找到 {APP_DIR}, 仓库结构可能已变更")


def install_deps():
    banner("08", "检查依赖")
    if os.path.isdir(os.path.join(REPO, "node_modules")):
        ok("node_modules 已存在, 跳过")
        return
    rc, out = run([get_pnpm(), "install"], cwd=REPO)
    if rc != 0:
        log(out[-1500:])
        fail("pnpm install 失败")
    ok("依赖安装完成")


# ==================== [09] Cloudflare 登录 ====================
def cf_logged_in():
    rc, out = npx_wrangler(["whoami"], cwd=BASE_DIR)
    return "logged in" in out.lower()


def cf_login():
    banner("09", "检测 Cloudflare 登录")
    if cf_logged_in():
        ok("已登录")
        return
    print("  [..] 未登录, 将打开浏览器授权...")
    ci_saved = os.environ.pop("CI", None)
    try:
        npx_wrangler(["login"], cwd=BASE_DIR, capture=False)
    finally:
        if ci_saved is not None:
            os.environ["CI"] = ci_saved
    if not cf_logged_in():
        fail("登录未生效, 请重跑重新授权")
    ok("已登录")


# ==================== JSON 辅助 ====================
def parse_list(raw):
    keys = ("databases", "d1_databases", "buckets", "result", "items")
    try:
        j = json.loads(raw)
    except Exception:
        return []
    if isinstance(j, list):
        return j
    if isinstance(j, dict):
        for k in keys:
            if isinstance(j.get(k), list):
                return j[k]
    return []


def find_d1_id(items):
    for o in items:
        if o.get("name") == PROJECT_NAME or o.get("database_name") == PROJECT_NAME:
            return o.get("uuid") or o.get("database_id") or ""
    return ""


# ==================== [10][11][12] 资源幂等 ====================
def ensure_d1():
    banner("10", "检查 D1 数据库")
    rc, out = npx_wrangler(["d1", "list", "--json"], cwd=BASE_DIR)
    d1id = find_d1_id(parse_list(out))
    if not d1id:
        print("  [..] D1 不存在, 创建中...")
        rc, out = npx_wrangler(["d1", "create", PROJECT_NAME], cwd=BASE_DIR)
        if rc != 0:
            fail("D1 创建失败: " + out[-300:])
        rc, out = npx_wrangler(["d1", "list", "--json"], cwd=BASE_DIR)
        d1id = find_d1_id(parse_list(out))
        if not d1id:
            m = re.search(r"[0-9a-f]{32}", out)
            d1id = m.group(0) if m else ""
        if not d1id:
            fail("无法获取 D1 database_id")
    ok(f"D1 database_id = {d1id}")
    return d1id


def ensure_r2():
    banner("11", "检查 R2 存储桶")
    rc, out = npx_wrangler(["r2", "bucket", "list"], cwd=BASE_DIR)
    if R2_BUCKET in out:
        ok("R2 已存在, 复用")
        return
    rc, out = npx_wrangler(["r2", "bucket", "create", R2_BUCKET], cwd=BASE_DIR)
    if rc != 0 and "10004" not in out and "already exists" not in out.lower():
        fail("R2 创建失败: " + out[-300:])
    ok("R2 就绪")


def ensure_pages():
    banner("12", "检查 Pages 项目")
    rc, out = npx_wrangler(["pages", "project", "list"], cwd=BASE_DIR)
    if PROJECT_NAME in out:
        ok("Pages 项目已存在, 复用")
        return
    rc, out = npx_wrangler(["pages", "project", "create", PROJECT_NAME,
                            "--production-branch", "main"], cwd=BASE_DIR)
    if rc != 0:
        warn("创建命令未成功, 由部署步骤验证")
    ok("Pages 项目就绪")


# ==================== [13] 官方模板 toml (含 database_id 自动写入) ====================
def write_toml(d1id):
    """[13] 按 deployment.md 官方 Pages 模板生成;
    白名单整体重建 — 仓库原生 toml 是过时的 Workers 写法,
    文档才是权威意图"""
    banner("13", "写入 wrangler.toml (官方 Pages 模板)")
    os.makedirs(APP_DIR, exist_ok=True)
    if os.path.exists(TOML_PATH):
        shutil.copy2(TOML_PATH, TOML_PATH + ".workers.bak")
    toml = (f'name = "{PROJECT_NAME}"\n'
            f'compatibility_date = "2024-09-23"\n'
            f'compatibility_flags = ["nodejs_compat"]\n'
            f'pages_build_output_dir = "dist"\n'
            f'\n'
            f'[[d1_databases]]\n'
            f'binding = "DB"\n'
            f'database_name = "{PROJECT_NAME}"\n'
            f'database_id = "{d1id}"\n'
            f'\n'
            f'[[r2_buckets]]\n'
            f'binding = "R2"\n'
            f'bucket_name = "{R2_BUCKET}"\n'
            f'\n'
            f'[vars]\n'
            f'SITE_URL = "https://{PROJECT_NAME}.pages.dev"\n'
            f'\n'
            f'[ai]\n'
            f'binding = "AI"\n')
    with open(TOML_PATH, "w", encoding="utf-8") as f:
        f.write(toml)
    ok("已生成官方模板 toml (nodejs_compat/vars/DB/R2/AI)")


# ==================== [14][15] 构建与部署 ====================
def build():
    banner("14", "构建")
    os.environ["ASTRO_ADAPTER"] = "cloudflare"
    rc, out = run([get_pnpm(), "build"], cwd=APP_DIR)
    log(out[-800:], to_console=False)
    if rc != 0:
        log(out[-1500:])
        fail("Build 失败")
    if not os.path.isdir(os.path.join(APP_DIR, "dist")):
        fail("构建产物 dist 缺失")
    ok("Build 成功")


def deploy():
    banner("15", "部署到 Cloudflare Pages")
    # 不传 dist 与 --project-name: toml 的 pages_build_output_dir
    # 与 name 已提供, 传位置参数会报配置冲突
    rc, out = npx_wrangler(["pages", "deploy", "--commit-dirty=true"],
                           cwd=APP_DIR)
    with open(os.path.join(os.environ["TEMP"], "ap_deploy_out.txt"), "w",
              encoding="utf-8", errors="replace") as f:
        f.write(out)
    if rc != 0:
        log(out[-800:])
        fail("Deploy 失败")
    if "Deployment complete" in out:
        ok("Deploy 完成")
    else:
        warn("部署输出未见完成标记, 请人工确认")
    m = re.search(r"https://[a-zA-Z0-9.-]+\.pages\.dev", out)
    return m.group(0) if m else ""


# ==================== [16] D1 建表/迁移 ====================
def d1_init():
    banner("16", "检查 D1 表结构")
    sql = "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'"
    rc, out = npx_wrangler(["d1", "execute", PROJECT_NAME, "--remote", "-y",
                            "--json", "--command", sql], cwd=APP_DIR)
    if rc != 0:
        warn("无法查询表结构: " + out[-300:])
        warn("可改由站点 /setup 向导初始化")
        return
    try:
        j = json.loads(out)
        arr = j if isinstance(j, list) else j.get("result", [j])
        rows = arr[0].get("results", []) if arr else []
        n = rows[0].get("n", 0) if rows else 0
    except Exception:
        warn("表结构响应解析失败, 可由 /setup 初始化")
        return
    if n != 0:
        ok(f"数据库已有 {n} 张表, 无需初始化")
        return
    print("  [..] 数据库为空, 查找迁移 SQL...")
    # deployment.md 步骤 3: 迁移在 packages/core, 优先查找
    sql_dir = None
    for cand in (os.path.join(REPO, "packages", "core", "migrations"),
                 os.path.join(REPO, "packages", "core", "drizzle"),
                 os.path.join(APP_DIR, "migrations"),
                 os.path.join(REPO, "migrations")):
        if os.path.isdir(cand):
            sql_dir = cand
            break
    if not sql_dir:
        warn("未找到迁移 SQL 目录, 请访问站点 /setup 初始化")
        return
    for fn in sorted(os.listdir(sql_dir)):
        if not fn.endswith(".sql"):
            continue
        print(f"  [..] 应用 {fn}")
        fp = os.path.join(sql_dir, fn).replace("\\", "/")
        rc, out = npx_wrangler(["d1", "execute", PROJECT_NAME, "--remote",
                                "-y", "--file", fp], cwd=APP_DIR)
        if rc != 0:
            warn(f"{fn} 执行失败: " + out[-300:])
        else:
            ok(f"{fn} 应用成功")
    ok("数据库初始化已尝试, 可访问 /setup 创建管理员")


# ==================== [17] 健康检查 ====================
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def health_check(site_url):
    banner("17", "健康检查")
    if not site_url:
        warn("未能提取站点地址, 跳过")
        return
    print("  [..] 等待部署传播 8 秒...")
    time.sleep(8)
    try:
        opener = urllib.request.build_opener(_NoRedirect)
        req = urllib.request.Request(site_url, headers={"User-Agent": "Mozilla/5.0"})
        resp = opener.open(req, timeout=30)
        code, loc = resp.status, ""
    except urllib.error.HTTPError as e:
        code, loc = e.code, e.headers.get("Location", "")
    except Exception as e:
        warn(f"站点请求异常: {e}")
        return
    print(f"  首页状态: {code} {loc}")
    if code == 200:
        ok(f"站点正常, 可访问 {site_url}/setup 创建管理员")
    elif "/login" in loc:
        warn("首页重定向到 /login, 可能存在重定向循环")
        warn("排查: 1) 无痕窗口访问 /setup  2) 重跑选[2]重建  3) 看 [15] 输出")
    else:
        warn(f"站点未返回 200, 请人工查看 {site_url}")


# ==================== 重建模式 ====================
def delete_with_retry(args, label):
    """带 --yes/-y 失败且报 Unknown argument 时去掉 flag 重试"""
    rc, out = npx_wrangler(args, cwd=BASE_DIR)
    if rc == 0:
        ok(label + "已删除")
        return
    if "not found" in out.lower():
        ok(label + "本就不存在")
        return
    if "unknown argument" in out.lower():
        print("  [..] 此版本不支持静默 flag, 重试(如弹确认请手动输入 y)...")
        ci_saved = os.environ.pop("CI", None)
        try:
            rc2, out2 = npx_wrangler(
                [a for a in args if a not in ("--yes", "-y")],
                cwd=BASE_DIR, capture=False)
        finally:
            if ci_saved is not None:
                os.environ["CI"] = ci_saved
        if rc2 == 0:
            ok(label + "已删除")
        else:
            warn(label + "删除未成功, 详见上方输出")
        return
    warn(label + "删除未成功: " + out[-300:])


def r2_purge_via_api():
    if not (CF_API_TOKEN and CF_ACCOUNT_ID):
        warn("未配置 CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID, 无法自动清空")
        return False
    keys, cursor = [], ""
    try:
        while True:
            url = (f"https://api.cloudflare.com/client/v4/accounts/"
                   f"{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects?per_page=100")
            if cursor:
                url += "&cursor=" + cursor
            req = urllib.request.Request(url, headers={
                "Authorization": "Bearer " + CF_API_TOKEN})
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.loads(r.read())
            if not j.get("success"):
                warn("REST API 列对象失败, 检查 token R2 权限")
                return False
            keys += [o["key"] for o in (j.get("result") or [])]
            cursor = (j.get("result_info") or {}).get("cursor", "")
            if not cursor:
                break
    except Exception as e:
        warn(f"REST API 异常: {e}")
        return False
    if not keys:
        ok("桶已是空的")
        return True
    print(f"  [..] 桶内有 {len(keys)} 个对象, 逐个删除中...")
    for k in keys:
