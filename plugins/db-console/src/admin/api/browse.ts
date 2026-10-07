import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { deriveColumns, sqlAll, sqlOne } from "@astropress/core";
import { errMsg, json } from "../../lib/http";
import { quoteIdent } from "../../lib/sql-literal";
import {
  PAGE_SIZE,
  isValidName,
  rowsToJson,
} from "../../lib/sql-util";

/**
 * GET /admin-ext/api/db-console/browse?name=&page=
 * 返回 {columns, rows, total, page}，每页 50 行。
 */
export const GET: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  const params = new URL(request.url).searchParams;
  const name = params.get("name") ?? "";
  if (!isValidName(name)) return json({ error: "非法的表名" }, 400);

  let page = Number.parseInt(params.get("page") ?? "0", 10);
  if (!Number.isFinite(page) || page < 0) page = 0;
  if (page > 1_000_000) page = 1_000_000;

  try {
    const ident = sql.raw(quoteIdent(name));
    const cnt = await sqlOne(db, sql`SELECT COUNT(*) AS c FROM ${ident}`);
    const total = Number(cnt?.c ?? 0);

    // 附带 rowid 供行编辑定位；视图与 WITHOUT ROWID 表回退为普通查询
    let rows: Record<string, unknown>[];
    try {
      rows = await sqlAll(
        db,
        sql`SELECT rowid AS __rowid, * FROM ${ident} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`
      );
    } catch {
      rows = await sqlAll(
        db,
        sql`SELECT * FROM ${ident} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`
      );
    }
    const columns = deriveColumns(rows);
    return json({ columns, rows: rowsToJson(rows, columns), total, page });
  } catch (e) {
    return json({ error: errMsg(e) }, 400);
  }
};
