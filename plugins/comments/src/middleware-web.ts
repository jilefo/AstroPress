import type { MiddlewareHandler } from "astro";
import { and, eq } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { ensureSchema } from "./lib/schema";
import { loadSettings } from "./lib/settings";
import { fetchApprovedComments } from "./lib/comments";
import { renderCommentsBlock } from "./lib/render-web";

/**
 * 前台中间件：在 /blog/{slug} 文章页 </article> 前注入评论区块。
 * 仅改 body，不动 <head>；删除 content-length 头。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/api/") || ctx.url.pathname.startsWith("/admin")) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;

  const m = ctx.url.pathname.match(/^\/blog\/([a-zA-Z0-9_-]+)\/?$/);
  if (!m) return res;

  // 先看插件是否启用（设置带缓存），禁用时在克隆整页 HTML 之前就返回，零额外开销
  const settings = await loadSettings(db);
  if (!settings.enabled) return res;

  const html = await res.clone().text();
  if (!html.includes('class="post-content"')) return res;

  const slug = m[1];
  const [post] = await db
    .select({
      id: wpPosts.id,
      postStatus: wpPosts.postStatus,
      postType: wpPosts.postType,
      commentStatus: wpPosts.commentStatus,
    })
    .from(wpPosts)
    .where(and(eq(wpPosts.postName, slug), eq(wpPosts.postType, "post")))
    .limit(1);
  if (!post || post.postStatus !== "publish") return res;
  if (settings.closedTypes.includes(post.postType)) return res;
  if (post.commentStatus && post.commentStatus !== "open") return res;

  try {
    await ensureSchema(db);
  } catch {
    return res;
  }

  const comments = await fetchApprovedComments(db, post.id, settings.order);
  const block = renderCommentsBlock(comments, { postId: post.id, order: settings.order });

  const newHtml = html.includes("</article>")
    ? html.replace("</article>", `${block}\n</article>`)
    : html.replace("</body>", `${block}\n</body>`);

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(newHtml, { status: res.status, statusText: res.statusText, headers });
};
