#!/usr/bin/env python3
"""Create notification-center, media-folders, two-factor-auth plugins for L-round."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGINS = ROOT / "plugins"

def write(rel_path: str, content: str):
    p = PLUGINS / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print(f"  Created: {rel_path}")

# ============================================================
# Plugin 3: notification-center
# ============================================================
print("=== notification-center ===")

PKG_NC = """\
{
  "name": "@astropress/plugin-notification-center",
  "version": "0.1.0",
  "description": "站内通知中心：自动监听新评论/表单提交等事件，后台顶栏铃铛 + 通知管理页",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./integration.admin": "./src/integration.admin.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@astropress/core": "workspace:*",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "astro": "^4.0.0",
    "typescript": "^5.4.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
"""
write("notification-center/package.json", PKG_NC)

TSC = """\
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["@cloudflare/workers-types"] },
  "include": ["src/**/*.ts"]
}
"""
write("notification-center/tsconfig.json", TSC)

write("notification-center/src/index.ts", """\
import { definePlugin } from "@astropress/core";

/**
 * Notification Center — 站内通知中心
 *
 * 功能：
 *   - 自建表 ap_notifications，惰性建表
 *   - 监听新评论/表单提交自动创建通知
 *   - 后台顶栏注入通知铃铛（未读角标 + 下拉列表）
 *   - /admin-ext/notification-center 完整管理页
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "notification-center",
  version: "0.1.0",
  description: "站内通知中心：自动监听事件，后台铃铛 + 通知管理页。零核心修改。",
  register() {},
});
""")

write("notification-center/src/integration.admin.ts", """\
import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function notificationCenterIntegration(): AstroIntegration {
  return {
    name: "astropress-notification-center",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/notification-center", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/read", entrypoint: p("admin", "api", "read.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/read-all", entrypoint: p("admin", "api", "read-all.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/delete", entrypoint: p("admin", "api", "delete.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/unread-count", entrypoint: p("admin", "api", "unread-count.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
""")

write("notification-center/src/lib/store.ts", """\
import { sql } from "drizzle-orm";

let ensured = false;

/** 惰性建表 */
export async function ensureTable(db: any): Promise<void> {
  if (ensured) return;
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS ap_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER NOT NULL DEFAULT 0
    )`);
    ensured = true;
  } catch { /* 已存在或无权限 */ }
}

/** 创建通知 */
export async function createNotification(db: any, data: {
  type: string; title: string; message: string; link?: string; userId?: number;
}): Promise<void> {
  await ensureTable(db);
  try {
    await db.run(sql`INSERT INTO ap_notifications (type, title, message, link, user_id)
      VALUES (${data.type}, ${data.title}, ${data.message}, ${data.link ?? ""}, ${data.userId ?? 0})`);
    // 裁剪：>500 条时删除最旧的已读通知
    await db.run(sql`DELETE FROM ap_notifications WHERE is_read = 1 AND id NOT IN
      (SELECT id FROM ap_notifications ORDER BY id DESC LIMIT 400)`);
  } catch { /* 写入失败静默 */ }
}

/** 查询通知列表 */
export async function listNotifications(db: any, opts: {
  page: number; perPage: number; filter?: string;
}): Promise<{ items: any[]; total: number }> {
  await ensureTable(db);
  const offset = (opts.page - 1) * opts.perPage;
  let whereClause = "";
  if (opts.filter === "unread") whereClause = "WHERE is_read = 0";
  else if (opts.filter === "read") whereClause = "WHERE is_read = 1";

  const [countRow] = await db.run(sql.raw(`SELECT COUNT(*) as c FROM ap_notifications ${whereClause}`)).catch(() => [{ c: 0 }]);
  const total = (countRow as any)?.c ?? 0;

  const items = await db.run(sql.raw(
    `SELECT * FROM ap_notifications ${whereClause} ORDER BY id DESC LIMIT ${opts.perPage} OFFSET ${offset}`
  )).catch(() => []);

  return { items: Array.isArray(items) ? items : [], total };
}

/** 标记已读 */
export async function markRead(db: any, ids: number[]): Promise<void> {
  await ensureTable(db);
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.run(sql.raw(`UPDATE ap_notifications SET is_read = 1 WHERE id IN (${placeholders})`)).catch(() => {});
}

/** 全部标记已读 */
export async function markAllRead(db: any): Promise<void> {
  await ensureTable(db);
  await db.run(sql`UPDATE ap_notifications SET is_read = 1 WHERE is_read = 0`).catch(() => {});
}

/** 删除通知 */
export async function deleteNotifications(db: any, ids: number[]): Promise<void> {
  await ensureTable(db);
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.run(sql.raw(`DELETE FROM ap_notifications WHERE id IN (${placeholders})`)).catch(() => {});
}

/** 未读数量 */
export async function unreadCount(db: any): Promise<number> {
  await ensureTable(db);
  const [row] = await db.run(sql`SELECT COUNT(*) as c FROM ap_notifications WHERE is_read = 0`).catch(() => [{ c: 0 }]);
  return (row as any)?.c ?? 0;
}
""")

write("notification-center/src/middleware-admin.ts", """\
import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { createNotification, ensureTable, unreadCount } from "./lib/store";

const BELL_INJECT = `
<script>
(function() {
  if (document.getElementById('ap-nc-bell')) return;
  var bar = document.querySelector('.wp-admin-bar') || document.querySelector('header');
  if (!bar) return;
  var bell = document.createElement('div');
  bell.id = 'ap-nc-bell';
  bell.style.cssText = 'position:relative;cursor:pointer;padding:6px 10px;font-size:16px;user-select:none';
  bell.innerHTML = '&#128276;<span id="ap-nc-badge" style="display:none;position:absolute;top:0;right:0;background:#d63638;color:#fff;font-size:9px;min-width:16px;height:16px;line-height:16px;text-align:center;border-radius:8px;padding:0 4px"></span>';
  bell.title = '\\u901a\\u77e5\\u4e2d\\u5fc3';
  bell.addEventListener('click', function() {
    var dd = document.getElementById('ap-nc-dropdown');
    if (dd) { dd.remove(); return; }
    dd = document.createElement('div');
    dd.id = 'ap-nc-dropdown';
    dd.style.cssText = 'position:absolute;top:100%;right:10px;width:320px;max-height:400px;overflow-y:auto;background:#fff;border:1px solid #dcdcde;box-shadow:0 2px 8px rgba(0,0,0,.15);border-radius:4px;z-index:99999;font-size:12px';
    dd.innerHTML = '<div style="padding:8px 12px;border-bottom:1px solid #f0f0f1;font-weight:600;display:flex;justify-content:space-between;align-items:center">\\u901a\\u77e5 <a href="/admin-ext/notification-center" style="font-size:11px;color:#2271b1;text-decoration:none;font-weight:400">\\u5168\\u90e8\\u67e5\\u770b</a></div><div id="ap-nc-list" style="padding:4px 0"><div style="padding:12px;text-align:center;color:#646970">\\u52a0\\u8f7d\\u4e2d...</div></div>';
    bell.appendChild(dd);
    fetch('/admin-ext/api/notifications/list?page=1&perPage=10')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var list = document.getElementById('ap-nc-list');
        if (!list || !d.items || !d.items.length) { if(list) list.innerHTML = '<div style=\\'padding:12px;text-align:center;color:#646970\\'>\\u6682\\u65e0\\u901a\\u77e5</div>'; return; }
        list.innerHTML = d.items.map(function(n) {
          var dot = n.is_read ? '' : '<span style=\\'display:inline-block;width:6px;height:6px;background:#2271b1;border-radius:50%;margin-right:6px\\'></span>';
          var link = n.link ? '<a href=\\'' + n.link + '\\' style=\\'color:#2271b1;text-decoration:none\\'>' + n.title + '</a>' : '<strong>' + n.title + '</strong>';
          return '<div style=\\'padding:6px 12px;border-bottom:1px solid #f0f0f1\\'>' + dot + link + '<div style=\\'color:#646970;font-size:11px;margin-top:2px\\'>' + (n.message || '').slice(0, 80) + '</div><div style=\\'color:#a7aaad;font-size:10px;margin-top:2px\\'>' + (n.created_at || '') + '</div></div>';
        }).join('');
      })
      .catch(function() { var l = document.getElementById('ap-nc-list'); if(l) l.innerHTML = '<div style=\\'padding:12px;text-align:center;color:#d63638\\'>\\u52a0\\u8f7d\\u5931\\u8d25</div>'; });
  });
  bar.style.position = 'relative';
  bar.appendChild(bell);
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
            title: "\\u65b0\\u8bc4\\u8bba",
            message: "\\u6709\\u65b0\\u7684\\u8bc4\\u8bba\\u5f85\\u5ba1\\u6838",
            link: "/admin/posts",
          }).catch(() => {});
        }
        if (pathname.includes("/api/forms/submit")) {
          createNotification(db, {
            type: "form",
            title: "\\u65b0\\u8868\\u5355\\u63d0\\u4ea4",
            message: "\\u6709\\u7528\\u6237\\u63d0\\u4ea4\\u4e86\\u65b0\\u7684\\u8868\\u5355",
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
    const injected = html.replace("</body>", `${BELL_INJECT}\\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
""")

# notification-center admin pages
write("notification-center/src/admin/index.astro", """\
---
import AdminLayout from "../../../../apps/admin/src/layouts/AdminLayout.astro";
---
<AdminLayout title="通知中心">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <h1 class="wp-heading-inline">通知中心</h1>
    <button id="nc-read-all" class="button" style="font-size:12px">全部标记已读</button>
  </div>
  <hr class="wp-header-end" />

  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="button nc-filter active" data-filter="all">全部</button>
    <button class="button nc-filter" data-filter="unread">未读</button>
    <button class="button nc-filter" data-filter="read">已读</button>
  </div>

  <div id="nc-list" class="postbox">
    <div class="postbox-inside" style="padding:0">
      <div style="padding:20px;text-align:center;color:#646970">加载中...</div>
    </div>
  </div>

  <script>
    let currentFilter = 'all';
    let currentPage = 1;

    function loadNotifications() {
      fetch(`/admin-ext/api/notifications/list?page=${currentPage}&perPage=20&filter=${currentFilter}`)
        .then(r => r.json())
        .then(d => {
          const el = document.getElementById('nc-list');
          if (!d.items || !d.items.length) {
            el.innerHTML = '<div class="postbox-inside" style="padding:20px;text-align:center;color:#646970">暂无通知</div>';
            return;
          }
          let html = '<table class="wp-list-table widefat fixed striped"><thead><tr><th style="width:5%"></th><th style="width:15%">类型</th><th style="width:25%">标题</th><th style="width:35%">内容</th><th style="width:12%">时间</th><th style="width:8%">操作</th></tr></thead><tbody>';
          d.items.forEach(n => {
            const dot = n.is_read ? '' : '<span style="display:inline-block;width:8px;height:8px;background:#2271b1;border-radius:50%"></span>';
            const typeLabel = {comment:'评论',form:'表单',info:'系统',error:'错误'}[n.type] || n.type;
            html += `<tr style="${n.is_read ? '' : 'font-weight:600'}">
              <td>${dot}</td>
              <td style="font-size:12px">${typeLabel}</td>
              <td>${n.link ? `<a href="${n.link}" style="color:#2271b1;text-decoration:none">${n.title}</a>` : n.title}</td>
              <td style="font-size:12px;color:#646970">${n.message || ''}</td>
              <td style="font-size:11px;color:#646970">${(n.created_at || '').slice(0, 16)}</td>
              <td><button class="button-link-delete nc-del" data-id="${n.id}" style="font-size:11px">删除</button></td>
            </tr>`;
          });
          html += '</tbody></table>';
          el.innerHTML = '<div class="postbox-inside" style="padding:0">' + html + '</div>';

          // 删除按钮
          el.querySelectorAll('.nc-del').forEach(btn => {
            btn.addEventListener('click', () => {
              const id = Number(btn.dataset.id);
              fetch('/admin-ext/api/notifications/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [id], confirm: true })
              }).then(() => loadNotifications());
            });
          });
        });
    }

    // 过滤器
    document.querySelectorAll('.nc-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nc-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        currentPage = 1;
        loadNotifications();
      });
    });

    // 全部标记已读
    document.getElementById('nc-read-all').addEventListener('click', () => {
      fetch('/admin-ext/api/notifications/read-all', { method: 'POST' })
        .then(() => loadNotifications());
    });

    loadNotifications();
  </script>
</AdminLayout>
""")

# API endpoints for notification-center
for api_name, api_code in [
    ("list.ts", """\
import type { APIRoute } from "astro";
import { listNotifications } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ url, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  const page = Number(url.searchParams.get("page") || 1);
  const perPage = Math.min(Number(url.searchParams.get("perPage") || 20), 50);
  const filter = url.searchParams.get("filter") || undefined;
  try {
    const result = await listNotifications(db, { page, perPage, filter });
    return json({ ...result, ok: true });
  } catch (err: any) {
    return json({ error: String(err?.message ?? err).slice(0, 200) }, 500);
  }
};
"""),
    ("read.ts", """\
import type { APIRoute } from "astro";
import { markRead } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { ids?: number[] };
    await markRead(db, body.ids || []);
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("read-all.ts", """\
import type { APIRoute } from "astro";
import { markAllRead } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    await markAllRead(db);
    return json({ ok: true });
  } catch (err: any) { return json({ error: String(err?.message ?? err).slice(0, 200) }, 500); }
};
"""),
    ("delete.ts", """\
import type { APIRoute } from "astro";
import { deleteNotifications } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { ids?: number[]; confirm?: boolean };
    if (!body.confirm) return json({ error: "confirm required" }, 400);
    await deleteNotifications(db, body.ids || []);
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("unread-count.ts", """\
import type { APIRoute } from "astro";
import { unreadCount } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ count: 0 });
  try {
    const count = await unreadCount(db);
    return json({ count });
  } catch { return json({ count: 0 }); }
};
"""),
]:
    write(f"notification-center/src/admin/api/{api_name}", api_code)


# ============================================================
# Plugin 4: media-folders
# ============================================================
print("\\n=== media-folders ===")

write("media-folders/package.json", """\
{
  "name": "@astropress/plugin-media-folders",
  "version": "0.1.0",
  "description": "媒体库文件夹管理：创建/重命名/删除文件夹，批量移动媒体文件",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./integration.admin": "./src/integration.admin.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@astropress/core": "workspace:*",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "astro": "^4.0.0",
    "typescript": "^5.4.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
""")
write("media-folders/tsconfig.json", TSC)

write("media-folders/src/index.ts", """\
import { definePlugin } from "@astropress/core";

/**
 * Media Folders — 媒体库文件夹管理
 *
 * 功能：
 *   - 自建表 ap_media_folders（id, name, parent_id, created_at）
 *   - 使用 wp_postmeta 存储媒体附件的文件夹关联（_media_folder_id）
 *   - 后台管理页：文件夹树 + 创建/重命名/删除
 *   - 媒体库页面注入文件夹侧边栏 + 批量移动
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "media-folders",
  version: "0.1.0",
  description: "媒体库文件夹管理：创建/重命名/删除文件夹，批量移动媒体文件。零核心修改。",
  register() {},
});
""")

write("media-folders/src/integration.admin.ts", """\
import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function mediaFoldersIntegration(): AstroIntegration {
  return {
    name: "astropress-media-folders",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/media-folders", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/create", entrypoint: p("admin", "api", "create.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/rename", entrypoint: p("admin", "api", "rename.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/delete", entrypoint: p("admin", "api", "delete.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/move", entrypoint: p("admin", "api", "move.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
""")

write("media-folders/src/lib/store.ts", """\
import { sql } from "drizzle-orm";

let ensured = false;

export async function ensureTable(db: any): Promise<void> {
  if (ensured) return;
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS ap_media_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      parent_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    ensured = true;
  } catch { /* 已存在 */ }
}

export async function listFolders(db: any): Promise<any[]> {
  await ensureTable(db);
  try {
    return await db.run(sql`SELECT * FROM ap_media_folders ORDER BY parent_id, name`);
  } catch { return []; }
}

export async function createFolder(db: any, name: string, parentId: number | null): Promise<number> {
  await ensureTable(db);
  const result = await db.run(sql`INSERT INTO ap_media_folders (name, parent_id) VALUES (${name}, ${parentId})`);
  return (result as any)?.lastInsertRowid ? Number((result as any).lastInsertRowid) : 0;
}

export async function renameFolder(db: any, id: number, name: string): Promise<void> {
  await ensureTable(db);
  await db.run(sql`UPDATE ap_media_folders SET name = ${name} WHERE id = ${id}`);
}

export async function deleteFolder(db: any, id: number): Promise<void> {
  await ensureTable(db);
  // 将文件夹内的媒体移至未分类
  await db.run(sql`UPDATE wp_postmeta SET meta_value = '' WHERE meta_key = '_media_folder_id' AND meta_value = ${String(id)}`);
  // 子文件夹移至顶级
  await db.run(sql`UPDATE ap_media_folders SET parent_id = NULL WHERE parent_id = ${id}`);
  await db.run(sql`DELETE FROM ap_media_folders WHERE id = ${id}`);
}

export async function moveMedia(db: any, mediaIds: number[], folderId: number | null): Promise<void> {
  await ensureTable(db);
  for (const mid of mediaIds) {
    const val = folderId !== null ? String(folderId) : "";
    // 检查是否已有 _media_folder_id meta
    const existing = await db.run(sql`SELECT umeta_id FROM wp_postmeta WHERE post_id = ${mid} AND meta_key = '_media_folder_id'`);
    if (Array.isArray(existing) && existing.length > 0) {
      await db.run(sql`UPDATE wp_postmeta SET meta_value = ${val} WHERE post_id = ${mid} AND meta_key = '_media_folder_id'`);
    } else {
      await db.run(sql`INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (${mid}, '_media_folder_id', ${val})`);
    }
  }
}
""")

write("media-folders/src/middleware-admin.ts", """\
import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/media-folders']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/media-folders";
    a.textContent = "\\u5a92\\u4f53\\u6587\\u4ef6\\u5939";
    var active = location.pathname.indexOf("/admin-ext/media-folders") === 0;
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

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!pathname.startsWith("/admin")) return next();

  const locals = ctx.locals as any;
  const db = locals.db;
  if (db) {
    try {
      if (await isPluginDisabled(db, "media-folders")) return next();
    } catch { /* fail-open */ }
  }

  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  try {
    const html = await res.clone().text();
    if (!html.includes("</body>")) return res;
    const injected = html.replace("</body>", `${SIDEBAR_LINK}\\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
""")

write("media-folders/src/admin/index.astro", """\
---
import AdminLayout from "../../../../apps/admin/src/layouts/AdminLayout.astro";
---
<AdminLayout title="媒体文件夹">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <h1 class="wp-heading-inline">媒体文件夹管理</h1>
  </div>
  <hr class="wp-header-end" />

  <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;align-items:start">
    <div class="postbox">
      <div class="postbox-header"><h2 class="postbox-title">新建文件夹</h2></div>
      <div class="postbox-inside">
        <input id="mf-name" type="text" class="wp-input" placeholder="文件夹名称" style="width:100%;margin-bottom:8px" />
        <button id="mf-create" class="button" style="width:100%;justify-content:center">创建文件夹</button>
      </div>
    </div>

    <div class="postbox">
      <div class="postbox-header"><h2 class="postbox-title">文件夹列表</h2></div>
      <div class="postbox-inside" id="mf-list" style="padding:0">
        <div style="padding:20px;text-align:center;color:#646970">加载中...</div>
      </div>
    </div>
  </div>

  <script>
    function loadFolders() {
      fetch('/admin-ext/api/media-folders/list')
        .then(r => r.json())
        .then(d => {
          const el = document.getElementById('mf-list');
          if (!d.folders || !d.folders.length) {
            el.innerHTML = '<div style="padding:20px;text-align:center;color:#646970">暂无文件夹</div>';
            return;
          }
          let html = '<table class="wp-list-table widefat fixed striped"><thead><tr><th>ID</th><th>名称</th><th>创建时间</th><th>操作</th></tr></thead><tbody>';
          d.folders.forEach(f => {
            html += `<tr>
              <td>${f.id}</td>
              <td><strong>${f.name}</strong></td>
              <td style="font-size:11px;color:#646970">${(f.created_at || '').slice(0, 16)}</td>
              <td>
                <button class="button mf-rename" data-id="${f.id}" data-name="${f.name}" style="font-size:11px">重命名</button>
                <button class="button-link-delete mf-del" data-id="${f.id}" style="font-size:11px">删除</button>
              </td>
            </tr>`;
          });
          html += '</tbody></table>';
          el.innerHTML = html;

          el.querySelectorAll('.mf-rename').forEach(btn => {
            btn.addEventListener('click', () => {
              const newName = prompt('新名称：', btn.dataset.name);
              if (!newName) return;
              fetch('/admin-ext/api/media-folders/rename', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: Number(btn.dataset.id), name: newName })
              }).then(() => loadFolders());
            });
          });
          el.querySelectorAll('.mf-del').forEach(btn => {
            btn.addEventListener('click', () => {
              if (!confirm('删除此文件夹？其中的媒体将移至未分类。')) return;
              fetch('/admin-ext/api/media-folders/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: Number(btn.dataset.id), confirm: true })
              }).then(() => loadFolders());
            });
          });
        });
    }

    document.getElementById('mf-create').addEventListener('click', () => {
      const name = document.getElementById('mf-name').value.trim();
      if (!name) return;
      fetch('/admin-ext/api/media-folders/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }).then(() => { document.getElementById('mf-name').value = ''; loadFolders(); });
    });

    loadFolders();
  </script>
</AdminLayout>
""")

# media-folders API endpoints
for api_name, api_code in [
    ("list.ts", """\
import type { APIRoute } from "astro";
import { listFolders } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const folders = await listFolders(db);
    return json({ ok: true, folders });
  } catch (err: any) { return json({ error: String(err?.message ?? err).slice(0, 200) }, 500); }
};
"""),
    ("create.ts", """\
import type { APIRoute } from "astro";
import { createFolder } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { name?: string; parentId?: number };
    if (!body.name?.trim()) return json({ error: "name required" }, 400);
    const id = await createFolder(db, body.name.trim().slice(0, 100), body.parentId ?? null);
    return json({ ok: true, id });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("rename.ts", """\
import type { APIRoute } from "astro";
import { renameFolder } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { id?: number; name?: string };
    if (!body.id || !body.name?.trim()) return json({ error: "id and name required" }, 400);
    await renameFolder(db, body.id, body.name.trim().slice(0, 100));
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("delete.ts", """\
import type { APIRoute } from "astro";
import { deleteFolder } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { id?: number; confirm?: boolean };
    if (!body.confirm) return json({ error: "confirm required" }, 400);
    if (!body.id) return json({ error: "id required" }, 400);
    await deleteFolder(db, body.id);
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("move.ts", """\
import type { APIRoute } from "astro";
import { moveMedia } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { mediaIds?: number[]; folderId?: number | null };
    if (!body.mediaIds?.length) return json({ error: "mediaIds required" }, 400);
    await moveMedia(db, body.mediaIds.slice(0, 100), body.folderId ?? null);
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
]:
    write(f"media-folders/src/admin/api/{api_name}", api_code)


# ============================================================
# Plugin 5: two-factor-auth
# ============================================================
print("\\n=== two-factor-auth ===")

write("two-factor-auth/package.json", """\
{
  "name": "@astropress/plugin-two-factor-auth",
  "version": "0.1.0",
  "description": "两步验证 (TOTP)：基于时间的一次性密码，增强账户安全",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./integration.admin": "./src/integration.admin.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@astropress/core": "workspace:*",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "astro": "^4.0.0",
    "typescript": "^5.4.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
""")
write("two-factor-auth/tsconfig.json", TSC)

write("two-factor-auth/src/index.ts", """\
import { definePlugin } from "@astropress/core";

/**
 * Two-Factor Auth — 两步验证 (TOTP)
 *
 * 功能：
 *   - 基于 TOTP (RFC 6238) 的两步验证
 *   - 使用 Node.js 内置 crypto（HMAC-SHA1），零外部依赖
 *   - wp_usermeta 存储密钥（_2fa_secret / _2fa_enabled）
 *   - 后台页 /admin-ext/two-factor-auth：启用/禁用/验证
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "two-factor-auth",
  version: "0.1.0",
  description: "两步验证 (TOTP)：基于时间的一次性密码，增强账户安全。零核心修改。",
  register() {},
});
""")

write("two-factor-auth/src/integration.admin.ts", """\
import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function twoFactorAuthIntegration(): AstroIntegration {
  return {
    name: "astropress-two-factor-auth",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/two-factor-auth", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/setup", entrypoint: p("admin", "api", "setup.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/verify", entrypoint: p("admin", "api", "verify.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/disable", entrypoint: p("admin", "api", "disable.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/status", entrypoint: p("admin", "api", "status.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
""")

write("two-factor-auth/src/lib/totp.ts", """\
import { createHmac, randomBytes } from "node:crypto";

/** Base32 字符集 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 生成随机 TOTP 密钥（20 字节 → 32 字符 base32） */
export function generateSecret(): string {
  const bytes = randomBytes(20);
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += BASE32[bytes[i] % 32];
  }
  return result;
}

/** Base32 解码 */
function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[^A-Z2-7]/gi, "").toUpperCase();
  let bits = "";
  for (const ch of cleaned) {
    const val = BASE32.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return Buffer.from(bytes);
}

/** 生成 TOTP 码（6 位数字） */
export function generateTOTP(secret: string, time?: number): string {
  const counter = Math.floor((time ?? Date.now() / 1000) / 30);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, "0");
}

/** 验证 TOTP 码（允许前后 1 个时间窗口的偏移） */
export function verifyTOTP(secret: string, token: string): boolean {
  const now = Date.now() / 1000;
  for (const offset of [-30, 0, 30]) {
    if (generateTOTP(secret, now + offset) === token) return true;
  }
  return false;
}

/** 生成 otpauth:// URI（用于 QR 码） */
export function getOTPAuthURI(secret: string, account: string, issuer = "AstroPress"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
""")

write("two-factor-auth/src/lib/store.ts", """\
import { wpUsermeta } from "@astropress/core/schema";
import { eq, and } from "drizzle-orm";

/** 获取用户 2FA 密钥 */
export async function get2FASecret(db: any, userId: number): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: wpUsermeta.metaValue })
      .from(wpUsermeta)
      .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_secret")))
      .limit(1);
    return row?.value || null;
  } catch { return null; }
}

/** 获取用户 2FA 是否启用 */
export async function is2FAEnabled(db: any, userId: number): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: wpUsermeta.metaValue })
      .from(wpUsermeta)
      .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_enabled")))
      .limit(1);
    return row?.value === "1";
  } catch { return false; }
}

/** 设置 2FA 密钥并启用 */
export async function enable2FA(db: any, userId: number, secret: string): Promise<void> {
  // 保存密钥
  const existing = await db
    .select({ umetaId: wpUsermeta.umetaId })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_secret")))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wpUsermeta).set({ metaValue: secret }).where(eq(wpUsermeta.umetaId, existing[0].umetaId));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: "_2fa_secret", metaValue: secret });
  }
  // 启用标记
  const enExisting = await db
    .select({ umetaId: wpUsermeta.umetaId })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_enabled")))
    .limit(1);
  if (enExisting.length > 0) {
    await db.update(wpUsermeta).set({ metaValue: "1" }).where(eq(wpUsermeta.umetaId, enExisting[0].umetaId));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: "_2fa_enabled", metaValue: "1" });
  }
}

/** 禁用 2FA */
export async function disable2FA(db: any, userId: number): Promise<void> {
  await db.delete(wpUsermeta).where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_secret")));
  await db.delete(wpUsermeta).where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_enabled")));
}
""")

write("two-factor-auth/src/middleware-admin.ts", """\
import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/two-factor-auth']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/two-factor-auth";
    a.textContent = "\\u4e24\\u6b65\\u9a8c\\u8bc1";
    var active = location.pathname.indexOf("/admin-ext/two-factor-auth") === 0;
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

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!pathname.startsWith("/admin")) return next();

  const locals = ctx.locals as any;
  const db = locals.db;
  if (db) {
    try {
      if (await isPluginDisabled(db, "two-factor-auth")) return next();
    } catch { /* fail-open */ }
  }

  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  try {
    const html = await res.clone().text();
    if (!html.includes("</body>")) return res;
    const injected = html.replace("</body>", `${SIDEBAR_LINK}\\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
""")

write("two-factor-auth/src/admin/index.astro", """\
---
import AdminLayout from "../../../../apps/admin/src/layouts/AdminLayout.astro";
---
<AdminLayout title="两步验证">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <h1 class="wp-heading-inline">两步验证 (2FA)</h1>
  </div>
  <hr class="wp-header-end" />

  <div id="2fa-status" class="postbox" style="max-width:600px">
    <div class="postbox-inside" style="padding:16px 20px">
      <p style="margin:0 0 12px;font-size:13px">加载中...</p>
    </div>
  </div>

  <div id="2fa-setup" class="postbox" style="max-width:600px;margin-top:16px;display:none">
    <div class="postbox-header"><h2 class="postbox-title">设置两步验证</h2></div>
    <div class="postbox-inside">
      <p style="font-size:13px;margin:0 0 12px">
        1. 点击下方按钮生成密钥<br/>
        2. 使用身份验证器应用（Google Authenticator / Microsoft Authenticator）扫描二维码<br/>
        3. 输入验证器显示的 6 位数字确认
      </p>
      <button id="2fa-generate" class="button">生成密钥</button>
      <div id="2fa-qr" style="margin-top:16px;display:none">
        <div id="2fa-qr-img" style="margin-bottom:12px"></div>
        <p style="font-size:12px;color:#646970;margin:0 0 8px">
          密钥：<code id="2fa-secret" style="font-size:13px;background:#f0f0f1;padding:2px 6px;border-radius:2px"></code>
        </p>
        <input id="2fa-code" type="text" class="wp-input" placeholder="输入 6 位验证码" maxlength="6" style="width:200px;margin-bottom:8px" />
        <button id="2fa-confirm" class="button-primary">确认启用</button>
      </div>
    </div>
  </div>

  <script>
    function loadStatus() {
      fetch('/admin-ext/api/2fa/status')
        .then(r => r.json())
        .then(d => {
          const el = document.getElementById('2fa-status');
          if (d.enabled) {
            el.innerHTML = '<div class="postbox-inside" style="padding:16px 20px"><p style="margin:0 0 12px;font-size:13px;color:#00a32a"><strong>&#10003; 两步验证已启用</strong></p><button id="2fa-disable" class="button-link-delete">禁用两步验证</button></div>';
            document.getElementById('2fa-disable').addEventListener('click', () => {
              if (!confirm('确定禁用两步验证？')) return;
              fetch('/admin-ext/api/2fa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
                .then(r => r.json())
                .then(d => { if (d.ok) loadStatus(); });
            });
          } else {
            el.innerHTML = '<div class="postbox-inside" style="padding:16px 20px"><p style="margin:0;font-size:13px;color:#dba617"><strong>&#9888; 两步验证未启用</strong></p><p style="font-size:12px;color:#646970;margin:8px 0 0">建议启用两步验证以增强账户安全</p></div>';
            document.getElementById('2fa-setup').style.display = '';
          }
        });
    }

    document.getElementById('2fa-generate').addEventListener('click', () => {
      fetch('/admin-ext/api/2fa/setup', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (!d.ok) return;
          document.getElementById('2fa-secret').textContent = d.secret;
          document.getElementById('2fa-qr-img').innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(d.uri) + '" alt="QR Code" />';
          document.getElementById('2fa-qr').style.display = '';
          window._2faSecret = d.secret;
        });
    });

    document.getElementById('2fa-confirm').addEventListener('click', () => {
      const code = document.getElementById('2fa-code').value.trim();
      if (!code || code.length !== 6) { alert('请输入 6 位验证码'); return; }
      fetch('/admin-ext/api/2fa/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: window._2faSecret, code })
      }).then(r => r.json()).then(d => {
        if (d.ok) { alert('两步验证已启用！'); loadStatus(); }
        else { alert('验证码错误，请重试'); }
      });
    });

    loadStatus();
  </script>
</AdminLayout>
""")

# 2FA API endpoints
for api_name, api_code in [
    ("setup.ts", """\
import type { APIRoute } from "astro";
import { generateSecret, getOTPAuthURI } from "../../lib/totp";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const secret = generateSecret();
  const uri = getOTPAuthURI(secret, user.userLogin || user.email || "user");
  return json({ ok: true, secret, uri });
};
"""),
    ("verify.ts", """\
import type { APIRoute } from "astro";
import { verifyTOTP } from "../../lib/totp";
import { enable2FA } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { secret?: string; code?: string };
    if (!body.secret || !body.code) return json({ error: "secret and code required" }, 400);
    if (!verifyTOTP(body.secret, body.code.trim())) return json({ ok: false, error: "Invalid code" });
    await enable2FA(db, user.id, body.secret);
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("disable.ts", """\
import type { APIRoute } from "astro";
import { disable2FA } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json() as { confirm?: boolean };
    if (!body.confirm) return json({ error: "confirm required" }, 400);
    await disable2FA(db, user.id);
    return json({ ok: true });
  } catch { return json({ error: "Invalid request" }, 400); }
};
"""),
    ("status.ts", """\
import type { APIRoute } from "astro";
import { is2FAEnabled } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ enabled: false });
  try {
    const enabled = await is2FAEnabled(db, user.id);
    return json({ ok: true, enabled });
  } catch { return json({ enabled: false }); }
};
"""),
]:
    write(f"two-factor-auth/src/admin/api/{api_name}", api_code)

print("\\n=== All 3 plugins created successfully! ===")
