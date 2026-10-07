import type { MiddlewareHandler } from "astro";
import { eq } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { ensureSchema, insertRevision, type RevisionSnapshot } from "./lib/schema";

/**
 * 注入到后台 HTML 页的静态脚本：
 *  1) 侧边栏「设置」子菜单注入「版本历史」入口
 *  2) 文章/页面/CPT 编辑页工具区注入「🕘 版本历史」链接（轮询定位 #save-status，最多 2 秒，失败静默）
 */
const INJECT = `
<script>
(function () {
  function addSidebarLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/revisions']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/revisions";
    a.textContent = "版本历史";
    var active = location.pathname.indexOf("/admin-ext/revisions") === 0;
    if (active) a.className = "is-active";
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg> 版本历史'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
      nav.appendChild(a);
    }
  }

  function editorPostId() {
    var segs = location.pathname.split("/");
    // /admin/posts/<id>、/admin/pages/<id>、/admin/cpt/<type>/<id>
    if (segs[1] !== "admin") return "";
    var id = "";
    if (segs.length === 4 && (segs[2] === "posts" || segs[2] === "pages")) id = segs[3];
    else if (segs.length === 5 && segs[2] === "cpt") id = segs[4];
    return /^[0-9]+$/.test(id) ? id : "";
  }

  function addEditorLink() {
    var id = editorPostId();
    if (!id) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var anchor = document.getElementById("save-status");
      if (!anchor && tries < 20) return;
      clearInterval(timer);
      if (!anchor || !anchor.parentNode) return; // 2 秒内未定位到工具区，静默放弃
      if (document.getElementById("ap-revisions-link")) return;
      var a = document.createElement("a");
      a.id = "ap-revisions-link";
      a.href = "/admin-ext/revisions?post=" + id;
      a.textContent = "🕘 版本历史";
      a.style.cssText = "display:inline-block;font-size:12px;margin-bottom:10px;color:#2271b1;text-decoration:none";
      anchor.parentNode.insertBefore(a, anchor.nextSibling);
    }, 100);
  }

  function boot() {
    addSidebarLink();
    addEditorLink();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
</script>`;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * 后台中间件（post）：
 *  - 拦截 POST/PUT/PATCH /api/posts/<数字id>：next() 前读当前文章，
 *    响应 <400 后把旧版本快照写入 ap_post_revisions（新建无 id 不快照；失败静默）
 *  - 后台 HTML 页注入侧边栏入口与编辑页「版本历史」链接
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (await isPluginDisabled(db, "revisions")) return next();

  const { pathname } = ctx.url;
  const method = ctx.request.method.toUpperCase();

  // /api/posts/<数字id> 写操作 → 快照旧版本
  const segs = pathname.split("/");
  const isPostWrite =
    segs.length === 4 &&
    segs[1] === "api" &&
    segs[2] === "posts" &&
    /^\d+$/.test(segs[3]) &&
    WRITE_METHODS.has(method);

  if (isPostWrite) {
    const postId = Number(segs[3]);

    let before: RevisionSnapshot | null = null;
    try {
      if (db) {
        const [row] = await db
          .select({
            title: wpPosts.postTitle,
            content: wpPosts.postContent,
            excerpt: wpPosts.postExcerpt,
            status: wpPosts.postStatus,
          })
          .from(wpPosts)
          .where(eq(wpPosts.id, postId))
          .limit(1);
        if (row) before = row;
      }
    } catch {
      before = null;
    }

    const res = await next();

    if (db && before && res.status < 400) {
      try {
        await ensureSchema(db);
        const user = locals.user;
        const editor = String(user?.displayName ?? user?.userLogin ?? "").slice(0, 100);
        await insertRevision(db, postId, before, editor);
      } catch {
        /* 快照失败静默，不影响主请求 */
      }
    }
    return res;
  }

  // 后台 HTML 页注入（非 /admin 路径直接放行）
  if (!pathname.startsWith("/admin")) return next();

  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;

  const injected = html.replace("</body>", `${INJECT}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
