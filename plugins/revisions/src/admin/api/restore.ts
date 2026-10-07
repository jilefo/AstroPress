import type { APIRoute } from "astro";
import { sql, eq } from "drizzle-orm";
import { sqlOne } from "@astropress/core";
import { wpPosts } from "@astropress/core/schema";
import { ensureSchema, insertRevision } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /admin-ext/api/revisions/restore — 恢复指定版本
 * body: { id: number, confirm: true }
 * 服务端读快照后直接经 locals.db 更新 wp_posts 的 title/content/excerpt（不走 HTTP 自请求）。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  if (body?.confirm !== true) return json({ error: "请勾选确认后再执行此操作" }, 400);

  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "版本 ID 格式不正确" }, 400);

  const db = (locals as any).db;
  try {
    await ensureSchema(db);
    const row = await sqlOne(db, sql`
      SELECT id, post_id, title, content, excerpt
      FROM ap_post_revisions
      WHERE id = ${id}
      LIMIT 1
    `);
    if (!row) return json({ error: "版本不存在" }, 404);

    const postId = Number(row.post_id);
    if (!Number.isInteger(postId) || postId <= 0) return json({ error: "快照数据异常" }, 500);

    // 恢复前先把“当前内容”存为一条新版本（对齐 WordPress），
    // 否则当前内容从未入版本表，覆盖后不可逆地丢失。
    const [current] = await db
      .select({
        title: wpPosts.postTitle,
        content: wpPosts.postContent,
        excerpt: wpPosts.postExcerpt,
      })
      .from(wpPosts)
      .where(eq(wpPosts.id, postId))
      .limit(1);
    if (current) {
      await insertRevision(
        db,
        postId,
        {
          title: String(current.title ?? ""),
          content: String(current.content ?? ""),
          excerpt: String(current.excerpt ?? ""),
          status: "pre-restore",
        },
        user.userLogin ?? "restore"
      );
    }

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    await db
      .update(wpPosts)
      .set({
        postTitle: String(row.title ?? ""),
        postContent: String(row.content ?? ""),
        postExcerpt: String(row.excerpt ?? ""),
        postModified: now,
        postModifiedGmt: now,
      })
      .where(eq(wpPosts.id, postId));

    return json({ ok: true, postId });
  } catch {
    return json({ error: "恢复失败" }, 500);
  }
};
