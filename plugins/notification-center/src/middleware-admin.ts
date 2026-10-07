import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { createNotification, ensureTable, unreadCount } from "./lib/store";

const BELL_INJECT = `
<script>
(function() {
  if (document.getElementById('ap-nc-bell')) return;
  var bar = document.querySelector('.wp-admin-bar') || document.querySelector('header');
  if (!bar) return;
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // 通知链接只允许站内相对路径或同域 http(s)，拒绝 javascript: 等伪协议
  function safeLink(s) {
    var v = String(s == null ? '' : s).replace(/[\s]+/g, '');
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if ((v[0] === '/' || v[0] === '?' || v[0] === '#') && v.slice(0, 2) !== '//') return v;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
    return null;
  }
  var bell = document.createElement('div');
  bell.id = 'ap-nc-bell';
  bell.style.cssText = 'position:relative;cursor:pointer;padding:6px 10px;font-size:16px;user-select:none';
  bell.innerHTML = '&#128276;<span id="ap-nc-badge" style="display:none;position:absolute;top:0;right:0;background:#d63638;color:#fff;font-size:9px;min-width:16px;height:16px;line-height:16px;text-align:center;border-radius:8px;padding:0 4px"></span>';
  bell.title = '\u901a\u77e5\u4e2d\u5fc3';
  bell.addEventListener('click', function() {
    var dd = document.getElementById('ap-nc-dropdown');
    if (dd) { dd.remove(); return; }
    dd = document.createElement('div');
    dd.id = 'ap-nc-dropdown';
    dd.style.cssText = 'position:absolute;top:100%;right:10px;width:320px;max-height:400px;overflow-y:auto;background:#fff;border:1px solid #dcdcde;box-shadow:0 2px 8px rgba(0,0,0,.15);border-radius:4px;z-index:99999;font-size:12px';
    dd.innerHTML = '<div style="padding:8px 12px;border-bottom:1px solid #f0f0f1;font-weight:600;display:flex;justify-content:space-between;align-items:center">\u901a\u77e5 <a href="/admin-ext/notification-center" style="font-size:11px;color:#2271b1;text-decoration:none;font-weight:400">\u5168\u90e8\u67e5\u770b</a></div><div id="ap-nc-list" style="padding:4px 0"><div style="padding:12px;text-align:center;color:#646970">\u52a0\u8f7d\u4e2d...</div></div>';
    bell.appendChild(dd);
    fetch('/admin-ext/api/notifications/list?page=1&perPage=10')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var list = document.getElementById('ap-nc-list');
        if (!list || !d.items || !d.items.length) { if(list) list.innerHTML = '<div style="padding:12px;text-align:center;color:#646970">\u6682\u65e0\u901a\u77e5</div>'; return; }
        list.innerHTML = d.items.map(function(n) {
          var dot = n.is_read ? '' : '<span style="display:inline-block;width:6px;height:6px;background:#2271b1;border-radius:50%;margin-right:6px"></span>';
          var href = safeLink(n.link);
          var link = href ? '<a href="' + esc(href) + '" style="color:#2271b1;text-decoration:none">' + esc(n.title) + '</a>' : '<strong>' + esc(n.title) + '</strong>';
          return '<div style="padding:6px 12px;border-bottom:1px solid #f0f0f1">' + dot + link + '<div style="color:#646970;font-size:11px;margin-top:2px">' + esc((n.message || '').slice(0, 80)) + '</div><div style="color:#a7aaad;font-size:10px;margin-top:2px">' + esc(n.created_at || '') + '</div></div>';
        }).join('');
      })
      .catch(function() { var l = document.getElementById('ap-nc-list'); if(l) l.innerHTML = '<div style="padding:12px;text-align:center;color:#d63638">\u52a0\u8f7d\u5931\u8d25</div>'; });
  });
  bar.style.position = 'relative';
  // 插在用户区块之前，避免被 flex 布局挤到视口外
  var userBlock = bar.querySelector('.wp-admin-bar-user');
  if (userBlock) bar.insertBefore(bell, userBlock); else bar.appendChild(bell);
  // 轮询未读数
  function poll() {
    fetch('/admin-ext/api/notifications/unread-count').then(function(r){return r.json()}).then(function(d) {
      var badge = document.getElementById('ap-nc-badge');
      if (badge && d.count > 0) { badge.style.display = ''; badge.textContent = d.count > 99 ? '99+' : d.count; }
      else if (badge) { badge.style.display = 'none'; }
    }).catch(function(){});
  }
  poll();
  setInterval(poll, 30000);
})();
</script>`;

/**
 * 后台中间件：
 * 1. 事件监听——新评论/表单提交时自动创建通知
 * 2. 铃铛注入——所有后台页面注入通知铃铛
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;
  const method = ctx.request.method;
  const locals = ctx.locals as any;
  const db = locals.db;

  const isAdmin = pathname.startsWith("/admin");
  const isApi = pathname.startsWith("/api/");

  // 事件监听：评论/表单提交
  if (db && isApi && (method === "POST")) {
    try {
      if (!(await isPluginDisabled(db, "notification-center"))) {
        await ensureTable(db);
        if (pathname.includes("/ap-comments") || pathname.includes("/api/comments")) {
          // 异步创建通知（不阻塞响应）
          createNotification(db, {
            type: "comment",
            title: "\u65b0\u8bc4\u8bba",
            message: "\u6709\u65b0\u7684\u8bc4\u8bba\u5f85\u5ba1\u6838",
            link: "/admin/posts",
          }).catch(() => {});
        }
        if (pathname.includes("/api/forms/submit")) {
          createNotification(db, {
            type: "form",
            title: "\u65b0\u8868\u5355\u63d0\u4ea4",
            message: "\u6709\u7528\u6237\u63d0\u4ea4\u4e86\u65b0\u7684\u8868\u5355",
            link: "/admin/forms",
          }).catch(() => {});
        }
      }
    } catch { /* 静默 */ }
  }

  const res = await next();

  // 铃铛注入
  if (!isAdmin) return res;
  if (!pathname.startsWith("/admin")) return res;
  if (db) {
    try {
      if (await isPluginDisabled(db, "notification-center")) return res;
    } catch { /* fail-open */ }
  }

  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  try {
    const html = await res.clone().text();
    if (!html.includes("</body>")) return res;
    const injected = html.replace("</body>", `${BELL_INJECT}\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
