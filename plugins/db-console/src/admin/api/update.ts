import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { sqlAll, sqlRun } from "@astropress/core";
import { errMsg, json, sameOrigin } from "../../lib/http";
import { quoteIdent } from "../../lib/sql-literal";
import { isValidName } from "../../lib/sql-util";

/**
 * POST /admin-ext/api/db-console/update
 * { table, rowid, column, value, confirm }
 *
 * 单元格行内编辑。安全策略：
 *  - 必须登录；Origin 同源（CSRF）
 *  - 表名/列名必须是合法标识符，且列在 PRAGMA table_info 中真实存在
 *  - sqlite_% 内部表禁止修改
 *  - confirm 必须为 true（前端在确认对话框后发送）
 *  - 值仅接受 string / number / null（BLOB 不支持行内编辑）
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }

  const table = body?.table;
  const column = body?.column;
  if (!isValidName(table)) return json({ error: "非法的表名" }, 400);
  if (table.startsWith("sqlite_")) return json({ error: "内部表不允许修改" }, 400);
  if (table.startsWith("_cf_")) return json({ error: "Cloudflare D1 内部对象不允许修改" }, 400);
  if (!isValidName(column)) return json({ error: "非法的列名" }, 400);

  const rowid = Number(body?.rowid);
  if (!Number.isSafeInteger(rowid)) return json({ error: "rowid 必须是整数" }, 400);

  const value = body?.value;
  if (value !== null && typeof value !== "string" && typeof value !== "number") {
    return json({ error: "值仅支持文本 / 数字 / NULL" }, 400);
  }
  if (typeof value === "string" && value.length > 20000) {
    return json({ error: "文本过长（上限 20000 字符）" }, 400);
  }
  if (body?.confirm !== true) return json({ error: "写操作必须先确认" }, 403);

  try {
    // 列必须真实存在于表结构中
    const infoRows = await sqlAll(db, sql`PRAGMA table_info(${sql.raw(quoteIdent(table))})`);
    const cols = infoRows.map((r: any) => String(r.name));
    if (!cols.includes(column)) return json({ error: "列不存在" }, 400);

    const t = sql.raw(quoteIdent(table));
    const c = sql.raw(quoteIdent(column));
    const meta = await sqlRun(
      db,
      sql`UPDATE ${t} SET ${c} = ${value} WHERE rowid = ${rowid}`
    );
    if (meta.changes === 0) return json({ error: "未找到该行（可能已被删除）" }, 404);
    return json({ ok: true, changes: meta.changes });
  } catch (e) {
    return json({ error: errMsg(e) }, 400);
  }
};
