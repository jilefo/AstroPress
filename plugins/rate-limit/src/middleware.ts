import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings } from "./lib/settings";
import * as limiter from "./lib/limiter";

/**
 * 取访客 IP（与核心约定一致）。
 * cf-connecting-ip 由 Cloudflare 边缘权威写入、客户端无法伪造；
 * 其次 x-forwarded-for 首段（可信反代）；均缺失时 "unknown"。
 * 不使用 Astro.clientAddress（CF 适配器 getter 抛异常；重包请求丢符号）。
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 45);
}

function tooManyPage(retryAfterSec: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>请求过于频繁</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f6f7f7; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: #2c3338; }
  .box { text-align: center; padding: 40px 32px; background: #fff; border: 1px solid #dcdcdd; border-radius: 8px; max-width: 420px; }
  .code { font-size: 42px; font-weight: 700; color: #d63638; margin: 0 0 8px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 13px; color: #646970; margin: 0; }
</style>
</head>
<body>
  <div class="box">
    <div class="code">429</div>
    <h1>请求过于频繁</h1>
    <p>请约 ${retryAfterSec} 秒后再试。</p>
  </div>
</body>
</html>`;
}

/**
 * 前台中间件：IP 令牌桶限流。
 * 规则按配置顺序匹配，首个命中的规则生效。任何异常 fail-open 放行。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const locals = ctx.locals as any;
  if (!locals.db || (await isPluginDisabled(locals.db, "rate-limit"))) return next();

  try {
    const settings = await loadSettings(locals.db);
    if (!settings.enabled) return next();

    const { pathname } = ctx.url;
    const method = ctx.request.method;
    // 限流只作用于前台公开端点：豁免后台，避免管理员把自己连同 reset 接口一起锁死
    if (pathname.startsWith("/admin")) return next();
    const rule = settings.rules.find(
      (r) => r.enabled && (r.method === "ALL" || r.method === method) && pathname.startsWith(r.prefix)
    );
    if (!rule) return next();

    const ip = getClientIp(ctx.request);
    const result = limiter.consume(ip, rule);
    if (result.allowed) return next();

    // API 类路径（/api/*、/ap-*）返回 JSON，页面路径返回简洁 HTML
    const isApi = pathname.startsWith("/api/") || pathname.startsWith("/ap-");
    const headers = new Headers();
    headers.set("Content-Type", isApi ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
    headers.set("Retry-After", String(result.retryAfterSec));
    const body = isApi ? JSON.stringify({ error: "请求过于频繁" }) : tooManyPage(result.retryAfterSec);
    return new Response(body, { status: 429, headers });
  } catch {
    return next();
  }
};
