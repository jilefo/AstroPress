import type { MiddlewareHandler } from "astro";

/**
 * Injects the i18n client script into admin HTML pages (runs as "post"
 * middleware after rendering — no core file is modified; disabling the
 * plugin removes both the route and this tag). The script short-circuits
 * itself when translation is disabled in settings, so the injection stays
 * unconditional and cheap. /admin-ext/* also starts with "/admin" and is
 * included, so the management page gets translated like the rest.
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
    `<script src="/api/ap-i18n/script.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
