import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings } from "./lib/settings";
import * as store from "./lib/store";
import { bumpEpoch, getEpoch } from "./lib/epoch";

/**
 * 前台中间件：全页 HTML 内存缓存
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const method = ctx.request.method;
  const { pathname, search } = ctx.url;

  // 写后失效：非 GET/HEAD 的 API 写操作成功（status<400）后清空全部缓存，
  // 并 bump 全局纪元使其他 CF isolate 的陈旧条目一并失效（多 isolate 内存缓存不互通）。
  // 不读取请求体，直接放行返回。
  if (method !== "GET" && method !== "HEAD") {
    if (pathname.startsWith("/api/") || pathname.startsWith("/admin-ext/api/")) {
      const res = await next();
      if (res.status < 400) {
        store.clear();
        const wdb = (ctx.locals as any).db ?? null;
        if (wdb) await bumpEpoch(wdb);
      }
      return res;
    }
    return await next();
  }

  // 其余只处理 GET（HEAD 不缓存）
  if (method !== "GET") return await next();

  // 后台 / API 路径一律不缓存
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/") || pathname.startsWith("/admin-ext")) {
    return await next();
  }

  // permalink 内部重写请求（x-ap-permalink-rewrite 标记）：不查也不写缓存。
  // 重写渲染出的 /blog/{slug} 页面若以该路径入库，后续对旧 /blog/* 链接的真实
  // 访问会命中缓存返回 200，导致 301 迁移永远无法触发（且地址栏停留在 /blog/）。
  if (ctx.request.headers.get("x-ap-permalink-rewrite") === "1") return await next();

  // 已登录用户旁路：不缓存、不标记
  const cookie = ctx.request.headers.get("cookie") ?? "";
  if (cookie.includes("auth_session=")) return await next();

  // 异常时 next 只允许调用一次：res 已拿到就返回 res，否则补调一次 next
  let res: Response | null = null;
  try {
    const locals = ctx.locals as any;
    const db = locals.db ?? null;
    if (!db) return await next();
    if (await isPluginDisabled(db, "page-cache")) return await next();

    let settings;
    try {
      settings = await loadSettings(db);
    } catch {
      return await next();
    }
    if (!settings.enabled) return await next();

    // 默认不缓存带 query 的请求
    if (!settings.cacheWithQuery && search) return await next();

    // 排除路径（子串命中即跳过）
    if (settings.excludes.some((x) => x && pathname.includes(x))) return await next();

    const key = pathname + (settings.cacheWithQuery ? search : "");

    // 命中（需通过跨 isolate 纪元校验：入库时间早于全局纪元视为陈旧，重渲染）
    const hit = store.get(key);
    if (hit) {
      const epoch = await getEpoch(db);
      if (hit.cachedAt > epoch) {
        const counters = store.stats();
        counters.hits++;
        const age = Math.max(
          0,
          Math.floor((Date.now() - (hit.expires - settings.ttlSec * 1000)) / 1000)
        );
        const headers = new Headers();
        headers.set("content-type", hit.contentType);
        headers.set("X-Cache", "HIT");
        headers.set("Age", String(age));
        // 浏览器不私自缓存，回源以中间件判定为准
        headers.set("Cache-Control", "no-cache");
        return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
      }
    }

    // 未命中
    res = await next();
    const ctype = res.headers.get("content-type") ?? "";
    const cacheable =
      ctype.includes("text/html") &&
      !res.headers.has("set-cookie") &&
      (res.status === 200 || (settings.cache404 && res.status === 404));
    if (!cacheable) return res;

    const body = await res.clone().text();
    store.set(
      key,
      {
        body,
        status: res.status,
        statusText: res.statusText,
        contentType: ctype,
        expires: Date.now() + settings.ttlSec * 1000,
        cachedAt: Date.now(),
      },
      settings.maxEntries
    );
    const counters = store.stats();
    counters.misses++;

    const headers = new Headers(res.headers);
    headers.set("X-Cache", "MISS");
    headers.delete("content-length");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch {
    if (res) return res;
    try {
      return await next();
    } catch {
      return new Response("服务器开小差了，请稍后再试", { status: 500 });
    }
  }
};
