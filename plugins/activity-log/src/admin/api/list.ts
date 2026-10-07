import type { APIRoute } from "astro";
import { sql, type SQL } from "drizzle-orm";
import { sqlAll, sqlOne, likeNeedle } from "@astropress/core";
import { ensureSchema } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const PAGE_SIZE = 50;

/**
 * GET /admin-ext/api/activity-log/list?page=&user=&path=&status=
 * 分页（50/页，按 id 倒序）+ 过滤（用户精确、路径关键字包含、状态码精确）。
 * 过滤条件全部走 sql 模板参数绑定，无字符串拼接。
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;

  const rawPage = Math.trunc(Number(url.searchParams.get("page")) || 1);
  const fUser = (url.searchParams.get("user") ?? "").trim().slice(0, 100);
  const fPath = (url.searchParams.get("path") ?? "").trim().slice(0, 200);
  const fStatus = Math.trunc(Number(url.searchParams.get("status")) || 0);

  const conds: SQL[] = [];
  if (fUser) conds.push(sql`user = ${fUser}`);
  if (fPath) conds.push(sql`path LIKE ${"%" + likeNeedle(fPath) + "%"}`);
  if (fStatus >= 100 && fStatus <= 599) conds.push(sql`status = ${fStatus}`);
  const where = conds.length > 0 ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

  try {
    await ensureSchema(db);

    const totalRow = await sqlOne(db, sql`SELECT COUNT(*) AS c FROM ap_activity_log ${where}`);
    const total = Number(totalRow?.c ?? 0);

    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, rawPage), maxPage);

    const rows = await sqlAll(db, sql`
      SELECT id, ts, user, method, path, status, ip, ua
      FROM ap_activity_log
      ${where}
      ORDER BY id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `);

    return json({ rows, total, page, pageSize: PAGE_SIZE });
  } catch {
    return json({ error: "数据表初始化失败" }, 500);
  }
};
