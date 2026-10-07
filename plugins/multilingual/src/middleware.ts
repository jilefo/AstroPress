import { getSiteInfo } from "@astropress/core/query";
import type { MiddlewareHandler } from "astro";
import { buildHeadTags } from "./lib/head";
import { findTranslationsByPath, getSeoMeta } from "./lib/links";
import { resolveLang, resolvePrefix } from "./lib/resolve";
import { loadSettings } from "./lib/settings";

/**
 * Runs as "append" so that apps/web/src/middleware.ts has already set
 * locals.db before this middleware executes.
 *
 * Request side: rewrite /{lang}/... to the plugin's /ml/... renderer
 * (non-default languages) or strip the default-language prefix.
 * Response side: inject canonical / hreflang / OG / <html lang> / switcher
 * script into text/html pages — no core file is modified.
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  const settings = await loadSettings(db);

  const prefixHit = resolvePrefix(ctx.url.pathname, settings);
  if (prefixHit && !ctx.url.pathname.startsWith("/ml/")) {
    const rest = "/" + ctx.url.pathname.split("/").slice(2).join("/");
    ctx.cookies.set("ml_pref", prefixHit, { path: "/", maxAge: 31536000, sameSite: "lax" });
    if (prefixHit !== settings.defaultLang) {
      return ctx.rewrite(`/ml/${prefixHit}${rest === "/" ? "" : rest}${ctx.url.search}`);
    }
    return ctx.rewrite(`${rest === "/" ? "/" : rest}${ctx.url.search}`);
  }

  const lang = resolveLang(ctx.request, settings) ?? settings.defaultLang;
  locals.ml = { lang, settings };

  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/ml/") || ctx.url.pathname.startsWith("/api/")) return res;
  // 未配置任何语言 = 插件处于惰性状态：不读响应体、不查翻译表，
  // 避免每个 HTML 页面都付出 clone+多次 DB 查询的代价。
  if (settings.languages.length === 0) return res;

  const html = await res.clone().text();
  let tags = "";
  try {
    const group = await findTranslationsByPath(db, ctx.url.pathname);
    const siteUrl = db ? (await getSiteInfo(db)).url.replace(/\/+$/, "") : "";
    const seo = group ? await getSeoMeta(db, group.baseId) : { title: "", description: "" };
    tags = buildHeadTags({
      settings,
      group,
      path: ctx.url.pathname.replace(/\/+$/, "") || "/",
      lang,
      siteUrl,
      seoTitle: seo.title,
      seoDescription: seo.description,
    });
  } catch {
    /* head enrichment is best-effort; never break the page */
  }

  const switcher = `<script src="/ml-asset/switcher.js" defer></script>`;
  const htmlOut = html
    .replace(/<html([^>]*?)\slang="[^"]*"/i, `<html$1 lang="${lang}"`)
    // Keep the closing head tag — downstream middlewares (e.g. ads-manager)
    // look for it to inject their own scripts.
    .replace("</head>", `    ${tags}\n    ${switcher}\n</head>`);

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(htmlOut, { status: res.status, statusText: res.statusText, headers });
};