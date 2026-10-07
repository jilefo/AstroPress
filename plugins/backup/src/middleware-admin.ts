import type { MiddlewareHandler } from "astro";
import { isCloudflareRuntime } from "@astropress/core";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { ensureScheduler } from "./lib/scheduler";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/backup']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/backup";
    a.textContent = "备份";
    var active = location.pathname.indexOf("/admin-ext/backup") === 0;
    if (active) a.className = "is-active";
    // 优先挂到 Settings 子菜单，失败则回退到顶级导航
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg> 备份'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

/** 后台侧边栏注入「备份」菜单入口（Settings 子菜单）；顺带驱动自动备份调度器 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  // 平台屏蔽（CF 无本地文件系统）或插件被禁用时：不注入菜单入口、不驱动调度器
  const hidden = isCloudflareRuntime() || (await isPluginDisabled((ctx.locals as any).db, "backup"));
  // WP-Cron 风格：后台有访问即确保调度器已启动（CF Workers 下自动跳过）
  if (!hidden && ctx.url.pathname.startsWith("/admin")) {
    try {
      ensureScheduler((ctx.locals as any).db ?? null);
    } catch {
      /* 调度启动失败不影响请求 */
    }
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
