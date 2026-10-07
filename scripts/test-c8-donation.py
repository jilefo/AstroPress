#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
C8/C9 打赏插件回归测试：新支付方式 + 图片上传
"""
import json, os, sys, time, uuid, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost:4321"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "plugin-test-c8/1.0")]
results = []

def record(name, ok, detail=""):
    results.append((name, "pass" if ok else "fail", detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

def req(method, path, data=None, raw_body=None, content_type=None):
    h = {}
    body = None
    if raw_body is not None:
        body = raw_body.encode("utf-8") if isinstance(raw_body, str) else raw_body
        if content_type: h["Content-Type"] = content_type
    elif data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    try:
        with opener.open(r, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()

def jreq(method, path, data=None):
    st, _, b = req(method, path, data=data)
    try:
        return st, json.loads(b.decode("utf-8", "replace"))
    except Exception:
        return st, b.decode("utf-8", "replace")

# 1. 登录（urllib 自动跟随 302，cookie 在重定向链中种下）
req("POST", "/api/auth/login", raw_body="username=admin&password=" + os.environ.get("AP_ADMIN_PASS", "admin") + "", content_type="application/x-www-form-urlencoded")
st, body = jreq("GET", "/admin-ext/api/donation/settings")
if st != 200:
    record("login", False, f"settings status={st}")
    sys.exit(1)
record("login", True)

# 2. 设置页 200
st, _, b = req("GET", "/admin-ext/donation")
record("admin page 200", st == 200)

# 3. GET 设置包含新字段
st, body = jreq("GET", "/admin-ext/api/donation/settings")
ok = st == 200 and isinstance(body, dict) and "paypalLink" in body and "applePayQr" in body
record("GET settings has new fields", ok, str(body)[:120] if not ok else "")

# 4. POST 保存新支付方式
payload = {
    "enabled": True,
    "buttonText": "支持作者 ☕",
    "heading": "感谢支持",
    "message": "喝杯咖啡",
    "wechatQr": "/media/test-wx.png",
    "alipayQr": "",
    "paypalLink": "https://paypal.me/test",
    "applePayQr": "/media/apple.png",
    "googlePayQr": "",
    "afdianLink": "https://afdian.com/a/test",
    "position": "after_content"
}
st, body = jreq("POST", "/admin-ext/api/donation/settings", data=payload)
ok = st == 200 and isinstance(body, dict) and body.get("ok")
record("POST save new methods", ok, str(body)[:120] if not ok else "")

# 5. 再次 GET 验证保存生效
st, body = jreq("GET", "/admin-ext/api/donation/settings")
ok = st == 200 and isinstance(body, dict) and body.get("paypalLink") == "https://paypal.me/test" and body.get("applePayQr") == "/media/apple.png"
record("GET verify saved", ok, str(body)[:120] if not ok else "")

# 6. CSRF 校验（Origin 不匹配 403）
r = urllib.request.Request(BASE + "/admin-ext/api/donation/settings", data=json.dumps(payload).encode(), method="POST", headers={"Content-Type": "application/json", "Origin": "https://evil.com"})
try:
    with opener.open(r, timeout=10) as resp:
        csrf_st = resp.status
except urllib.error.HTTPError as e:
    csrf_st = e.code
record("POST CSRF block", csrf_st == 403, f"status={csrf_st}")

# 7. 匿名访问拒绝（302 重定向到登录页或 401/403；需禁用重定向跟随）
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw): return None
no_redir = urllib.request.build_opener(NoRedirect)
try:
    with no_redir.open(BASE + "/admin-ext/api/donation/settings", timeout=10) as r:
        anon_st = r.status
except urllib.error.HTTPError as e:
    anon_st = e.code
record("anon GET blocked", anon_st in (301, 302, 401, 403), f"status={anon_st}")

# 8. 前台注入验证（真实已发布文章 /blog/seo-guide）
st, _, b = req("GET", "/blog/seo-guide")
html = b.decode("utf-8", "replace")
has_donation = 'id="ap-donation"' in html
record("frontend injection", has_donation, f"has id={has_donation}, len={len(html)}")

# 9. 前台新支付方式渲染（步骤4已保存 paypalLink/applePayQr/afdianLink）
has_paypal = "paypal.me/test" in html
has_afdian = "afdian.com/a/test" in html
has_apple = "/media/apple.png" in html
has_wx = "/media/test-wx.png" in html
record("frontend renders new methods", has_paypal and has_afdian and has_apple and has_wx,
       f"paypal={has_paypal}, afdian={has_afdian}, apple={has_apple}, wx={has_wx}")

# 汇总
passed = sum(1 for _, s, _ in results if s == "pass")
failed = sum(1 for _, s, _ in results if s == "fail")
print(f"\n=== 结果: {passed}/{len(results)} 通过, {failed} 失败 ===")
if failed:
    sys.exit(1)
