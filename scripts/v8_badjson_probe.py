# -*- coding: utf-8 -*-
"""V8 任务4：核心 API 坏 JSON 收口探针。

对全部 JSON 管理端点发送畸形请求体（Content-Type: application/json + '{bad'），
断言：
  1) HTTP 400（绝不能 500）
  2) Content-Type 为 application/json（绝不能回退成首页/登录页 HTML）
  3) body 可解析为 JSON 且含中文 error 字段
另测空 body 与 JSON 合法但字段缺失（应走字段校验，返回 4xx JSON 而非 500）。

用法: python v8_badjson_probe.py [BASE_URL] [OUT_JSON]
默认 BASE 取环境变量 AP_BASE 或 http://127.0.0.1:4322
"""
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("AP_BASE", "http://127.0.0.1:4322")).rstrip("/")
_HERE = os.path.dirname(os.path.abspath(__file__))
_LOGS = os.path.join(_HERE, "..", "logs")
os.makedirs(_LOGS, exist_ok=True)
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(_LOGS, "v8_badjson_result.json")
PWD = os.environ.get("ASTROPRESS_TEST_PASSWORD", "")
if not PWD:
    cred = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".ap-data", "credential.txt")
    if os.path.exists(cred):
        for line in open(cred, encoding="utf-8"):
            if line.startswith("ASTROPRESS_TEST_PASSWORD="):
                PWD = line.split("=", 1)[1].strip()
                break


# 允许 http 下回传 Secure cookie（Node 生产形态直连测试用）
class _SecurePolicy(http.cookiejar.DefaultCookiePolicy):
    def return_ok_secure(self, cookie, request):
        return True


cj = http.cookiejar.CookieJar(policy=_SecurePolicy())
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))


def call(method, path, body=None, ctype="application/json", raw=False):
    url = BASE + path
    if method == "GET":
        data = None
    elif body is None:
        data = b"{bad json"
    elif raw:
        data = body if isinstance(body, bytes) else body.encode()
    else:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": ctype,
                                          "User-Agent": "Mozilla/5.0 V8BadJsonProbe/1.0",
                                          "Origin": BASE})
    try:
        r = opener.open(req, timeout=30)
        return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except urllib.error.URLError as e:
        return -1, {}, f"{type(e).__name__}: {e}".encode()


# (method, path, expect)  expect: 400json=标准断言
ENDPOINTS = [
    ("POST", "/api/posts"),
    ("POST", "/api/posts/bulk"),
    ("PUT", "/api/posts/1"),
    ("POST", "/api/posts/1/meta"),
    ("PUT", "/api/posts/1/terms/category"),
    ("POST", "/api/menus"),
    ("PATCH", "/api/menus/1"),
    ("POST", "/api/menus/1/items"),
    ("PATCH", "/api/menus/1/items"),
    ("POST", "/api/terms/category"),
    ("POST", "/api/taxonomies"),
    ("POST", "/api/post-types"),
    ("POST", "/api/forms"),
    ("PATCH", "/api/forms/nope/entries"),
    ("POST", "/api/custom-fields"),
    ("POST", "/api/custom-fields/values"),
    ("POST", "/api/pages/set-front"),
    ("PUT", "/api/page-schema/probe"),
    ("PUT", "/api/ai/settings"),
    ("POST", "/api/ai/generate-blocks"),
    ("POST", "/api/ai/execute"),
    ("POST", "/api/ai/chat"),
    ("POST", "/api/ai/test"),
    ("POST", "/api/themes"),
    ("PUT", "/api/themes/nonexistent"),
    ("PUT", "/api/themes/config"),
    ("POST", "/api/themes/library"),
    ("PUT", "/api/themes/slots"),
    ("POST", "/api/themes/templates"),
    ("PUT", "/api/themes/templates/nonexistent"),
    ("POST", "/api/themes/loop-templates"),
    ("PUT", "/api/themes/loop-templates/nonexistent"),
    ("POST", "/api/themes/import"),
    # users 用不存在 id，坏 JSON 必须先于资源处理被拦截
    ("POST", "/api/users"),
    ("PUT", "/api/users/99999999"),
]

results = []

# ---- 登录（契约：form-urlencoded username/password；opener 跟随 302 落 dashboard） ----
st, hdrs, login_body = call("POST", "/api/auth/login",
                           body=urllib.parse.urlencode({"username": "admin", "password": PWD}),
                           ctype="application/x-www-form-urlencoded", raw=True)
# 用鉴权 GET 反证会话已建立（未登录会被 302 到登录页 → 最终 HTML）
gst, ghdrs, gbody = call("GET", "/api/posts?page=1")
gct = (ghdrs.get("Content-Type") or ghdrs.get("content-type") or "").lower()
if gst != 200 or "application/json" not in gct:
    print(f"登录失败：login={st} 鉴权 GET /api/posts={gst} {gct}")
    summary = {"base": BASE, "time": time.strftime("%Y-%m-%d %H:%M:%S"),
               "total": 0, "passed": 0, "failed": 0, "results": [],
               "error": f"登录失败 login={st}"}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    sys.exit(1)
print("登录成功，开始坏 JSON 探测：", BASE)

for method, path in ENDPOINTS:
    st, hdrs, raw_body = call(method, path)
    ct = (hdrs.get("Content-Type") or hdrs.get("content-type") or "").lower()
    text = raw_body.decode("utf-8", "replace")
    is_json = "application/json" in ct
    parsed = None
    if is_json:
        try:
            parsed = json.loads(text)
        except Exception:
            pass
    has_cn_error = bool(parsed) and isinstance(parsed, dict) and isinstance(parsed.get("error"), str) and any(
        "\u4e00" <= ch <= "\u9fff" for ch in parsed["error"])
    ok = (st == 400 and is_json and has_cn_error
          and not text.lstrip().startswith("<"))
    results.append({"method": method, "path": path, "status": st, "json": is_json,
                    "cnError": has_cn_error, "snippet": text[:80], "pass": ok})
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {method:5} {path:42} -> {st} {ct.split(';')[0]:30} "
          f"{(parsed or {}).get('error', '')[:30] if parsed else text[:30]}")

# ---- 补充：合法 JSON 但缺必填字段（不应 500） ----
field_cases = [
    ("POST", "/api/posts", {}),
    ("POST", "/api/menus", {}),
    ("POST", "/api/taxonomies", {}),
    ("POST", "/api/forms", {}),
    ("POST", "/api/custom-fields", {}),
    ("PATCH", "/api/menus/1/items", {"not": "array"}),
]
for method, path, body in field_cases:
    st, hdrs, raw_body = call(method, path, body=body)
    ct = (hdrs.get("Content-Type") or hdrs.get("content-type") or "").lower()
    is_json = "application/json" in ct
    text = raw_body.decode("utf-8", "replace")
    ok = st in (400, 404, 409) and is_json and not text.lstrip().startswith("<")
    results.append({"method": method, "path": path, "kind": "missing-field",
                    "status": st, "json": is_json, "pass": ok, "snippet": text[:80]})
    print(f"[{'PASS' if ok else 'FAIL'}] {method:5} {path:42} 缺字段 -> {st}")

passed = sum(1 for r in results if r["pass"])
summary = {"base": BASE, "time": time.strftime("%Y-%m-%d %H:%M:%S"),
           "total": len(results), "passed": passed, "failed": len(results) - passed,
           "results": results}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"\n{passed}/{len(results)} PASS  ->  {OUT}")
sys.exit(0 if passed == len(results) else 1)
