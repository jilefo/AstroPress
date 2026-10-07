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
    a.textContent = "\u5a92\u4f53\u6587\u4ef6\u5939";
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
    const injected = html.replace("</body>", `${SIDEBAR_LINK}\n</body>`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(injected, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
