import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { createDatabase, createD1Database } from "@astropress/core";
import { createAuth } from "@astropress/auth";
import { loadSettings, STATIC_EXTS, type MaintenanceSettings } from "./lib/settings";

const BYPASS_PREFIXES = ["/admin", "/login", "/api/", "/admin-ext", "/ap-", "/_astro", "/media"];

function isStaticAsset(pathname: string): boolean {
  const dot = pathname.lastIndexOf(".");
  if (dot < 0 || dot < pathname.lastIndexOf("/")) return false;
  return STATIC_EXTS.includes(pathname.slice(dot + 1).toLowerCase());
}

/**
 * 取访客 IP（与核心约定一致）：cf-connecting-ip（Cloudflare 边缘权威写入）
 * → x-forwarded-for 首段（可信反代）→ "unknown"。不使用 Astro.clientAddress。
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 45);
}

/** HTML 转义（设置文案来自后台输入，必须转义后才能拼进页面） */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 内联样式维护页：无外部依赖，标题/正文/预计恢复时间来自设置 */
function renderPage(s: MaintenanceSettings): string {
  const etaHtml = s.eta ? `<p class="eta">预计恢复时间：${esc(s.eta)}</p>` : "";
  const messageHtml = esc(s.message).replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(s.title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f0f0f1; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: #2c3338; }
  .box { max-width: 520px; margin: 24px; padding: 48px 40px; background: #fff; border: 1px solid #dcdcde; border-radius: 8px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .icon { font-size: 40px; line-height: 1; margin-bottom: 16px; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.8; margin: 0; color: #646970; }
  .eta { margin-top: 16px; font-size: 13px; color: #2271b1; }
</style>
</head>
<body>
  <div class="box">
    <div class="icon">🛠️</div>
    <h1>${esc(s.title)}</h1>
    <p>${messageHtml}</p>
    ${etaHtml}
  </div>
</body>
</html>`;
}

/**
 * 解析 DB：本中间件以 pre 顺序注册（先于核心应用中间件），
 * 此时 locals.db 尚未设置。优先用绑定的 D1；本地/Node 回退到 createDatabase。
 */
async function resolveDb(ctx: Parameters<MiddlewareHandler>[0]): Promise<any | null> {
  const locals = ctx.locals as any;
  if (locals.db) return locals.db;
  const d1 = locals.runtime?.env?.DB as D1Database | undefined;
  if (d1) return createD1Database(d1);
  try {
    return await createDatabase((import.meta as any).env?.DATABASE_URL ?? "file:./local.db");
  } catch {
    return null;
  }
}

/**
 * 前台中间件：维护模式（pre：先于 page-cache，缓存命中也无法绕过闸门）。
 * 开启时，未登录访客的 GET 请求返回 503 + Retry-After + 维护页；
 * 已登录 / 后台 / API / 静态资源 / IP 白名单一律放行。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const db = await resolveDb(ctx);
  if (!db || (await isPluginDisabled(db, "maintenance-mode"))) return next();

  if (ctx.request.method !== "GET") return next();

  const { pathname } = ctx.url;
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return next();
  if (isStaticAsset(pathname)) return next();

  // 已登录用户放行：必须校验会话有效性，仅伪造 Cookie 名不得绕过
  let isLoggedIn = false;
  try {
    const auth = createAuth(db);
    const sessionId = ctx.cookies.get(auth.sessionCookieName)?.value ?? null;
    if (sessionId) {
      const { session } = await auth.validateSession(sessionId);
      isLoggedIn = !!session;
    }
  } catch {
    isLoggedIn = false;
  }
  if (isLoggedIn) return next();

  let settings: MaintenanceSettings | null = null;
  try {
    settings = await loadSettings(db);
  } catch {
    settings = null;
  }
  if (!settings || !settings.enabled) return next();

  // IP 白名单放行
  const ip = getClientIp(ctx.request);
  if (ip && settings.allowedIps.includes(ip)) return next();

  return new Response(renderPage(settings), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "300",
      "Cache-Control": "no-store",
    },
  });
};
