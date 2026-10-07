import type { MiddlewareHandler } from "astro";
import { collectDisabled } from "./lib/registry";
import { loadStates } from "./lib/state";
import { isCloudflareRuntime } from "@astropress/core";

/**
 * 前台 post 中间件：对被禁用插件（含套件内单个成员）的前台残留节点注入 CSS 隐藏。
 * （路由前缀已被 pre 中间件 404；此处处理已注入 HTML 的静态节点，如广告位容器。）
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();
  const path = ctx.url.pathname;
  // 只处理公开前台页面
  if (path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/admin-ext")) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const db = (ctx.locals as any).db;
  if (!db) return res;
  const states = await loadStates(db);
  const selectors = collectDisabled(states, { cloudflare: isCloudflareRuntime() }).frontendSelectors;
  if (selectors.length === 0) return res;

  const html = await res.clone().text();
  if (!html.includes("</head>")) return res;

  // 保留 </head> 锚点，注入隐藏样式
  const style = `<style data-ap-pm>${selectors.join(",")}{display:none!important}</style></head>`;
  const injected = html.replace("</head>", style);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
