import type { MiddlewareHandler } from "astro";
import { and, eq } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { loadPermalinkSettings } from "@astropress/core/permalink";
import { loadSettings } from "./lib/settings";
import { fetchPopular, fetchRandom, fetchRelated } from "./lib/render";
import { renderBlock } from "./lib/renderer";

/**
 * 前台中间件：
 *   - 在单篇文章（post，/blog/{slug}）末尾注入相关/随机/热门区块
 *   - 追加 1x1 透明追踪像素记录浏览量
 *   - 不修改 <head> SEO
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/api/") || ctx.url.pathname.startsWith("/admin")) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;

  // 只处理单篇文章页：/blog/{slug}
  const m = ctx.url.pathname.match(/^\/blog\/([a-zA-Z0-9_-]+)\/?$/);
  if (!m) return res;

  // 先看插件是否启用（设置带缓存），禁用时在克隆整页 HTML 之前就返回，零额外开销
  const settings = await loadSettings(db);
  if (!settings.enabled) return res;

  const html = await res.clone().text();
  if (!html.includes('class="post-content"')) return res;

  const slug = m[1];
  const [postRow] = await db
    .select({ id: wpPosts.id })
    .from(wpPosts)
    .where(and(eq(wpPosts.postName, slug), eq(wpPosts.postType, "post"), eq(wpPosts.postStatus, "publish")))
    .limit(1);
  if (!postRow) return res;
  const postId = postRow.id;

  const [related, random, popular] = await Promise.all([
    fetchRelated(db, postId, settings.related),
    fetchRandom(db, postId, settings.random),
    fetchPopular(db, postId, settings.popular),
  ]);

  // 文章出站链接形态跟随 permalink 设置（启用 → /{slug}，否则 /blog/{slug}）
  const perm = await loadPermalinkSettings(db);
  const postBase = perm.enabled === false ? "/blog/" : "/";

  const block = renderBlock(settings, related, random, popular, postBase);
  const tracker = `<img src="/ap-related/track?post=${postId}" width="1" height="1" alt="" style="position:absolute;left:-9999px" loading="lazy" />`;
  const injection = `${block}\n${tracker}`;
  const newHtml = html.includes("</article>")
    ? html.replace("</article>", `${injection}\n</article>`)
    : html.replace("</body>", `${injection}\n</body>`);

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(newHtml, { status: res.status, statusText: res.statusText, headers });
};
