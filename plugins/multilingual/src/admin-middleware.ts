import type { MiddlewareHandler } from "astro";

/**
 * Injects the Language panel injector script into admin HTML pages
 * (post middleware — no core file modified). The core editors render
 * registered sidebar panels as empty boxes (only SeoPanel gets an island),
 * so panel.js fills/creates the Language box client-side using the
 * plugin's own /admin-ext/api/ml/* endpoints.
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
    `<script src="/ml-asset/panel.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
