import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { sqlAll } from "@astropress/core";
import { ensureSchema } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** GET /admin-ext/api/404/list — 404 记录（按命中次数、最近时间倒序，最多 200 条） */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;

  try {
    await ensureSchema(db);
    const items = await sqlAll(db, sql`
      SELECT path, referer, hits, first_seen, last_seen
      FROM ap_404_log
      ORDER BY hits DESC, last_seen DESC
      LIMIT 200
    `);
    return json({ items });
  } catch {
    return json({ error: "数据表初始化失败" }, 500);
  }
};
