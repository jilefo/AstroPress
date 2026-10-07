import type { MiddlewareHandler } from "astro";
import { REGISTRY, collectDisabled } from "./lib/registry";
import { loadStates } from "./lib/state";
import { getPreDb } from "./lib/db";
import { isCloudflareRuntime } from "@astropress/core";

/**
 * pre 中间件：被禁用插件（含套件内单个成员）的路由前缀一律 404。
 * 自身（/admin-ext/plugin-manager）永远放行。
 * 注意：pre 先于应用中间件执行，locals.db 未注入，需自建连接。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const path = ctx.url.pathname;
  // 自身管理页永远放行（先于 DB，避免无谓建连）
  if (path.startsWith("/admin-ext/plugin-manager") || path.startsWith("/admin-ext/api/plugin-manager")) {
    return next();
  }

  // 快速路径：纯字符串预判，只有命中任一已注册插件路由前缀
  //（套件并集 + 成员独立前缀，如 /webdav）的请求才可能需要 404。
  // 绝大多数公开页面零 I/O 放行。
  const hitsAnyPrefix = REGISTRY.some((meta) => {
    const prefixes = meta.routePrefixes.concat((meta.members ?? []).flatMap((mem) => mem.routePrefixes ?? []));
    return prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
  });
  if (!hitsAnyPrefix) return next();

  const locals = ctx.locals as any;
  const db = locals.db ?? (await getPreDb(locals));
  if (!db) return next();

  const states = await loadStates(db);
  const disabled = collectDisabled(states, { cloudflare: isCloudflareRuntime() });
  for (const prefix of disabled.routePrefixes) {
    // 精确路由（如 /rss.xml）与前缀（如 /ap-ads/）统一用 startsWith，精确项不以 / 结尾不会误伤
    if (path === prefix || path.startsWith(prefix)) {
      return new Response("页面不存在", { status: 404 });
    }
  }
  return next();
};
