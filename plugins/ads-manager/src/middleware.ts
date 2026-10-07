import type { MiddlewareHandler } from "astro";
import { ensureAdsInstalled } from "./install";
import { detectDevice, resolveCtxLang } from "./lib/lang";
import { renderAd, renderSlotPlaceholderMiss } from "./lib/render";
import { pickAd, slotByKey } from "./lib/select";
import { getAdsCache } from "./lib/store";

let installed = false;

// Key may arrive HTML-escaped (&quot;/&#39;) when the content pipeline escapes
// text blocks (e.g. front-page schema renderer) — accept raw and escaped quotes,
// single quotes, and the unquoted WordPress form.
const SHORTCODE = /\[ap-ad\s+key=(?:&quot;|&#39;|["'])??([\w-]+)(?:&quot;|&#39;|["'])?\s*\]/g;
const PLACEHOLDER = /<div[^>]*data-ap-ad="([\w-]+)"[^>]*>\s*<\/div>/g;

/**
 * Web-side ad rendering (order "append" so locals.db is set).
 * Replaces [ap-ad key="…"] shortcodes and <div data-ap-ad="…"></div>
 * placeholders with server-rendered ad HTML, then injects the tracking
 * loader. The <head> SEO output is never modified.
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (db && !installed) {
    try {
      await ensureAdsInstalled(db);
      installed = true; // only latch on success so a transient DB failure can retry
    } catch {
      /* activation is best-effort; retried on the next request */
    }
  }

  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/api/")) return res;

  // 设置/广告位缓存闸门在前（带缓存，廉价）：无广告位/无广告时直接返回，
  // 不为每个 HTML 页面付出 res.clone().text() 的整页复制开销。
  let slots: unknown[] = [];
  let units: unknown[] = [];
  if (db) {
    try {
      const cache = await getAdsCache(db);
      slots = cache.slots;
      units = cache.units;
    } catch {
      return res;
    }
    if (slots.length === 0 || units.length === 0) return res;
  } else {
    return res;
  }

  let html = await res.clone().text();
  // 只认真实的短代码/占位符标记；不能用 includes("ap-ad")——主题 CSS 里的
  // "ap-adapter" 注释会误匹配，导致无广告页面也白加载 loader.js。
  // /g 正则手测前必须复位 lastIndex。
  SHORTCODE.lastIndex = 0;
  PLACEHOLDER.lastIndex = 0;
  if (!SHORTCODE.test(html) && !PLACEHOLDER.test(html)) return res;

  try {
    const ctxInfo = {
      lang: await resolveCtxLang(ctx.request, db),
      device: detectDevice(ctx.request),
      path: ctx.url.pathname,
      consent: true,
    };

    const renderSlot = (key: string): string => {
      const slot = slotByKey(slots as any, key);
      if (!slot) return "";
      const ad = pickAd(units as any, key, ctxInfo);
      return ad ? renderAd(ad, key) : renderSlotPlaceholderMiss(key);
    };

    html = html.replace(SHORTCODE, (_, key: string) => renderSlot(key));
    html = html.replace(PLACEHOLDER, (_, key: string) => renderSlot(key));
    if (html.includes("</head>")) {
      html = html.replace("</head>", `<script src="/ap-ads/loader.js" defer></script>\n</head>`);
    }
  } catch {
    return res;
  }

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
};