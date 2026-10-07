import type { MiddlewareHandler } from "astro";

/**
 * 把 media-av 编辑器脚本注入后台 HTML（post 中间件）。
 * 只在 /admin 页面注入；公开页与匿名访客不需要（API 本身有登录墙）。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  if (!ctx.url.pathname.startsWith("/admin")) return next();
  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</head>")) return res;

  const injected = html.replace(
    "</head>",
    `<script src="/api/ap-media-av/media-av.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
