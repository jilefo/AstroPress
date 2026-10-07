import type { MiddlewareHandler } from "astro";
import { isCloudflareRuntime } from "@astropress/core";
import { isPluginDisabled } from "@astropress/core/plugin-state";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/git-sync']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/git-sync";
    a.textContent = "Git 同步";
    var active = location.pathname.indexOf("/admin-ext/git-sync") === 0;
    if (active) a.className = "is-active";
    // 优先挂到 Settings 子菜单，失败则回退到顶级导航
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg> Git 同步'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

/** 后台侧边栏注入「Git 同步」菜单入口（Settings 子菜单） */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  // 平台屏蔽（CF 无本地 Git CLI）或插件被禁用时：不注入菜单入口（路由已由插件管理器守卫 404）
  const hidden = isCloudflareRuntime() || (await isPluginDisabled((ctx.locals as any).db, "git-sync"));
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
