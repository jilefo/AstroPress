import type { MiddlewareHandler } from "astro";
import { loadSettings } from "./lib/settings";

// 排除路径前缀：这些路径不注入浮动搜索按钮
const EXCLUDED = ["/admin", "/api", "/admin-ext", "/login", "/search"];

const BUTTON_HTML = `
<a href="/search" id="ap-search-fab" aria-label="搜索" style="position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;background:#fff;border:1px solid #c3c4c7;box-shadow:0 2px 8px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;z-index:9998;text-decoration:none;color:#1d2327;transition:box-shadow .2s ease" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.18)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'">
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
</a>`;

/**
 * 前台中间件：注入右下角浮动搜索按钮
 *
 * 仅处理 GET、非排除路径、content-type 含 text/html、响应体含 </body>
 * 设置 injectButton=false 或 db 不可用时直接放行
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();
  if (ctx.request.method !== "GET") return res;
  const path = ctx.url.pathname;
  if (EXCLUDED.some((p) => path === p || path.startsWith(p + "/"))) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;

  let settings;
  try {
    settings = await loadSettings(db);
  } catch {
    return res;
  }
  if (!settings.enabled || !settings.injectButton) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;

  const injected = html.replace("</body>", `${BUTTON_HTML}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
