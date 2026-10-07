# -*- coding: utf-8 -*-
"""一次性修复：siteurl 补上 dev 端口（http://localhost -> http://localhost:4321）"""
import os
import requests

BASE = "http://localhost:4321"
s = requests.Session()
s.headers.update({"Origin": BASE, "Referer": BASE + "/admin/dashboard"})

r = s.post(BASE + "/api/auth/login", data={"username": "admin", "password": os.environ.get("AP_ADMIN_PASS", "admin")}, allow_redirects=False, timeout=15)
assert r.status_code == 302, f"login failed: {r.status_code}"

q = s.post(BASE + "/admin-ext/api/db-console/exec", json={"sql": "SELECT option_id, option_value FROM wp_options WHERE option_name='siteurl'"}, timeout=15)
print("before:", q.json().get("rows"))

u = s.post(BASE + "/admin-ext/api/db-console/exec",
           json={"sql": "UPDATE wp_options SET option_value='http://localhost:4321' WHERE option_name='siteurl'", "confirmWrite": True}, timeout=15)
print("update:", u.status_code, u.json())

q2 = s.post(BASE + "/admin-ext/api/db-console/exec", json={"sql": "SELECT option_value FROM wp_options WHERE option_name='siteurl'"}, timeout=15)
print("after:", q2.json().get("rows"))
