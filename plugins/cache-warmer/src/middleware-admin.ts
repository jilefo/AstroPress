import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { ensureScheduler } from "./lib/warm";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/cache-warmer']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/cache-warmer";
    a.textContent = "缓存预热";
    var active = location.pathname.indexOf("/admin-ext/cache-warmer") === 0;
    if (active) a.className = "is-active";
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg> 缓存预热'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

/**
 * 后台侧边栏注入「缓存预热」菜单入口；
 * 顺带幂等恢复定时预热调度（插件模块随 SSR 加载后，首个后台请求即生效）。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (await isPluginDisabled(db, "cache-warmer")) return next();

  // 恢复/维持定时调度（15s 节流、幂等）；失败不阻塞请求
  if (db) void ensureScheduler(db).catch(() => {});

  const res = await next();
  if (!ctx.url.pathname.startsWith("/admin")) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;

  const injected = html.replace("</body>", `${SIDEBAR_LINK}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
