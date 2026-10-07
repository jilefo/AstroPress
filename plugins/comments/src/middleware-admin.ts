import type { MiddlewareHandler } from "astro";

const SIDEBAR_LINK = `
<script>
(function () {
  function addBadge(link) {
    // 待审核数 >0 时追加红色小圆点（数字来自接口 JSON，只写 textContent）
    fetch("/admin-ext/api/comments/list?status=pending&page=1", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.counts) return;
        var n = parseInt(d.counts.pending, 10);
        if (!n || n <= 0 || link.querySelector(".ap-cmt-nav-badge")) return;
        var b = document.createElement("span");
        b.className = "ap-cmt-nav-badge";
        b.textContent = String(n > 99 ? "99+" : n);
        b.style.cssText = "margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#d63638;color:#fff;font-size:11px;line-height:18px;text-align:center;box-sizing:border-box;";
        link.appendChild(b);
      })
      .catch(function () {});
  }

  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/comments']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/comments";
    var active = location.pathname.indexOf("/admin-ext/comments") === 0;
    if (active) a.className = "is-active";
    a.style.cssText = "display:flex;align-items:center;gap:8px;";
    a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>评论</span>'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
    nav.appendChild(a);
    addBadge(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

/** 后台侧边栏注入顶级「评论」菜单（消息气泡图标 + 待审核红点） */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
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
