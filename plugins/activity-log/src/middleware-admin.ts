import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { record } from "./lib/store";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/activity-log']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/activity-log";
    a.textContent = "操作审计";
    var active = location.pathname.indexOf("/admin-ext/activity-log") === 0;
    if (active) a.className = "is-active";
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> 操作审计'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 取访客 IP（与全局限流同一约定）：
 * cf-connecting-ip（Cloudflare 边缘权威写入）→ x-forwarded-for 首段 → "unknown"。
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 45);
}

/**
 * 后台中间件：
 * 1. 审计——记录 /api/*、/admin-ext/api/* 的写操作（响应 <400 与 >=400 都记；
 *    绝不读请求体；仅记 pathname 不记 query，避免 URL 中的 token 落库；
 *    全部 try/catch 静默，绝不影响正常响应）
 * 2. 侧边栏——注入「操作审计」菜单入口（挂在设置子菜单下）
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;
  const method = ctx.request.method;
  const isApiWrite =
    (pathname.startsWith("/api/") || pathname.startsWith("/admin-ext/api/")) && WRITE_METHODS.has(method);

  const res = await next();

  if (isApiWrite) {
    try {
      const locals = ctx.locals as any;
      const db = locals.db ?? null;
      if (db && !(await isPluginDisabled(db, "activity-log"))) {
        const user = locals.user as any;
        await record(db, {
          user: String(user?.userLogin ?? user?.username ?? "匿名").slice(0, 100),
          method,
          path: pathname.slice(0, 500),
          status: res.status,
          ip: getClientIp(ctx.request),
          ua: (ctx.request.headers.get("user-agent") ?? "").slice(0, 200),
        });
      }
    } catch {
      /* 审计失败永不影响正常响应 */
    }
  }

  if (!pathname.startsWith("/admin")) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;

  const injected = html.replace("</body>", `${SIDEBAR_LINK}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
