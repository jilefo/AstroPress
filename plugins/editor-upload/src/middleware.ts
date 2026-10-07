import type { MiddlewareHandler } from "astro";

/**
 * Injects the editor enhancement script tag into admin HTML pages.
 * Runs as "post" middleware (after rendering) — no editor/core file is
 * modified; deactivating the plugin removes both the route and this script.
 * Public pages are skipped: they never use the script and anonymous visitors
 * would just get a 302 from the auth-walled /api path.
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
    `<script src="/api/ap-media/editor-upload.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};