import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";

/**
 * Dashboard 中间件：在 /admin/dashboard 或 /admin 页面注入 widget 渲染脚本。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;
  const isDashboard = pathname === "/admin" || pathname === "/admin/" || pathname === "/admin/dashboard";
  if (!isDashboard) return next();

  const locals = ctx.locals as any;
  const db = locals.db;
  if (db) {
    try {
      if (await isPluginDisabled(db, "dashboard-widgets")) return next();
    } catch { /* fail-open */ }
  }

  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  try {
    const html = await res.clone().text();
    if (!html.includes("</body>")) return res;

    const widgetScript = `
<script>
(function() {
  if (document.getElementById('ap-dw-root')) return;
  var container = document.querySelector('.wp-dashboard-stats');
  if (!container) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var root = document.createElement('div');
  root.id = 'ap-dw-root';
  root.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:20px';
  container.parentNode.insertBefore(root, container.nextSibling);

  function card(title, body) {
    return '<div class="postbox" style="margin:0"><div class="postbox-header"><h2 class="postbox-title" style="font-size:13px">' + title + '</h2></div><div class="postbox-inside" style="padding:12px 16px;font-size:13px">' + body + '</div></div>';
  }

  fetch('/admin-ext/api/dashboard-widgets/stats')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok) return;
      var s = d.stats;
      var html = '';

      // 1. 内容概览
      html += card('\\u5185\\u5bb9\\u6982\\u89c8',
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">' +
        '<div><strong style="font-size:20px;color:#2271b1">' + s.posts + '</strong><br><span style="font-size:11px;color:#646970">\\u6587\\u7ae0</span></div>' +
        '<div><strong style="font-size:20px;color:#2271b1">' + s.pages + '</strong><br><span style="font-size:11px;color:#646970">\\u9875\\u9762</span></div>' +
        '<div><strong style="font-size:20px;color:#2271b1">' + s.comments + '</strong><br><span style="font-size:11px;color:#646970">\\u8bc4\\u8bba</span></div>' +
        '<div><strong style="font-size:20px;color:#2271b1">' + s.media + '</strong><br><span style="font-size:11px;color:#646970">\\u5a92\\u4f53</span></div>' +
        '<div><strong style="font-size:20px;color:#2271b1">' + s.users + '</strong><br><span style="font-size:11px;color:#646970">\\u7528\\u6237</span></div>' +
        '<div><strong style="font-size:20px;color:#2271b1">' + s.forms + '</strong><br><span style="font-size:11px;color:#646970">\\u8868\\u5355</span></div>' +
        '</div>');

      // 2. 最近文章
      var rp = d.recentPosts || [];
      if (rp.length) {
        var items = rp.map(function(p) {
          var badge = p.status === 'publish' ? '<span style="color:#00a32a;font-size:10px">\\u5df2\\u53d1\\u5e03</span>' : '<span style="color:#dba617;font-size:10px">' + p.status + '</span>';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0f0f1"><a href="/admin/posts/' + p.id + '" style="color:#2271b1;text-decoration:none;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">' + esc(p.title || '(\u65e0\u6807\u9898)') + '</a>' + badge + '</div>';
        }).join('');
        html += card('\\u6700\\u8fd1\\u6587\\u7ae0', items);
      }

      // 3. 草稿箱
      var dr = d.drafts || [];
      if (dr.length) {
        var items = dr.map(function(p) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0f0f1"><a href="/admin/posts/' + p.id + '" style="color:#2271b1;text-decoration:none;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">' + esc(p.title || '(\u65e0\u6807\u9898)') + '</a><a href="/admin/posts/' + p.id + '" style="font-size:11px;color:#00a32a">\u7ee7\u7eed\u7f16\u8f91</a></div>';
        }).join('');
        html += card('\\u8349\\u7a3f\\u7bb1 (' + dr.length + ')', items);
      } else {
        html += card('\\u8349\\u7a3f\\u7bb1', '<p style="margin:0;color:#646970;font-size:12px">\\u6ca1\\u6709\\u5f85\\u53d1\\u5e03\\u7684\\u8349\\u7a3f</p>');
      }

      // 4. 系统健康
      html += card('\\u7cfb\\u7edf\\u5065\\u5eb7',
        '<div style="font-size:12px;line-height:2">' +
        '<div>\\u6570\\u636e\\u5e93\\u5927\\u5c0f\\uff1a<strong>' + s.dbSize + '</strong></div>' +
        '<div>\\u63d2\\u4ef6\\u5df2\\u542f\\u7528\\uff1a<strong>' + s.plugins + '</strong></div>' +
        '</div>');

      // 5. 快捷操作
      html += card('\\u5feb\\u6377\\u64cd\\u4f5c',
        '<div style="display:flex;flex-direction:column;gap:6px">' +
        '<a href="/admin/posts/new" class="button" style="justify-content:center;font-size:12px">\\u2795 \\u65b0\\u5efa\\u6587\\u7ae0</a>' +
        '<a href="/admin/pages/new" class="button" style="justify-content:center;font-size:12px">\\u2795 \\u65b0\\u5efa\\u9875\\u9762</a>' +
        '<a href="/admin/medias" class="button" style="justify-content:center;font-size:12px">\\u{1f4f7} \\u5a92\\u4f53\\u5e93</a>' +
        '</div>');

      root.innerHTML = html;
    })
    .catch(function() {});
})();
</script>`;

    const injected = html.replace("</body>", `${widgetScript}\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
