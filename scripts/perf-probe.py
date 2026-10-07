#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""关键路径响应时间采样（每路径 5 次取均值）"""
import statistics, time, urllib.request

BASE = "http://localhost:4321"
PATHS = ["/", "/pv-tips", "/search", "/directory", "/rss.xml", "/robots.txt", "/sitemap.xml", "/admin/login" if False else "/login"]

for p in PATHS:
    ts = []
    for _ in range(5):
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(BASE + p, timeout=15) as r:
                r.read()
                code = r.status
        except Exception as e:
            code = getattr(e, "code", "ERR")
        ts.append((time.perf_counter() - t0) * 1000)
    print(f"{p:16s} code={code} avg={statistics.mean(ts):7.1f}ms  min={min(ts):7.1f}  max={max(ts):7.1f}")
