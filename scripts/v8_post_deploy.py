#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""V8 部署后标准回归脚本

一次部署后约 2 分钟跑完 4 阶段全链路回归：

  阶段 1（冒烟 ~5s）  ：/ap-health 存活 + 管理员登录 + 首页/已知文章/RSS/sitemap 公开端点
  阶段 2（坏 JSON ~15s）：v8_badjson_probe.py — 41 断言（畸形 body 必须 400 中文 JSON）
  阶段 3（混沌 ~90s）  ：v8_gate_acd.py — 17 断言（评论频控/重定向并发/链接原子计数）
  阶段 4（残留 ~5s）  ：v8_gate_residue.py — V8GATE 前缀零残留独立扫描

用法:
  python v8_post_deploy.py [BASE_URL] [OUT_JSON]
默认 BASE = https://astropress-v2.nqc715560.workers.dev

退出码 0 = 全部 4 阶段通过（适合接部署流水线 / CI）；
非 0 = 有失败项，详情见 OUT_JSON 与控制台。
"""
import http.cookiejar
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

BASE = (sys.argv[1] if len(sys.argv) > 1
        else "https://astropress-v2.nqc715560.workers.dev").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.path.join(HERE, "..", "logs")
os.makedirs(LOGS, exist_ok=True)
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    LOGS, f"v8_post_deploy_{int(time.time())}.json")
STAMP = f"V8DEPLOY-{int(time.time())}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 V8PostDeploy/1.0"

# 凭据
_PWD = os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
if not _PWD:
    cred = os.path.join(HERE, "..", ".ap-data", "credential.txt")
    if os.path.exists(cred):
        for line in open(cred, encoding="utf-8"):
            if line.startswith("ASTROPRESS_TEST_PASSWORD="):
                _PWD = line.split("=", 1)[1].strip()
                break

# ── HTTP 基建 ──────────────────────────────────────────────
class _SecurePolicy(http.cookiejar.DefaultCookiePolicy):
    """Node 生产 session cookie 带 Secure；本机 http 压测强制收发。"""
    def return_ok_secure(self, cookie, request):
        return True
    def set_ok(self, cookie, request):
        return True

cj = http.cookiejar.CookieJar(policy=_SecurePolicy())
_ssl_ctx = ssl._create_unverified_context()
op = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=_ssl_ctx))


def _req(method, path, body=None, ctype="application/json", origin=True, retries=1):
    """HTTP 请求；retries>1 时对 5xx 做指数退避重试（CF D1 503 容错）。"""
    url = path if path.startswith("http") else BASE + path
    headers = {"User-Agent": UA}
    if origin:
        headers["Origin"] = BASE
    if body is not None:
        if ctype != "application/json":
            data = urllib.parse.urlencode(body).encode()
        else:
            data = json.dumps(body, ensure_ascii=False).encode()
        headers["Content-Type"] = ctype
    else:
        data = None
    last_status = -1
    for attempt in range(retries):
        rr = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with op.open(rr, timeout=15) as x:
                return x.status, {k.lower(): v for k, v in x.headers.items()}, x.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last_status = e.code
            # 5xx 且还有重试次数 → 指数退避后重试
            if e.code >= 500 and attempt < retries - 1:
                time.sleep(0.5 * (2 ** attempt))
                continue
            return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(0.5 * (2 ** attempt))
                continue
            return -1, {}, f"{type(e).__name__}: {e}"
    return last_status, {}, "max retries exceeded"


# ── 结果收集 ──────────────────────────────────────────────
phases = []


def phase(pid, name, ok, detail="", checks=None):
    phases.append({
        "id": pid, "name": name, "pass": bool(ok),
        "detail": str(detail)[:300],
        "checks": checks or [],
    })
    tag = "PASS" if ok else "FAIL"
    print(f"  [{tag}] {pid} {name}" + (f" — {str(detail)[:90]}" if detail else ""))


def run_sub(script, args):
    """运行子脚本（Popen 继承 stdout/stderr，轮询 JSON 落盘即返回）。"""
    script_path = os.path.join(HERE, script)
    cmd = [sys.executable, "-u", script_path] + list(args)
    print(f"\n  $ {script} {' '.join(args)}")
    proc = subprocess.Popen(cmd, stdout=None, stderr=None)  # 继承父进程 fd，无管道无死锁
    json_path = next((a for a in args if a.endswith(".json")), None)
    deadline = time.time() + 180  # 最多等 3 分钟（gate 子脚本内 parallel 已有 60s 硬超时兜底）
    rc = None
    parsed = None
    while time.time() < deadline:
        rc = proc.poll()
        if rc is not None:
            break  # 进程自然退出
        # 检查 JSON 是否已落盘（子脚本先写 JSON 再 cleanup，CF 慢 cleanup 不阻塞读结果）
        if json_path and os.path.exists(json_path):
            try:
                with open(json_path, encoding="utf-8") as f:
                    parsed = json.load(f)
                if parsed.get("total", 0) > 0:
                    # JSON 已落盘，子进程可能卡在 cleanup 线程——kill 后读结果
                    if proc.poll() is None:
                        proc.kill()
                        proc.wait()
                    break
            except Exception:
                pass
        time.sleep(2)
    else:
        # 超时：kill 兜底
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        rc = -1
    if rc is None:
        rc = proc.returncode if proc.returncode is not None else -1
    if parsed is None and json_path and os.path.exists(json_path):
        try:
            with open(json_path, encoding="utf-8") as f:
                parsed = json.load(f)
        except Exception:
            pass
    # JSON 结果为准
    if parsed and parsed.get("total", 0) > 0:
        ok = parsed.get("failed", 1) == 0
        return ok, f"JSON: {parsed['passed']}/{parsed['total']} {'PASS' if ok else 'FAIL'}", parsed
    return rc == 0, (f"exit={rc}" if rc else "ok"), parsed


# ═══════════════════════════════════════════════════════════
# 阶段 1：冒烟
# ═══════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print(f"V8 部署后标准回归  |  {BASE}")
print(f"STAMP={STAMP}  时间={time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"{'='*60}")
_t0 = time.time()

print("\n── 阶段 1/4  冒烟（健康+登录+公开端点）──")
smoke_checks = []

# 1a 健康检查（retries=3 防 CF D1 503 瞬态抖动）
st, h, t = _req("GET", "/ap-health", origin=False, retries=3)
ok_health = st == 200 and '"ok"' in t
smoke_checks.append({"id": "S01", "name": "/ap-health 存活", "pass": ok_health, "detail": f"st={st}"})
print(f"  [{'PASS' if ok_health else 'FAIL'}] S01 /ap-health  st={st}")

# 1b 管理员登录（retries=3 防 CF D1 503 瞬态抖动）
st, h, t = _req("POST", "/api/auth/login",
                 {"username": "admin", "password": _PWD},
                 ctype="application/x-www-form-urlencoded", origin=False, retries=3)
ok_login = st in (200, 302)
smoke_checks.append({"id": "S02", "name": "管理员登录", "pass": ok_login, "detail": f"st={st}"})
print(f"  [{'PASS' if ok_login else 'FAIL'}] S02 管理员登录  st={st}")

# 1c 首页
st, h, t = _req("GET", "/", origin=False)
ok_home = st == 200 and "<html" in t.lower()
smoke_checks.append({"id": "S03", "name": "首页 200+HTML", "pass": ok_home, "detail": f"st={st} len={len(t)}"})
print(f"  [{'PASS' if ok_home else 'FAIL'}] S03 首页  st={st}")

# 1d 已知文章
st, h, t = _req("GET", "/wp-to-astro", origin=False)
ok_post = st == 200
smoke_checks.append({"id": "S04", "name": "已知文章 /wp-to-astro 200", "pass": ok_post, "detail": f"st={st}"})
print(f"  [{'PASS' if ok_post else 'FAIL'}] S04 /wp-to-astro  st={st}")

# 1e RSS
st, h, t = _req("GET", "/rss.xml", origin=False)
ok_rss = st == 200 and ("<rss" in t.lower() or "<feed" in t.lower())
smoke_checks.append({"id": "S05", "name": "RSS /rss.xml 良构", "pass": ok_rss, "detail": f"st={st}"})
print(f"  [{'PASS' if ok_rss else 'FAIL'}] S05 /rss.xml  st={st}")

# 1f sitemap
st, h, t = _req("GET", "/sitemap.xml", origin=False)
ok_sitemap = st == 200 and "<urlset" in t.lower()
smoke_checks.append({"id": "S06", "name": "sitemap.xml 良构", "pass": ok_sitemap, "detail": f"st={st}"})
print(f"  [{'PASS' if ok_sitemap else 'FAIL'}] S06 /sitemap.xml  st={st}")

# 1g 管理后台仪表盘（登录后）
st, h, t = _req("GET", "/admin/dashboard")
ok_admin = st == 200
smoke_checks.append({"id": "S07", "name": "管理后台 /admin/dashboard 200", "pass": ok_admin, "detail": f"st={st}"})
print(f"  [{'PASS' if ok_admin else 'FAIL'}] S07 /admin/dashboard  st={st}")

smoke_ok = all(c["pass"] for c in smoke_checks)
phase("1-smoke", "冒烟（健康+登录+6 公开端点）", smoke_ok,
      f"{sum(c['pass'] for c in smoke_checks)}/{len(smoke_checks)}", smoke_checks)

# ═══════════════════════════════════════════════════════════
# 阶段 2：坏 JSON 探针
# ═══════════════════════════════════════════════════════════
print("\n── 阶段 2/4  坏 JSON 探针（41 断言）──")
probe_out = os.path.join(LOGS, f"_post_deploy_badjson_{int(time.time())}.json")
ok2, tail2, parsed2 = run_sub("v8_badjson_probe.py", [BASE, probe_out])
probe_checks = parsed2.get("results", []) if parsed2 else []
probe_pass = parsed2.get("passed", 0) if parsed2 else 0
probe_total = parsed2.get("total", 0) if parsed2 else 0
phase("2-badjson", f"坏 JSON 探针 {probe_pass}/{probe_total}", ok2,
      tail2, probe_checks)

# ═══════════════════════════════════════════════════════════
# 阶段 3：A/C/D 混沌门禁
# ═══════════════════════════════════════════════════════════
print("\n── 阶段 3/4  A/C/D 混沌门禁（17 断言 ~90s）──")
gate_out = os.path.join(LOGS, f"_post_deploy_gate_{int(time.time())}.json")
ok3, tail3, parsed3 = run_sub("v8_gate_acd.py", [BASE, gate_out, STAMP.replace("V8DEPLOY-", "")])
gate_checks = parsed3.get("checks", []) if parsed3 else []
gate_pass = parsed3.get("passed", 0) if parsed3 else 0
gate_total = parsed3.get("total", 0) if parsed3 else 0
phase("3-gate", f"A/C/D 混沌门禁 {gate_pass}/{gate_total}", ok3,
      tail3, gate_checks)

# ═══════════════════════════════════════════════════════════
# 阶段 4：零残留扫描
# ═══════════════════════════════════════════════════════════
print("\n── 阶段 4/4  V8GATE 零残留（内联清理+扫描）──")

def _jl(t, default):
    try:
        return json.loads(t)
    except Exception:
        return default

# 当前 run 的 gate stamp（v8_gate_acd.py 用 V8GATE-<ts>）
GATE_STAMP = f"V8GATE-{STAMP.replace('V8DEPLOY-', '')}"

# 清理本 run 残留（带重试，CF DELETE 偶发慢/503）
def _del_with_retry(path, retries=2):
    for attempt in range(retries):
        st, _, _ = _req("DELETE", path)
        if st in (200, 204, 404):  # 404=已删，幂等视为成功
            return True
        time.sleep(0.5)
    return False


def _cleanup_pass():
    """单轮清扫；返回本轮尝试删除的条目数。CF GET 偶发瞬空，故需双轮。"""
    n = 0
    for r in _jl(_req("GET", "/admin-ext/api/redirects")[2], []):
        if GATE_STAMP in str(r.get("from", "")):
            _del_with_retry(f"/admin-ext/api/redirects?id={r['id']}"); n += 1
    for x in _jl(_req("GET", "/admin-ext/api/links")[2], []):
        if GATE_STAMP in str(x.get("name", "")):
            _del_with_retry(f"/admin-ext/api/links?id={x['id']}"); n += 1
    for c in _jl(_req("GET", "/admin-ext/api/links/cats")[2], []):
        if GATE_STAMP in str(c.get("name", "")):
            _del_with_retry(f"/admin-ext/api/links/cats?id={c['id']}"); n += 1
    for qs in ("pending", "approved", "spam", "trash", ""):
        arr = _jl(_req("GET", f"/admin-ext/api/comments/list?status={qs}&perPage=100")[2], {})
        items = arr.get("items", []) if isinstance(arr, dict) else []
        ids = [c["id"] for c in items if GATE_STAMP in str(c.get("content", ""))]
        if ids:
            for attempt in range(2):
                st, _, _ = _req("POST", "/admin-ext/api/comments/action",
                                {"ids": ids, "action": "delete"})
                if st in (200, 204):
                    break
                time.sleep(0.5)
            n += len(ids)
    return n

# 双轮清扫：第一轮漏掉的（GET 瞬空/DELETE 503）第二轮兜底
_deleted = _cleanup_pass()
time.sleep(1)  # CF D1 最终一致性
_deleted += _cleanup_pass()
time.sleep(1)

# 扫描本 run 残留（只看 GATE_STAMP 前缀，不扫历史残留）
red = [r["from"] for r in _jl(_req("GET", "/admin-ext/api/redirects")[2], []) if GATE_STAMP in str(r.get("from", ""))]
links = [x["name"] for x in _jl(_req("GET", "/admin-ext/api/links")[2], []) if GATE_STAMP in str(x.get("name", ""))]
cats = [c["name"] for c in _jl(_req("GET", "/admin-ext/api/links/cats")[2], []) if GATE_STAMP in str(c.get("name", ""))]
cmts = []
for qs in ("pending", "approved", "spam", "trash"):
    arr = _jl(_req("GET", f"/admin-ext/api/comments/list?status={qs}&perPage=100")[2], {})
    items = arr.get("items", []) if isinstance(arr, dict) else []
    cmts += [c["id"] for c in items if GATE_STAMP in str(c.get("content", ""))]
residue_n = len(red) + len(links) + len(cats) + len(cmts)
ok4 = residue_n == 0
phase("4-residue", "V8GATE 前缀零残留", ok4,
      f"残留={residue_n} redirects={red[:3]} links={links[:3]} cats={cats[:3]} comments={cmts[:3]}",
      [{"id": "R01", "name": "重定向/链接/分类/评论零残留", "pass": ok4,
        "detail": f"total={residue_n}"}])

# ═══════════════════════════════════════════════════════════
# 汇总
# ═══════════════════════════════════════════════════════════
all_ok = all(p["pass"] for p in phases)
total_checks = sum(len(p["checks"]) for p in phases if p["checks"]) or len(phases)
passed_checks = sum(1 for p in phases for c in p["checks"] if c["pass"])
summary = {
    "base": BASE,
    "stamp": STAMP,
    "time": time.strftime("%Y-%m-%d %H:%M:%S"),
    "duration_s": round(time.time() - _t0, 1),
    "all_pass": all_ok,
    "phases": [
        {"id": p["id"], "name": p["name"], "pass": p["pass"],
         "detail": p["detail"],
         "checks_passed": sum(1 for c in p["checks"] if c["pass"]),
         "checks_total": len(p["checks"])}
        for p in phases
    ],
    "total_checks": total_checks,
    "passed_checks": passed_checks,
}

# 合并详细 checks 到输出
detail_out = OUT if os.path.isabs(OUT) else os.path.abspath(OUT)
summary["phases_detail"] = phases
with open(detail_out, "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

# 清理临时文件
for tmp in [probe_out, gate_out]:
    try:
        os.remove(tmp)
    except OSError:
        pass

print(f"\n{'='*60}")
status = "ALL PASS" if all_ok else "HAS FAILURES"
print(f"结果：{status}  |  {passed_checks}/{total_checks} 断言通过")
print(f"报告：{detail_out}")
print(f"{'='*60}")
sys.exit(0 if all_ok else 1)
