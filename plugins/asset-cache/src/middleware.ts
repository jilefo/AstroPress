import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings, STATIC_EXTS, type AssetCacheSettings } from "./lib/settings";

interface MatchedRule {
  maxAge: number;
  immutable: boolean;
}

/** 路径 → 缓存规则；不命中返回 null（extraRules 优先于内置扩展名） */
function matchRule(pathname: string, s: AssetCacheSettings): MatchedRule | null {
  if (pathname.startsWith("/_astro/")) return { maxAge: s.astroMaxAge, immutable: true };
  if (pathname.startsWith("/media/")) return { maxAge: s.mediaMaxAge, immutable: false };

  const dot = pathname.lastIndexOf(".");
  if (dot < 0 || dot < pathname.lastIndexOf("/")) return null;
  const ext = pathname.slice(dot + 1).toLowerCase();
  if (!ext) return null;

  for (const r of s.extraRules) {
    if (r.ext === ext) return { maxAge: r.maxAge, immutable: false };
  }
  if (STATIC_EXTS.includes(ext)) return { maxAge: s.staticMaxAge, immutable: false };
  return null;
}

/** 上游 Cache-Control 是否为「默认值」（可安全覆盖）。
 *  注意 no-store 是 RFC 9111 隐私指令，显式 no-store 一律不覆盖。 */
function isDefaultCacheControl(value: string): boolean {
  const v = value.trim().toLowerCase();
  // max-age=0（含 "public, max-age=0, must-revalidate" 变体）语义等同 no-cache：
  // Astro 静态托管默认发该头，若不识别则本插件的规则永远不生效
  return v === "" || v === "no-cache" || v.startsWith("no-cache,") || v.includes("max-age=0");
}

/**
 * 前台中间件：静态资源 Cache-Control 强缓存头。
 * 只改响应头、不读响应体；text/html 一律不处理；
 * 任何异常 fail-open：原样放行，next() 全程只调用一次。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const locals = ctx.locals as any;
  if (!locals.db || (await isPluginDisabled(locals.db, "asset-cache"))) return next();

  const { pathname } = ctx.url;
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/") || pathname.startsWith("/admin-ext")) {
    return next();
  }

  let settings: AssetCacheSettings | null = null;
  try {
    settings = await loadSettings(locals.db);
  } catch {
    settings = null;
  }
  if (!settings || !settings.enabled) return next();

  const rule = matchRule(pathname, settings);
  if (!rule || rule.maxAge <= 0) return next();

  const res = await next();
  try {
    // 仅对成功响应施加强缓存：404/5xx 被浏览器缓存会造成资源长期不可用
    if (res.status !== 200) return res;
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("text/html")) return res;

    // 尊重上游已有的非默认 Cache-Control（除非开启强制覆盖）
    const existing = res.headers.get("cache-control");
    if (existing && !settings.forceOverride && !isDefaultCacheControl(existing)) return res;

    // 未改 body：不删 content-length，不调 res.clone()
    const headers = new Headers(res.headers);
    headers.set(
      "Cache-Control",
      `public, max-age=${rule.maxAge}${rule.immutable ? ", immutable" : ""}`
    );
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
