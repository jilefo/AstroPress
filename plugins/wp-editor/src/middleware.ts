import type { MiddlewareHandler } from "astro";

/**
 * 把 wp-editor 增强脚本注入后台 HTML（post 中间件）。仅 /admin 页面。
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
    `<script src="/api/ap-wp-editor/wp-editor.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
