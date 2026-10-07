import type { MiddlewareHandler } from "astro";
import { and, eq } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadPermalinkSettings } from "@astropress/core/permalink";

/**
 * 固定链接美化中间件（post 顺序），双向路径治理：
 *
 * ① 反向 301 迁移（请求侧，next 之前）：
 *    GET /blog/{slug} 且存在同名已发布「文章」、设置 enabled+redirectOld 时，
 *    301 到 /{slug}——旧链接搜索引擎权重收敛到新规范 URL，浏览器地址栏更新。
 *    页面（page 类型）不在 /blog/ 下，/blog 列表页（单段路径）不受影响。
 *
 * ② 正向内部 rewrite（响应侧，404 时）：
 *    GET /{slug} 单段路径且结果为 404 时，若存在同名已发布「文章」，
 *    用 ctx.rewrite 内部重写到 /blog/{slug} 渲染。浏览器地址栏保持 /{slug}。
 *    重写请求携带 x-ap-permalink-rewrite 标记头：
 *      - 防止重跑链中的本中间件把 /blog/{slug} 再次 301（无限循环）；
 *      - page-cache 等缓存层据此跳过，避免渲染结果以 /blog/ 路径入库。
 *
 * 页面（page 类型）天然优先：/pv-tips 先命中 /[slug].astro（页面），
 * 页面存在时正常渲染，不触发 rewrite；仅当页面不存在且文章存在时才重写。
 *
 * 性能：301 检查仅在 /blog/{slug} 形态请求时查库（设置走 15s 共享缓存），
 * 正向 rewrite 仅在 404 时查库，正常页面零开销。
 *
 * 注意：ctx.rewrite 会从头完整重跑中间件链（dev/prod 行为一致），
 * 标记头必须通过 Request 对象携带（RewritePayload.headers 在 Astro 4.16 不生效）。
 */

const SLUG_RE = /^\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,199})\/?$/;
const BLOG_SLUG_RE = /^\/blog\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,199})\/?$/;
export const REWRITE_MARKER = "x-ap-permalink-rewrite";

// 插件管理器禁用状态由 @astropress/core/plugin-state 统一缓存（15s TTL + 变更主动失效，fail-open）

async function postExists(db: any, slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: wpPosts.id })
    .from(wpPosts)
    .where(and(eq(wpPosts.postName, slug), eq(wpPosts.postType, "post"), eq(wpPosts.postStatus, "publish")))
    .limit(1);
  return rows.length > 0;
}

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const method = ctx.request.method;

  if (method === "GET" || method === "HEAD") {
    const locals = ctx.locals as any;
    const db = locals?.db ?? null;
    if (db) {
      // ① 反向 301：/blog/{slug} → /{slug}（内部重写请求带标记，跳过）
      const bm = BLOG_SLUG_RE.exec(ctx.url.pathname);
      if (bm && ctx.request.headers.get(REWRITE_MARKER) !== "1") {
        if (!(await isPluginDisabled(db, "permalink").catch(() => false))) {
          const settings = await loadPermalinkSettings(db);
          if (settings.enabled && settings.redirectOld) {
            try {
              if (await postExists(db, bm[1])) {
                return new Response(null, {
                  status: 301,
                  headers: { Location: "/" + bm[1] + (ctx.url.search || "") },
                });
              }
            } catch {
              /* 查库失败按不存在处理，走正常渲染 */
            }
          }
        }
      }
    }
  }

  const res = await next();

  if (method !== "GET" && method !== "HEAD") return res;

  const locals = ctx.locals as any;
  const db = locals?.db ?? null;
  if (!db) return res;

  const path = ctx.url.pathname;

  if (res.status !== 404) return res;
  const m = SLUG_RE.exec(path);
  if (!m) return res;

  // 被插件管理器禁用时直接停止 rewrite（零额外查询开销由缓存保证）
  if (await isPluginDisabled(db, "permalink")) return res;

  const settings = await loadPermalinkSettings(db);
  if (!settings.enabled) return res;

  const slug = m[1];
  try {
    if (!(await postExists(db, slug))) return res;
  } catch {
    return res;
  }

  // ② 正向内部 rewrite：携带标记头，防止重跑链中 ① 误触发与缓存层误入库
  const headers = new Headers(ctx.request.headers);
  headers.set(REWRITE_MARKER, "1");
  const rewriteReq = new Request(new URL("/blog/" + slug + (ctx.url.search || ""), ctx.url.origin), {
    method,
    headers,
  });
  return ctx.rewrite(rewriteReq);
};
