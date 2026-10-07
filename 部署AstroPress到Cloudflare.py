#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
部署 AstroPress 到 Cloudflare（Workers + D1 + R2）

前置条件：
  仅需 Python 3 与 Windows 10/11。
  Node.js（绿色版 zip 入 D:/DevTools/node，winget 兜底）、Git（MinGit 绿色版入
  D:/DevTools/Git，winget 兜底）、pnpm（npm 自动装）、wrangler（npx 按需下载）、
  Cloudflare 登录（自动弹浏览器授权）、D1/R2 创建与 database_id 回填，全部自动完成。
  工具链全部归拢 D:/DevTools——重装系统后 D 盘幸存，Node/Git/pnpm/登录态/缓存全复用。
  脚本不在仓库内运行时，会自动把 REPO_URL 克隆到脚本旁的 AstroPress 目录。

用法：
  python 部署AstroPress到Cloudflare.py            # 完整流程：准备绑定→安装依赖→构建→迁移D1→部署
  python 部署AstroPress到Cloudflare.py --skip-install   # 跳过 pnpm install
  python 部署AstroPress到Cloudflare.py --only-migrate   # 仅执行 D1 迁移
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import urllib.request
import zipfile

# ==================== 用户配置区 ====================
TOOLS_DIR = r"D:\DevTools"                                   # 工具链统一目录
REPO_URL = os.environ.get("AP_REPO_URL", "https://github.com/jilefo/AstroPress")  # 无仓库时自动克隆的地址
# ====================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 仓库位置由 resolve_repo() 确定（脚本在仓库内→自身；否则克隆到脚本旁）
ROOT = BASE_DIR
ADMIN = os.path.join(ROOT, "apps", "admin")
MIGRATIONS = os.path.join(ROOT, "packages", "core", "migrations")


def setup_env():
    """工具链缓存/全局目录统一归拢 D:/DevTools，避免散落 C 盘各处。"""
    for d in ("npm-cache", "npm-global", "pnpm", "pnpm-store", "corepack", "wrangler", "temp"):
        os.makedirs(os.path.join(TOOLS_DIR, d), exist_ok=True)
    tmp = os.path.join(TOOLS_DIR, "temp")
    os.environ["TEMP"] = tmp
    os.environ["TMP"] = tmp
    os.environ["npm_config_cache"] = os.path.join(TOOLS_DIR, "npm-cache")
    os.environ["npm_config_prefix"] = os.path.join(TOOLS_DIR, "npm-global")
    os.environ["npm_config_store_dir"] = os.path.join(TOOLS_DIR, "pnpm-store")
    os.environ["PNPM_HOME"] = os.path.join(TOOLS_DIR, "pnpm")
    os.environ["XDG_CONFIG_HOME"] = os.path.join(TOOLS_DIR, "wrangler")  # wrangler 登录态存放处
    os.environ["CI"] = "1"
    os.environ["WRANGLER_SEND_METRICS"] = "false"
    os.environ["PATH"] = os.pathsep.join([
        os.path.join(TOOLS_DIR, "npm-global"),
        os.path.join(TOOLS_DIR, "pnpm"),
        os.environ.get("PATH", ""),
    ])
    _scan_tools_in_devtools()  # 自动识别 D:/DevTools 下所有绿色版工具

# 强制 UTF-8 输出（Windows 控制台默认 GBK 会乱码）
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def run(cmd, cwd=None, check=True, capture=False):
    # Windows 下 pnpm/npx 均为 .cmd，必须经 shell 解析 PATHEXT
    if isinstance(cmd, list):
        cmd = subprocess.list2cmdline(cmd)
    print(f"\n>>> {cmd}")
    r = subprocess.run(
        cmd, cwd=cwd, shell=True,
        capture_output=capture, text=True, encoding="utf-8", errors="replace",
    )
    if capture:
        return r
    if check and r.returncode != 0:
        print(f"!! 命令失败（exit {r.returncode}）")
        sys.exit(r.returncode)
    return r


def _scan_tools_in_devtools():
    """遍历 D:/DevTools 子目录，自动识别绿色版工具并加进进程 PATH（重装系统后复用）。
    支持：Node.js / Git / Java / Go / Python / 7-Zip / Scoop / npm-global 等。"""
    base = TOOLS_DIR
    if not os.path.isdir(base):
        return
    additions = []
    # 常见绿色版工具：目录关键词 → [(相对子路径, 验证用可执行文件)]
    patterns = {
        "node":   [("", "node.exe"), ("bin", "node.exe")],
        "git":    [("cmd", "git.exe"), ("bin", "git.exe")],
        "java":   [("bin", "java.exe")],
        "go":     [("bin", "go.exe")],
        "python": [("", "python.exe")],
        "7zip":   [("", "7z.exe")],
        "scoop":  [("shims", "scoop.cmd")],
    }
    for d in os.listdir(base):
        dd = os.path.join(base, d)
        if not os.path.isdir(dd):
            continue
        lower = d.lower()
        for key, probes in patterns.items():
            if key not in lower:
                continue
            for rel, exe in probes:
                cand = os.path.join(dd, rel) if rel else dd
                if os.path.isfile(os.path.join(cand, exe)):  # 只认真有可执行文件的目录
                    additions.append(cand)
                    break
            break
    # 已有的 pnpm / npm 全局
    for extra in ("npm-global", "pnpm"):
        p = os.path.join(base, extra)
        if os.path.isdir(p):
            additions.append(p)
    if additions:
        os.environ["PATH"] = os.pathsep.join(additions + [os.environ.get("PATH", "")])


def _refresh_path():
    """winget 安装后新 PATH 在注册表里，本进程手动补常见目录。"""
    extra = [r"C:\Program Files\nodejs",
             os.path.expandvars(r"%APPDATA%\npm")]
    os.environ["PATH"] = os.pathsep.join(extra + [os.environ.get("PATH", "")])


def _which(cmd):
    from shutil import which
    return which(cmd)


def _download(url, dest):
    print(f"  下载 {url}")
    with urllib.request.urlopen(url, timeout=300) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    print(f"  下载完成（{os.path.getsize(dest) // 1048576} MB）")


def _ensure_node():
    # 优先：系统 PATH → 绿色版（D:\DevTools\node，重装系统可复用）→ 下载绿色版 → winget 兜底
    if _which("node"):
        return
    portable = os.path.join(TOOLS_DIR, "node")
    if not os.path.exists(os.path.join(portable, "node.exe")):
        print(f"未检测到 Node.js，下载绿色版到 {portable} ...")
        try:
            with urllib.request.urlopen("https://nodejs.org/dist/index.json", timeout=30) as r:
                ver = next(v["version"] for v in json.load(r) if v.get("lts"))
            tmp = os.path.join(TOOLS_DIR, "temp", "node.zip")
            _download(f"https://nodejs.org/dist/{ver}/node-{ver}-win-x64.zip", tmp)
            with zipfile.ZipFile(tmp) as z:
                z.extractall(os.path.join(TOOLS_DIR, "temp"))
            os.replace(os.path.join(TOOLS_DIR, "temp", f"node-{ver}-win-x64"), portable)
            print(f"OK: Node.js {ver} 绿色版就绪")
        except Exception as e:
            print(f"  绿色版下载失败（{e}），改用 winget 安装 ...")
            run(["winget", "install", "--id", "OpenJS.NodeJS.LTS", "-e", "--silent",
                 "--accept-source-agreements", "--accept-package-agreements"],
                capture=True, check=False)
            _refresh_path()
    if os.path.exists(os.path.join(portable, "node.exe")):
        os.environ["PATH"] = portable + os.pathsep + os.environ["PATH"]
    if not _which("node"):
        print("!! Node.js 不可用，请手动安装 https://nodejs.org/ 后重跑")
        sys.exit(1)


def _ensure_pnpm():
    if _which("pnpm"):
        return
    print("未检测到 pnpm，使用 npm 全局安装 ...")
    run(["npm", "install", "-g", "pnpm"], check=False)
    _refresh_path()
    if not _which("pnpm"):
        print("!! pnpm 安装失败，请手动执行 npm install -g pnpm 后重跑")
        sys.exit(1)
    print("OK: pnpm 已自动安装")


def _ensure_git():
    # 优先：系统 PATH → 绿色版（D:\DevTools\Git，重装系统可复用）→ 下载 MinGit 绿色版 → winget 兜底
    if _which("git"):
        return
    portable = os.path.join(TOOLS_DIR, "Git")
    candidates = [os.path.join(portable, "cmd", "git.exe"), r"C:\Program Files\Git\cmd\git.exe"]
    if not any(os.path.exists(p) for p in candidates):
        print(f"未检测到 Git，下载 MinGit 绿色版到 {portable} ...")
        try:
            req = urllib.request.Request(
                "https://api.github.com/repos/git-for-windows/git/releases/latest",
                headers={"User-Agent": "astropress-deploy"})
            with urllib.request.urlopen(req, timeout=30) as r:
                rel = json.load(r)
            url = next(a["browser_download_url"] for a in rel["assets"]
                       if re.match(r"MinGit-.*-64-bit\.zip$", a["name"]))
            tmp = os.path.join(TOOLS_DIR, "temp", "mingit.zip")
            _download(url, tmp)
            with zipfile.ZipFile(tmp) as z:
                z.extractall(portable)
            print(f"OK: {rel['tag_name']} 绿色版就绪")
        except Exception as e:
            print(f"  绿色版下载失败（{e}），改用 winget 安装 ...")
            run(["winget", "install", "--id", "Git.Git", "-e", "--silent",
                 "--accept-source-agreements", "--accept-package-agreements"],
                capture=True, check=False)
            _refresh_path()
    for p in candidates:
        if os.path.exists(p):
            os.environ["PATH"] = os.path.dirname(p) + os.pathsep + os.environ["PATH"]
            break
    if not _which("git"):
        print("!! Git 不可用，请手动安装 https://git-scm.com/ 后重跑")
        sys.exit(1)


def resolve_repo():
    """脚本在仓库内→用自身仓库；否则自动克隆 REPO_URL 到脚本旁的 AstroPress/。"""
    global ROOT, ADMIN, MIGRATIONS
    if os.path.isdir(os.path.join(BASE_DIR, "apps", "admin")):
        return  # 脚本在仓库根目录，现状不变
    target = os.path.join(BASE_DIR, "AstroPress")
    if os.path.isdir(os.path.join(target, ".git")):
        print(f"发现已有克隆 {target}，拉取最新代码 ...")
        run(["git", "-C", target, "pull", "--ff-only"], check=False)
    elif os.path.isdir(os.path.join(target, "apps", "admin")):
        pass  # 无 .git 的完整拷贝，直接用
    else:
        print(f"脚本不在仓库内，克隆 {REPO_URL} → {target}")
        r = run(["git", "clone", REPO_URL, target], capture=True, check=False)
        if r.returncode != 0:
            print(f"!! 克隆失败：{(r.stdout or '')[-300:]}\n   可设置环境变量 AP_REPO_URL 指定仓库地址")
            sys.exit(1)
    ROOT, ADMIN, MIGRATIONS = (target, os.path.join(target, "apps", "admin"),
                               os.path.join(target, "packages", "core", "migrations"))
    print(f"OK: 仓库 = {ROOT}")


def check_prereqs():
    print("== 1. 检查前置条件（缺失自动安装）==")
    _ensure_node()
    _ensure_git()
    _ensure_pnpm()
    run(["node", "--version"], capture=True)
    run(["pnpm", "--version"], capture=True)
    r = run(["npx", "--yes", "wrangler", "--version"], capture=True)  # npx 按需自动下载 wrangler
    if r.returncode != 0:
        print("!! wrangler 不可用：npm install -g wrangler")
        sys.exit(1)
    r2 = run(["npx", "wrangler", "whoami"], capture=True)
    if r2.returncode != 0 or "email" not in (r2.stdout + r2.stderr).lower():
        print("wrangler 未登录，自动打开浏览器授权 ...")
        run(["npx", "wrangler", "login"], check=False)  # 需交互，不捕获输出
        r2 = run(["npx", "wrangler", "whoami"], capture=True)
        if r2.returncode != 0 or "email" not in (r2.stdout + r2.stderr).lower():
            print("!! 登录未生效，请重跑脚本重新授权")
            sys.exit(1)
    print("OK: node / pnpm / wrangler（已登录）")


def _d1_id_from_list():
    """从 `wrangler d1 list --json` 中取名为 astropress 的数据库 uuid。"""
    r = run(["npx", "wrangler", "d1", "list", "--json"], cwd=ADMIN, capture=True, check=False)
    try:
        for db in json.loads(r.stdout or "[]"):
            if db.get("name") == "astropress":
                return db.get("uuid")
    except json.JSONDecodeError:
        pass
    return None


def _fill_database_id(db_id: str):
    """把 database_id 回填进 apps/admin/wrangler.toml 与根 wrangler.toml。"""
    for toml_path in (os.path.join(ADMIN, "wrangler.toml"), os.path.join(ROOT, "wrangler.toml")):
        if not os.path.exists(toml_path):
            continue
        text = io.open(toml_path, encoding="utf-8").read()
        new_text, n = re.subn(r'(database_id\s*=\s*")[^"]+(")', rf"\g<1>{db_id}\g<2>", text)
        if n:
            io.open(toml_path, "w", encoding="utf-8").write(new_text)
            print(f"   已回填 database_id → {os.path.relpath(toml_path, ROOT)}")


def ensure_bindings():
    """D1 数据库与 R2 桶缺失时自动创建，并把 database_id 自动回填 wrangler.toml。
    list 优先：先按名字查云端现有资源，没有再创建（幂等，可反复执行）。"""
    print("== 2. 准备 D1/R2 绑定（缺失自动创建）==")
    toml_path = os.path.join(ADMIN, "wrangler.toml")
    text = io.open(toml_path, encoding="utf-8").read()
    m = re.search(r'database_id\s*=\s*"([^"]+)"', text)
    db_id = m.group(1) if m and not m.group(1).startswith("00000000") else None

    # list 优先：云端已有同名库则直接采用（纠正 toml 占位符/错配）
    cloud_id = _d1_id_from_list()
    if cloud_id and cloud_id != db_id:
        print(f"云端已有 D1 astropress = {cloud_id}，回填 wrangler.toml")
        _fill_database_id(cloud_id)
        db_id = cloud_id

    if db_id:
        print(f"OK: database_id = {db_id}")
    else:
        print("D1 astropress 不存在，自动创建 ...")
        r = run(["npx", "wrangler", "d1", "create", "astropress"], cwd=ADMIN, capture=True, check=False)
        out = (r.stdout or "") + (r.stderr or "")
        m2 = re.search(r'database_id\s*=\s*"([0-9a-fA-F-]{36})"', out)
        db_id = m2.group(1) if m2 else _d1_id_from_list()
        if not db_id:
            print("!! 无法获得 D1 database_id，请手工执行：npx wrangler d1 create astropress")
            sys.exit(2)
        _fill_database_id(db_id)
        print(f"OK: D1 astropress = {db_id}")

    # R2 桶：list 优先，没有再幂等创建
    r = run(["npx", "wrangler", "r2", "bucket", "list"], cwd=ADMIN, capture=True, check=False)
    if "astropress-media" in ((r.stdout or "") + (r.stderr or "")):
        print("OK: R2 桶 astropress-media 已存在")
        return
    r = run(["npx", "wrangler", "r2", "bucket", "create", "astropress-media"],
            cwd=ADMIN, capture=True, check=False)
    out = ((r.stdout or "") + (r.stderr or "")).lower()
    if r.returncode == 0 or "already exists" in out:
        print("OK: R2 桶 astropress-media 已创建")
    else:
        print(f"!! R2 桶创建失败：{out.strip()[:200]}")
        sys.exit(2)


def install(skip: bool):
    if skip:
        print("== 3. 跳过依赖安装 ==")
        return
    print("== 3. 安装依赖（pnpm install）==")
    run(["pnpm", "install", "--prefer-offline"], cwd=ROOT)


def build():
    print("== 4. 构建 Cloudflare 产物（ASTRO_ADAPTER=cloudflare astro build）==")
    run(["pnpm", "--filter", "@astropress/admin", "run", "build:cf"], cwd=ROOT)
    worker = os.path.join(ADMIN, "dist", "_worker.js", "index.js")
    if not os.path.exists(worker):
        print("!! 构建产物缺失：dist/_worker.js/index.js")
        sys.exit(3)
    print(f"OK: {os.path.relpath(worker, ROOT)}")


def _d1_table_count():
    """远程 D1 已建表数量；查询失败返回 -1。"""
    r = run(["npx", "wrangler", "d1", "execute", "astropress", "--remote", "-y", "--json",
             "--command", "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'"],
            cwd=ADMIN, capture=True, check=False)
    try:
        data = json.loads(r.stdout or "[]")
        rows = (data[0] if isinstance(data, list) else data).get("results", [])
        return int(rows[0].get("n", 0)) if rows else 0
    except Exception:
        return -1


def migrate_d1(force=False):
    """把 packages/core/migrations/*.sql 按序应用到远程 D1。
    幂等：远端已有表则跳过（--force-migrate 可强制重跑）。"""
    print("== 5. 迁移 D1 数据库（drizzle SQL → 远程 D1）==")
    if not force:
        n = _d1_table_count()
        if n > 0:
            print(f"OK: 远端已有 {n} 张表，跳过迁移（--force-migrate 可强制重跑）")
            return
        if n == -1:
            print("WARN: 无法查询远端表数，继续尝试迁移")
    sqls = sorted(f for f in os.listdir(MIGRATIONS) if f.endswith(".sql"))
    if not sqls:
        print("!! 未找到迁移 SQL：packages/core/migrations/*.sql")
        sys.exit(4)
    for f in sqls:
        # --remote 应用到云端；--local 只作用本地 .wrangler 状态
        run(["npx", "wrangler", "d1", "execute", "astropress", "--remote", "-y",
             "--file", os.path.join(MIGRATIONS, f)], cwd=ADMIN)
    print(f"OK: 已应用 {len(sqls)} 个迁移文件")


def run_setup(url):
    """第 8 步：完成 Web 安装向导（创建管理员）。
    - 已安装（/setup 跳转 /login）→ 跳过；
    - 提供环境变量 AP_ADMIN_EMAIL + AP_ADMIN_PASSWORD → 无人值守自动安装；
    - 否则只打印安装链接，由用户在浏览器设置自己的管理员账号。
    """
    import time
    import json
    import urllib.request
    import urllib.parse
    import urllib.error

    print("== 8. 安装向导 ==")
    time.sleep(3)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(urllib.request.Request(url + "/setup",
                            headers={"User-Agent": "Mozilla/5.0"}), timeout=30)
        setup_html = r.read().decode("utf-8", "ignore")
        installed = r.status in (301, 302)
    except urllib.error.HTTPError as e:
        # 302 → /login 表示已安装
        installed = e.code in (301, 302) or "/login" in (e.headers.get("location") or "")
        setup_html = ""
    except Exception:
        installed = False
        setup_html = ""

    if installed:
        print("OK: 站点已安装过，跳过安装向导")
        return

    email = os.environ.get("AP_ADMIN_EMAIL")
    password = os.environ.get("AP_ADMIN_PASSWORD")
    title = os.environ.get("AP_SITE_TITLE", "My AstroPress")
    tagline = os.environ.get("AP_SITE_TAGLINE", "Just another AstroPress site")

    if not email or not password:
        print("!" * 60)
        print("  站点尚未安装。请在浏览器打开以下链接完成 1 分钟安装：")
        print(f"    {url}/setup")
        print("  （设置站点名、管理员邮箱与密码；用户名固定 admin）")
        print("  想无人值守？设置环境变量后重跑本脚本：")
        print('    setx AP_ADMIN_EMAIL "you@example.com"')
        print('    setx AP_ADMIN_PASSWORD "你的强密码"')
        print("!" * 60)
        return

    form = {
        "site_title": title,
        "site_url": url,
        "tagline": tagline,
        "admin_email": email,
        "admin_password": password,
        "admin_password2": password,
    }
    data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(url + "/api/setup", data=data, headers={
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", "ignore")
            ok = resp.status == 200 and "error" not in resp.url
        if ok:
            print(f"OK: 安装完成 → 管理员 admin / 后台 {url}/admin")
        else:
            print(f"WARN: 安装提交后状态异常，请人工访问 {url}/setup")
    except Exception as e:
        print(f"WARN: 自动安装失败（{e}），请人工访问 {url}/setup")


def health_check(url):
    """部署后探测首页 HTTP 状态，等 8s 传播。"""
    print("== 7. 健康检查 ==")
    import time
    import urllib.request
    time.sleep(8)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            code = resp.status
    except Exception as e:
        code = getattr(e, "code", None) or str(e)
    print(f"  首页状态: {code}")
    if code == 200:
        print(f"OK: 站点正常 → {url}  后台：{url}/admin")
    else:
        print(f"WARN: 未返回 200，请人工访问确认 → {url}")
    run_setup(url)


def deploy():
    print("== 6. 部署到 Cloudflare Workers ==")
    r = run(["npx", "wrangler", "deploy"], cwd=ADMIN, capture=True, check=False)
    out = (r.stdout or "") + (r.stderr or "")
    print(out[-1500:])
    if r.returncode != 0:
        print(f"!! 部署失败（exit {r.returncode}）")
        sys.exit(r.returncode)
    m = re.search(r"https://[a-zA-Z0-9.-]+\.workers\.dev", out)
    url = m.group(0) if m else "https://<your-worker>.workers.dev"
    print("\n== 部署完成 ==")
    print(f"站点：{url}  后台入口：{url}/admin")
    health_check(url)


def main():
    ap = argparse.ArgumentParser(description="部署 AstroPress 到 Cloudflare")
    ap.add_argument("--skip-install", action="store_true", help="跳过 pnpm install")
    ap.add_argument("--only-migrate", action="store_true", help="仅执行 D1 迁移")
    ap.add_argument("--force-migrate", action="store_true", help="远端已有表也强制重跑迁移")
    args = ap.parse_args()

    setup_env()
    os.chdir(BASE_DIR)
    check_prereqs()
    resolve_repo()
    os.chdir(ROOT)
    ensure_bindings()
    if args.only_migrate:
        migrate_d1(force=args.force_migrate)
        return
    install(args.skip_install)
    build()
    migrate_d1(force=args.force_migrate)
    deploy()


if __name__ == "__main__":
    main()
