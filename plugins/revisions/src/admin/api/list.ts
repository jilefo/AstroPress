import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { sqlAll } from "@astropress/core";
import { ensureSchema } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** GET /admin-ext/api/revisions/list?post=<id> — 某文版本列表（新→旧） */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;

  const postParam = url.searchParams.get("post") ?? "";
  if (!/^\d+$/.test(postParam)) return json({ error: "文章 ID 格式不正确" }, 400);
  const postId = Number(postParam);

  try {
    await ensureSchema(db);
    const items = await sqlAll(db, sql`
      SELECT id, post_id, title, saved_at, editor, LENGTH(content) AS content_len
      FROM ap_post_revisions
      WHERE post_id = ${postId}
      ORDER BY id DESC
      LIMIT 50
    `);
    return json({ items });
  } catch {
    return json({ error: "数据表初始化失败" }, 500);
  }
};
