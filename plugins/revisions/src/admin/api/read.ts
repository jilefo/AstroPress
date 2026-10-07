import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { sqlOne } from "@astropress/core";
import { ensureSchema } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** GET /admin-ext/api/revisions/read?id=<revisionId> — 读取单个版本完整快照 */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;

  const idParam = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(idParam)) return json({ error: "版本 ID 格式不正确" }, 400);
  const id = Number(idParam);

  try {
    await ensureSchema(db);
    const row = await sqlOne(db, sql`
      SELECT id, post_id, title, content, excerpt, saved_at, editor
      FROM ap_post_revisions
      WHERE id = ${id}
      LIMIT 1
    `);
    if (!row) return json({ error: "版本不存在" }, 404);
    return json({ item: row });
  } catch {
    return json({ error: "读取失败" }, 500);
  }
};
