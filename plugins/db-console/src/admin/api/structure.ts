import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { deriveColumns, sqlAll, sqlOne } from "@astropress/core";
import { errMsg, json } from "../../lib/http";
import { quoteIdent } from "../../lib/sql-literal";
import {
  isValidName,
  rowsToJson,
} from "../../lib/sql-util";

/**
 * GET /admin-ext/api/db-console/structure?name=
 * 返回 {columns: PRAGMA table_info 行, sql: 建表/视图原文}
 */
export const GET: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  const params = new URL(request.url).searchParams;
  const name = params.get("name") ?? "";
  if (!isValidName(name)) return json({ error: "非法的表名" }, 400);

  try {
    const ident = sql.raw(quoteIdent(name));
    const infoRows = await sqlAll(db, sql`PRAGMA table_info(${ident})`);
    const columns = deriveColumns(infoRows);

    const master = await sqlOne(
      db,
      sql`SELECT sql FROM sqlite_master WHERE name = ${name} AND type IN ('table','view') LIMIT 1`
    );
    const createSql: string | null = typeof master?.sql === "string"
      ? (master.sql as string)
      : null;

    return json({ columns: rowsToJson(infoRows, columns), sql: createSql });
  } catch (e) {
    return json({ error: errMsg(e) }, 400);
  }
};
