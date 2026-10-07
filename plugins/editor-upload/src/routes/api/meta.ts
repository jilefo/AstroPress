import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function upsertMeta(db: any, postId: number, key: string, value: string) {
  const [existing] = await db
    .select({ id: wpPostmeta.metaId })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)))
    .limit(1);
  if (existing) {
    await db.update(wpPostmeta).set({ metaValue: value }).where(eq(wpPostmeta.metaId, existing.id));
  } else {
    await db.insert(wpPostmeta).values({ postId, metaKey: key, metaValue: value });
  }
}

/**
 * Aggregate media metadata save: title → wp_posts.post_title,
 * caption → wp_posts.post_excerpt, alt → wp_postmeta `_wp_attachment_image_alt`.
 * Composes the official per-post APIs into one call for the media modal.
 */
export const PUT: APIRoute = async ({ locals, request, params }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return json({ error: "无效的 id" }, 400);

  const [post] = await db
    .select({ id: wpPosts.id, type: wpPosts.postType })
    .from(wpPosts)
    .where(eq(wpPosts.id, id))
    .limit(1);
  if (!post) return json({ error: "内容不存在" }, 404);
  if (post.type !== "attachment") return json({ error: "该内容不是附件" }, 400);

  let body: { alt?: string; title?: string; caption?: string };
  try {
    body = (await request.json()) as { alt?: string; title?: string; caption?: string };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  if (typeof body.title === "string") {
    await db.update(wpPosts).set({ postTitle: body.title }).where(eq(wpPosts.id, id));
  }
  if (typeof body.caption === "string") {
    await db.update(wpPosts).set({ postExcerpt: body.caption }).where(eq(wpPosts.id, id));
  }
  if (typeof body.alt === "string") {
    await upsertMeta(db, id, "_wp_attachment_image_alt", body.alt);
  }
  return json({ ok: true });
};