import type { MiddlewareHandler } from "astro";
import { and, eq } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { isConfigured, loadSettings, type GitalkSettings } from "./lib/settings";

/** 序列化为可安全内嵌到 <script type="application/json"> 的 JSON（转义 < 防 </script> 逃逸） */
function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderInjection(settings: GitalkSettings, slug: string): string {
  const adminList = settings.admin
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (settings.owner && !adminList.includes(settings.owner)) adminList.unshift(settings.owner);

  // clientSecret 绝不下发到页面：任何访客都可提取冒充 OAuth App。
  // 安全鉴权由 settings.proxy 指向同源/自托管代理，由代理持有 secret 换 token。
  const config = {
    clientID: settings.clientID,
    repo: settings.repo,
    owner: settings.owner,
    admin: adminList,
    idMode: settings.idMode,
    slug,
    language: settings.language,
    perPage: settings.perPage,
    distractionFreeMode: settings.distractionFreeMode,
    proxy: settings.proxy,
    titleFromPage: settings.titleFromPage,
  };

  return `
<div id="ap-gitalk" class="ap-gitalk">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/gitalk@1/dist/gitalk.css" />
<div id="gitalk-container"></div>
<script type="application/json" id="ap-gitalk-config">${safeJson(config)}</script>
<script src="https://cdn.jsdelivr.net/npm/gitalk@1/dist/gitalk.min.js"></script>
<script>
(function () {
  function boot() {
    var el = document.getElementById("gitalk-container");
    var cfgEl = document.getElementById("ap-gitalk-config");
    if (!el || !cfgEl || typeof Gitalk === "undefined") return;
    if (el.dataset.apGitalkBound === "1") return;
    el.dataset.apGitalkBound = "1";
    var cfg;
    try { cfg = JSON.parse(cfgEl.textContent || "{}"); } catch (e) { return; }
    // Issue ID 需 ≤50 字符：pathname 策略超长时退化为 slug，仍超长则哈希
    var id = cfg.idMode === "slug" ? cfg.slug : location.pathname;
    if (id.length > 50) id = cfg.slug || id;
    if (id.length > 50) {
      var h = 0x811c9dc5;
      for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
      id = "ap-" + h.toString(16);
    }
    var opts = {
      clientID: cfg.clientID,
      repo: cfg.repo,
      owner: cfg.owner,
      admin: cfg.admin,
      id: id,
      language: cfg.language || "zh-CN",
      perPage: cfg.perPage || 10,
      distractionFreeMode: !!cfg.distractionFreeMode
    };
    if (cfg.proxy) opts.proxy = cfg.proxy;
    if (cfg.titleFromPage) opts.title = document.title;
    try { new Gitalk(opts).render("gitalk-container"); } catch (e) {}
  }
  if (typeof Gitalk === "undefined") {
    var timer = setInterval(function () {
      if (typeof Gitalk !== "undefined") { clearInterval(timer); boot(); }
    }, 100);
    setTimeout(function () { clearInterval(timer); }, 15000);
  } else {
    boot();
  }
})();
</script>
</div>`;
}

/**
 * 前台中间件（post 顺序）：
 *   - 单篇文章页（/blog/{slug}，固定链接 rewrite 后同路径）注入 Gitalk 评论容器
 *   - 未启用 / 未配置完整 / 非发布文章时不注入
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  if (ctx.request.method !== "GET") return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/api/") || ctx.url.pathname.startsWith("/admin")) return res;

  const m = ctx.url.pathname.match(/^\/blog\/([a-zA-Z0-9_-]+)\/?$/);
  if (!m) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;
  if (await isPluginDisabled(db, "gitalk-comment")) return res;

  // 设置带 15s 缓存：未启用/未配置时在克隆整页 HTML 之前返回，零额外开销
  let settings: GitalkSettings;
  try {
    settings = await loadSettings(db);
  } catch {
    return res;
  }
  if (!isConfigured(settings)) return res;

  const slug = m[1];
  const [post] = await db
    .select({ id: wpPosts.id, postStatus: wpPosts.postStatus, commentStatus: wpPosts.commentStatus })
    .from(wpPosts)
    .where(and(eq(wpPosts.postName, slug), eq(wpPosts.postType, "post")))
    .limit(1);
  if (!post || post.postStatus !== "publish") return res;
  if (post.commentStatus && post.commentStatus !== "open") return res;

  const html = await res.clone().text();
  if (!html.includes('class="post-content"')) return res;
  if (html.includes('id="ap-gitalk"')) return res; // 幂等

  const fragment = renderInjection(settings, slug);
  const newHtml = html.includes("</article>")
    ? html.replace("</article>", `${fragment}\n</article>`)
    : html.replace("</body>", `${fragment}\n</body>`);
  if (newHtml === html) return res;

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(newHtml, { status: res.status, statusText: res.statusText, headers });
};
