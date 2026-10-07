import type { MiddlewareHandler } from "astro";
import { isCloudflareRuntime } from "@astropress/core";
import { isPluginDisabled } from "@astropress/core/plugin-state";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/ai-chat']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/ai-chat";
    a.textContent = "AI 助手";
    var active = location.pathname.indexOf("/admin-ext/ai-chat") === 0;
    if (active) a.className = "is-active";
    // Prefer the Settings sub-menu; fall back to the top-level nav.
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> AI 助手'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

const FAB = `<a href="/admin-ext/ai-chat" id="ap-ai-chat-fab" title="AI 助手" style="
      position:fixed;bottom:24px;right:24px;z-index:9999;
      width:48px;height:48px;border-radius:50%;
      background:#0f6bdf;color:#fff;display:flex;align-items:center;justify-content:center;
      text-decoration:none;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.2);
      transition:transform .2s;
    " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
    </a>`;

/**
 * Injects the AI chat assistant into the admin:
 *  - a sidebar link under .wp-sidebar-nav (on every /admin page)
 *  - a floating action button (on every /admin page except the chat page itself)
 *  - the collapsible editor assistant panel script (only on /admin/posts/* editor pages,
 *    never on /admin-ext/* pages)
 * Runs as "post" middleware (after rendering) — no core file is modified.
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  // 平台屏蔽（CF 无 Playwright，路由已由插件管理器守卫 404）或插件被禁用时：
  // 不注入侧栏链接 / FAB / 编辑器面板脚本，避免出现指向 404 页面的入口
  const hidden = isCloudflareRuntime() || (await isPluginDisabled((ctx.locals as any).db, "ai-chat"));
  const res = await next();
  if (hidden) return res;
  if (!ctx.url.pathname.startsWith("/admin")) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;

  const isSelf = ctx.url.pathname.startsWith("/admin-ext/ai-chat");
  const snippet = isSelf ? SIDEBAR_LINK : SIDEBAR_LINK + FAB;

  let injected = html;
  if (ctx.url.pathname.startsWith("/admin/posts") && injected.includes("</head>")) {
    injected = injected.replace(
      "</head>",
      `<script src="/admin-ext/api/ai-chat/editor-panel.js" defer></script>\n</head>`
    );
  }
  injected = injected.replace("</body>", `${snippet}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
