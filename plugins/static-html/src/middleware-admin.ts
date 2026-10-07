import type { MiddlewareHandler } from "astro";
import { isCloudflareRuntime } from "@astropress/core";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { ensureScheduler } from "./lib/scheduler";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/static-html']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/static-html";
    a.textContent = "静态HTML";
    var active = location.pathname.indexOf("/admin-ext/static-html") === 0;
    if (active) a.className = "is-active";
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> 静态HTML'; // ap-audit-ok: 静态 SVG 图标与文案
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  // 平台屏蔽（CF 无本地文件系统）或插件被禁用时：不注入菜单入口、不驱动调度器
  const hidden = isCloudflareRuntime() || (await isPluginDisabled((ctx.locals as any).db, "static-html"));
  // WP-Cron 风格：站点有访问时驱动调度器检查（db 存在的 SSR 环境）
  const db = (ctx.locals as any).db;
  if (!hidden && db) {
    try {
      ensureScheduler(db, new URL(ctx.request.url).origin);
    } catch { /* 调度器异常不影响请求 */ }
  }

  const res = await next();
  if (hidden) return res;
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
