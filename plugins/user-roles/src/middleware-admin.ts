import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { hasCapability, getRequiredCapability, ROLE_LABEL } from "./lib/capabilities";
import { getUserRole } from "./lib/get-role";
import type { Role } from "./lib/capabilities";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/user-roles']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/user-roles";
    a.textContent = "\\u7528\\u6237\\u89d2\\u8272";
    var active = location.pathname.indexOf("/admin-ext/user-roles") === 0;
    if (active) a.className = "is-active";
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      nav.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

/** 403 拒绝页面 */
function forbiddenPage(role: Role, requiredCap: string): Response {
  const roleName = ROLE_LABEL[role] || role;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>403 - \\u6743\\u9650\\u4e0d\\u8db3</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f1;color:#1d2327}
.box{background:#fff;padding:40px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:480px;text-align:center}
h1{font-size:48px;margin:0 0 10px;color:#d63638}h2{font-size:18px;margin:0 0 16px;color:#1d2327}
p{font-size:14px;color:#646970;line-height:1.6;margin:0 0 20px}
a{color:#2271b1;text-decoration:none;font-size:14px}</style></head>
<body><div class="box"><h1>403</h1><h2>\\u6743\\u9650\\u4e0d\\u8db3</h2>
<p>\\u60a8\\u7684\\u89d2\\u8272\\u662f\\u300c${roleName}\\u300d\\uff0c\\u6ca1\\u6709\\u8bbf\\u95ee\\u6b64\\u9875\\u9762\\u6240\\u9700\\u7684\\u300c${requiredCap}\\u300d\\u80fd\\u529b\\u3002<br/>\\u8bf7\\u8054\\u7cfb\\u7ba1\\u7406\\u5458\\u5347\\u7ea7\\u60a8\\u7684\\u89d2\\u8272\\u3002</p>
<a href="/admin/dashboard">\\u2190 \\u8fd4\\u56de\\u4eea\\u8868\\u76d8</a></div></body></html>`;
  return new Response(html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * 后台中间件：
 * 1. 权限检查——按角色能力矩阵拦截无权限的后台页面与 API
 * 2. 侧边栏——注入「用户角色」菜单入口
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;
  const locals = ctx.locals as any;
  const db = locals.db;
  const user = locals.user;

  // 仅拦截后台请求
  const isAdmin = pathname.startsWith("/admin") || pathname.startsWith("/admin-ext");
  const isApi = pathname.startsWith("/api/");

  if (!isAdmin && !isApi) return next();

  // 未登录 → 放行（由 auth 中间件处理登录重定向）
  if (!user) return next();

  // 插件禁用检查
  if (db) {
    try {
      if (await isPluginDisabled(db, "user-roles")) return next();
    } catch { /* fail-open */ }
  }

  // 获取所需能力
  const requiredCap = getRequiredCapability(pathname);

  // 获取用户角色
  let role: Role = "subscriber";
  try {
    if (db) {
      role = await getUserRole(db, user.id);
    }
  } catch {
    /* 读取失败默认 subscriber */
  }

  // 权限检查
  if (!hasCapability(role, requiredCap)) {
    // API 返回 JSON
    if (isApi) {
      return new Response(
        JSON.stringify({ error: `权限不足：您的角色「${ROLE_LABEL[role]}」没有「${requiredCap}」能力` }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    // 后台页面返回 HTML
    return forbiddenPage(role, requiredCap);
  }

  // 放行 → 注入侧边栏
  const res = await next();

  if (!isAdmin) return res;
  if (!pathname.startsWith("/admin")) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  try {
    const html = await res.clone().text();
    if (!html.includes("</body>")) return res;
    const injected = html.replace("</body>", `${SIDEBAR_LINK}\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
