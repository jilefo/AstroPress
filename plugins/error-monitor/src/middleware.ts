import type { MiddlewareHandler } from "astro";
import { sql } from "drizzle-orm";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { ensureSchema } from "./lib/schema";
import { loadSettings } from "./lib/settings";

// 进程内去重窗：同一路径 60 秒内只写一次库（首次也写）
const DEDUP_TTL = 60_000;
// 内存有界：404 扫描器可能打出海量不同路径，超过阈值先清扫过期键，
// 极端 404 风暴下仍超限则按插入顺序淘汰最旧项（仅略降去重精度，杜绝内存泄漏）
const RECENT_MAX = 3_000;
const recent = new Map<string, number>();

const ASSET_RE = /\.[a-z0-9]{1,8}$/i;

/**
 * 前台中间件：记录匿名访客遇到的 404 HTML 响应。
 * 全部异常吞掉，监控绝不影响正常响应。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  try {
    const { request } = ctx;
    if (request.method !== "GET") return res;

    const { pathname, search } = ctx.url;
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/admin-ext")
    ) {
      return res;
    }

    // 只记录匿名访问（已登录请求带 auth_session cookie）
    const cookie = request.headers.get("cookie") ?? "";
    if (cookie.includes("auth_session=")) return res;

    if (res.status !== 404) return res;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) return res;

    const locals = ctx.locals as any;
    const db = locals.db ?? null;
    if (!db) return res;
    if (await isPluginDisabled(db, "error-monitor")) return res;

    const settings = await loadSettings(db);
    if (!settings.enabled) return res;

    if (!settings.logAssets && ASSET_RE.test(pathname)) return res;

    if (settings.ignores.some((rule) => pathname.includes(rule))) return res;

    const fullPath = (pathname + search).slice(0, 500);

    const now = Date.now();
    const last = recent.get(fullPath);
    if (last !== undefined && now - last < DEDUP_TTL) return res;
    recent.set(fullPath, now);
    if (recent.size > RECENT_MAX) {
      for (const [k, t] of recent) {
        if (now - t >= DEDUP_TTL) recent.delete(k);
      }
      while (recent.size > RECENT_MAX) {
        const oldest = recent.keys().next().value;
        if (oldest === undefined) break;
        recent.delete(oldest);
      }
    }

    const ref = (request.headers.get("referer") || "").slice(0, 500);

    await ensureSchema(db);
    await db.run(sql`
      INSERT INTO ap_404_log (path, referer, hits, first_seen, last_seen)
      VALUES (${fullPath}, ${ref}, 1, ${now}, ${now})
      ON CONFLICT(path) DO UPDATE SET
        hits = hits + 1,
        last_seen = excluded.last_seen,
        referer = CASE WHEN excluded.referer = '' THEN ap_404_log.referer ELSE excluded.referer END
    `);
  } catch {
    /* 监控失败永不影响正常响应 */
  }

  return res;
};
