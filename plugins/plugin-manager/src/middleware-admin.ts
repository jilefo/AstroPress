import type { MiddlewareHandler } from "astro";
import { REGISTRY } from "./lib/registry";
import { loadStates } from "./lib/state";
import { isCloudflareRuntime } from "@astropress/core";

const SIDEBAR_LINK = `
<script>
(function () {
  function addLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/plugin-manager']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/plugin-manager";
    a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55"><path d="M14 7h6v6"/><path d="M4 7h6v6"/><rect width="6" height="6" x="4" y="4" rx="1"/><rect width="6" height="6" x="14" y="14" rx="1"/></svg> 插件管理'; // ap-audit-ok: 静态SVG+固定文案，无动态数据
    if (location.pathname.indexOf("/admin-ext/plugin-manager") === 0) a.className = "is-active";
    // 插件管理器作为顶级菜单（与 WordPress "插件" 一致），追加到导航末尾
    nav.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLink);
  else addLink();
})();
</script>`;

const CHEVRON = '<svg class="ap-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

/** 套件头部图标（20x20 线性，与核心菜单风格一致） */
const SUITE_ICONS: Record<string, string> = {
  "security-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  "perf-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  "editor-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  "ai-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
  "seo-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  "site-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  "sync-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
  "ops-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  "admin-suite": '<svg class="ap-ico" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
};

/**
 * 构建侧栏重组脚本：36+ 个插件各自把菜单链接扁平塞入 Settings 子菜单，
 * 这里按 9 大套件注册表把它们归并为可折叠分组（只搬运已启用成员的链接，
 * 被禁用成员的链接直接移除）。MutationObserver 兜底迟到的注入。
 */
function buildReorganizer(states: Record<string, boolean>, cloudflare: boolean): string {
  /** href → 成员所属套件 slug（仅收录启用且当前平台兼容的成员） */
  const hrefToGroup: Record<string, string> = {};
  /** 全部已知成员 href（含已禁用/平台不兼容），用于识别并移除残留链接 */
  const allKnownHrefs = new Set<string>();
  const groups: { slug: string; label: string }[] = [];

  for (const m of REGISTRY) {
    if (m.kind !== "suite") continue;
    groups.push({ slug: m.slug, label: m.label });
    const suiteOn = states[m.slug] !== false;
    for (const mem of m.members ?? []) {
      if (!mem.settingsUrl) continue;
      allKnownHrefs.add(mem.settingsUrl);
      if (cloudflare && mem.cfUnsupported) continue; // 平台不兼容：不分组，链接走移除
      if (suiteOn && states[mem.slug] !== false) hrefToGroup[mem.settingsUrl] = m.slug;
    }
  }

  const icons: Record<string, string> = {};
  for (const g of groups) icons[g.slug] = SUITE_ICONS[g.slug] ?? "";

  return `
<script>
(function () {
  var HREF_TO_GROUP = ${JSON.stringify(hrefToGroup)};
  var ALL_KNOWN = ${JSON.stringify(Array.from(allKnownHrefs))};
  var GROUPS = ${JSON.stringify(groups)};
  var ICONS = ${JSON.stringify(icons)};
  var CHEVRON = ${JSON.stringify(CHEVRON)};

  function relocate(a) {
    var href = a.getAttribute("href");
    if (!href || href.indexOf("/admin-ext/") !== 0) return;
    // 插件管理器自身入口（非套件成员）保留在原位
    if (href.indexOf("/admin-ext/plugin-manager") === 0) return;

    if (!HREF_TO_GROUP[href]) {
      // 已知成员但未出现在启用映射中 → 已被禁用，移除其残留菜单
      if (ALL_KNOWN.indexOf(href) !== -1) a.remove();
      return;
    }
    var mount = document.querySelector('.wp-nav-group-body[data-ap-body="' + HREF_TO_GROUP[href] + '"]');
    if (!mount || a.parentElement === mount) return;
    var active = location.pathname.indexOf(href) === 0;
    if (active) a.classList.add("is-active");
    mount.appendChild(a);
    var g = mount.parentElement;
    g.style.display = ""; // 兜底：晚于 finalize 到达的链接恢复组可见性
    if (active) g.classList.add("is-open"); // 仅当前功能所在组本次访问强制展开
  }

  function start() {
    var nav = document.querySelector(".wp-sidebar-nav");
    var host = document.getElementById("ap-ext-groups");
    if (!nav || !host || host.dataset.apReady) return;
    host.dataset.apReady = "1";

    // 1. 构建折叠组骨架。
    // 注意：post 中间件逆序包裹使本脚本在 HTML 中先于 36 个插件的注入脚本，
    // DOMContentLoaded 首次执行时插件链接尚未注入，必须靠扫描 + Observer +
    // load 后兜底三重机制，绝不能在首扫为空时隐藏组。
    GROUPS.forEach(function (g) {
      var wrap = document.createElement("div");
      wrap.className = "wp-nav-group";
      wrap.setAttribute("data-ap-group", g.slug);
      try { if (localStorage.getItem("ap_sb_" + g.slug) === "1") wrap.classList.add("is-open"); } catch (e) {}
      var head = document.createElement("button");
      head.type = "button";
      head.className = "wp-nav-group-head";
      head.innerHTML = (ICONS[g.slug] || "") + " " + g.label + " " + CHEVRON;
      var body = document.createElement("div");
      body.className = "wp-nav-group-body";
      body.setAttribute("data-ap-body", g.slug);
      wrap.appendChild(head);
      wrap.appendChild(body);
      host.appendChild(wrap);
    });

    // 2. 全量搬运（首扫可能为空，finalize 时再扫一次）
    function sweep() {
      nav.querySelectorAll('a[href^="/admin-ext/"]').forEach(relocate);
    }
    sweep();

    // 3. 监听注入：插件链接在 DOMContentLoaded/load 各阶段被塞进 nav 或 Settings 子菜单
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        mu.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.tagName === "A") relocate(node);
          else node.querySelectorAll && node.querySelectorAll('a[href^="/admin-ext/"]').forEach(relocate);
        });
      });
    });
    mo.observe(nav, { childList: true, subtree: true });

    // 4. 兜底：load 后再扫两轮（个别插件在 load/setTimeout 后注入），
    //    然后隐藏仍为空的组，并清除插件旧逻辑给 Settings 的误标激活
    function finalize() {
      sweep();
      setTimeout(function () {
        sweep();
        host.querySelectorAll(".wp-nav-group").forEach(function (g) {
          g.style.display = g.querySelector(".wp-nav-group-body a") ? "" : "none";
        });
        if (location.pathname.indexOf("/admin/settings") !== 0) {
          var sl = nav.querySelector('a[href="/admin/settings"]');
          if (sl) sl.classList.remove("is-active");
          var sub = nav.querySelector(".wp-sidebar-submenu");
          if (sub) sub.classList.remove("is-open");
        }
      }, 600);
    }
    if (document.readyState === "complete") finalize();
    else window.addEventListener("load", finalize);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
</script>`;
}

/**
 * 后台 post 中间件：
 *  1. 注入"插件管理"顶级菜单；
 *  2. 把 36+ 个插件扁平注入的菜单链接按套件重组为可折叠分组，
 *     并移除被禁用插件的残留链接。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();
  const path = ctx.url.pathname;
  if (!path.startsWith("/admin")) return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  let html = await res.clone().text();
  if (!html.includes("</body>")) return res;

  let inject = SIDEBAR_LINK;
  const db = (ctx.locals as any).db;
  if (db) {
    try {
      const states = await loadStates(db);
      inject += buildReorganizer(states, isCloudflareRuntime());
    } catch {
      /* 状态读取失败时保留原始扁平菜单，不影响后台可用 */
    }
  }

  const injected = html.replace("</body>", `${inject}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
