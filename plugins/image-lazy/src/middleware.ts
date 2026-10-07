import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings, type ImageLazySettings } from "./lib/settings";

// 引号感知：属性值内的 '>' 不再截断标签（如 alt="a > b"）
const IMG_RE = /<img\b(?:"[^"]*"|'[^']*'|[^>])*>/gi;
const IFRAME_RE = /<iframe\b(?:"[^"]*"|'[^']*'|[^>])*>/gi;
// <script> 块整体保护：JS 字符串里的 '<img>' 模板不能被改写
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

/** 读取标签上某属性的值（支持双引号 / 单引号 / 无引号），不存在返回 null */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

/** 已有 loading 属性（含 loading=lazy/eager/auto） */
function hasLoadingAttr(tag: string): boolean {
  return /\sloading\s*=/i.test(tag);
}

/** 已有 decoding 属性 */
function hasDecodingAttr(tag: string): boolean {
  return /\sdecoding\s*=/i.test(tag);
}

/** class 含 no-lazy 则跳过 */
function hasNoLazyClass(tag: string): boolean {
  const cls = getAttr(tag, "class");
  return cls !== null && cls.includes("no-lazy");
}

/**
 * 在标签末尾的 '>'（自闭合标签为 '/>' 中的 '/'）之前插入属性串，保持原有格式。
 * 例：<img src="a.jpg">   -> <img src="a.jpg" loading="lazy" ...>
 *     <img src="a.jpg"/>  -> <img src="a.jpg" loading="lazy" .../>
 */
function appendAttrs(tag: string, attrs: string): string {
  if (tag.slice(-2) === "/>") return tag.slice(0, -2) + attrs + "/>";
  return tag.slice(0, -1) + attrs + ">";
}

/** 对一段非 script 的 HTML 片段执行改写；state.imgSeen 跨片段保持文档顺序 */
function transformSegment(html: string, settings: ImageLazySettings, state: { imgSeen: number }): string {
  if (settings.lazyImages) {
    html = html.replace(IMG_RE, (tag) => {
      // 作者显式标记 no-lazy：完全不动
      if (hasNoLazyClass(tag)) return tag;

      // 已有 loading 属性（如主题/其他插件已输出）：仅补缺失的 decoding="async"
      if (hasLoadingAttr(tag)) {
        if (!hasDecodingAttr(tag)) return appendAttrs(tag, ' decoding="async"');
        return tag;
      }

      // 无 loading：前 skipFirst 张 img 保持原样（保护首屏 LCP），其余补两个属性
      const order = state.imgSeen++;
      if (order < settings.skipFirst) return tag;
      return appendAttrs(tag, ' loading="lazy" decoding="async"');
    });
  }

  if (settings.lazyIframes) {
    html = html.replace(IFRAME_RE, (tag) => {
      if (hasLoadingAttr(tag) || hasNoLazyClass(tag)) return tag;
      return appendAttrs(tag, ' loading="lazy"');
    });
  }

  return html;
}

/**
 * 纯函数：改写 HTML 中的 <img>/<iframe> 开标签，补懒加载属性。
 * - 正则引号感知：属性值内的 '>' 不截断标签；
 * - <script> 块整体跳过，JS 字符串里的 '<img>' 模板不被误改；
 * - 重复执行幂等（已有属性不重复添加）。
 */
export function transform(html: string, settings: ImageLazySettings): string {
  if (!settings.lazyImages && !settings.lazyIframes) return html;

  const state = { imgSeen: 0 };
  const parts: string[] = [];
  let last = 0;
  html.replace(SCRIPT_RE, (script: string, offset: number) => {
    parts.push(transformSegment(html.slice(last, offset), settings, state), script);
    last = offset + script.length;
    return script;
  });
  parts.push(transformSegment(html.slice(last), settings, state));
  return parts.join("");
}

/**
 * 前台中间件：在所有公开 HTML 页面为图片/iframe 补懒加载属性
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  try {
    if (ctx.request.method !== "GET") return res;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) return res;
    const { pathname } = ctx.url;
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/admin-ext")
    ) {
      return res;
    }

    const locals = ctx.locals as any;
    const db = locals.db ?? null;
    if (!db) return res;
    if (await isPluginDisabled(db, "image-lazy")) return res;

    // 先查设置（15s 缓存，廉价）：未启用时直接跳过 res.clone().text()，
    // 避免每个公开页面请求都把整页 HTML 复制一份。
    let settings: ImageLazySettings;
    try {
      settings = await loadSettings(db);
    } catch {
      return res;
    }
    if (!settings.enabled) return res;
    if (!settings.lazyImages && !settings.lazyIframes) return res;

    const html = await res.clone().text();
    if (!html.includes("</body>")) return res;

    const out = transform(html, settings);
    if (out === html) return res;

    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(out, { status: res.status, statusText: res.statusText, headers });
  } catch {
    // fail-open：插件任何异常都放行原始响应
    return res;
  }
};
