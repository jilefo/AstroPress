import type { APIRoute } from "astro";
import { wpPosts } from "@astropress/core/schema";
import { eq, sql } from "drizzle-orm";

/**
 * 1x1 追踪像素：GET /api/ap-related/track?post=123
 * 递增 wp_postmeta._ap_view_count
 */

let ensured: Promise<void> | null = null;
/**
 * 一次性维护（每 isolate）：
 * 1) 把同一文章多行计数合并到保留行；2) 删除历史重复行；
 * 3) 建部分唯一索引，保证之后每篇文章最多一行。
 */
function ensureViewCount(db: any): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      try {
        await db.run(sql`
          UPDATE wp_postmeta AS keep
          SET meta_value = (
            SELECT MAX(CAST(dup.meta_value AS INTEGER))
            FROM wp_postmeta AS dup
            WHERE dup.post_id = keep.post_id AND dup.meta_key = '_ap_view_count'
          )
          WHERE keep.meta_key = '_ap_view_count'
            AND keep.meta_id IN (
              SELECT MIN(meta_id) FROM wp_postmeta
              WHERE meta_key = '_ap_view_count' GROUP BY post_id
            )
        `);
        await db.run(sql`
          DELETE FROM wp_postmeta
          WHERE meta_key = '_ap_view_count'
            AND meta_id NOT IN (
              SELECT MIN(meta_id) FROM wp_postmeta
              WHERE meta_key = '_ap_view_count' GROUP BY post_id
            )
        `);
        await db.run(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS ap_view_count_uniq
            ON wp_postmeta (post_id, meta_key)
            WHERE meta_key = '_ap_view_count'
        `);
      } catch {
        // 维护失败允许后续重试（只影响计数精度，不影响像素返回）
        ensured = null;
      }
    })();
  }
  return ensured;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const postId = parseInt(url.searchParams.get("post") || "", 10);
  if (!Number.isFinite(postId) || postId <= 0) return pixel();

  const db = (locals as any).db;
  if (!db) return pixel();

  try {
    await ensureViewCount(db);
    // 先确认文章真实存在，避免伪造 postId 刷出孤儿 postmeta 行
    const [post] = await db
      .select({ id: wpPosts.id })
      .from(wpPosts)
      .where(eq(wpPosts.id, postId))
      .limit(1);
    if (!post) return pixel();

    // 原子 upsert：部分唯一索引兜底，每次访问只产生一行、一次写
    await db.run(sql`
      INSERT INTO wp_postmeta (post_id, meta_key, meta_value)
      VALUES (${postId}, '_ap_view_count', '1')
      ON CONFLICT (post_id, meta_key) WHERE meta_key = '_ap_view_count'
      DO UPDATE SET meta_value = CAST(wp_postmeta.meta_value AS INTEGER) + 1
    `);
  } catch {
    // ignore
  }
  return pixel();
};

function pixel(): Response {
  const b64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
