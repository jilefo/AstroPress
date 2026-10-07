import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { deriveColumns, sqlAll, sqlOne } from "@astropress/core";
import { errMsg, json } from "../../lib/http";
import { encodeValue, isBlob, quoteIdent } from "../../lib/sql-literal";
import {
  EXPORT_ROW_LIMIT,
  isValidName,
} from "../../lib/sql-util";

/** GET /admin-ext/api/db-console/export?name=&format=csv|sql */
export const GET: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  const params = new URL(request.url).searchParams;
  const name = params.get("name") ?? "";
  if (!isValidName(name)) return json({ error: "非法的表名" }, 400);
  const format = params.get("format") === "sql" ? "sql" : "csv";

  try {
    const ident = sql.raw(quoteIdent(name));
    const dispositionName = encodeURIComponent(`${name}.${format}`);
    const disposition = `attachment; filename="${name}.${format}"; filename*=UTF-8''${dispositionName}`;
    // 两个分支共用同一 Headers 对象，避免重复对象字面量 key（审计 W2）
    const headers = new Headers();
    headers.set("Content-Disposition", disposition);

    if (format === "csv") {
      const rows = await sqlAll(
        db,
        sql`SELECT * FROM ${ident} LIMIT ${EXPORT_ROW_LIMIT}`
      );
      const columns = deriveColumns(rows);
      const csv = toCsv(columns, rows);
      // 带 BOM，保证 Excel 正确识别 UTF-8 中文
      headers.set("Content-Type", "text/csv; charset=utf-8");
      return new Response("\uFEFF" + csv, { headers });
    }

    // sql：DROP + CREATE + 全量 INSERT
    const master = await sqlOne(
      db,
      sql`SELECT sql FROM sqlite_master WHERE name = ${name} AND type IN ('table','view') LIMIT 1`
    );
    const createSql: string | null =
      typeof master?.sql === "string" ? (master.sql as string) : null;
    if (!createSql) return json({ error: "找不到该对象的建表语句" }, 404);

    const rows = await sqlAll(db, sql`SELECT * FROM ${ident}`);
    const columns = deriveColumns(rows);
    const colList = columns.map(quoteIdent).join(", ");

    const lines: string[] = [];
    lines.push(`-- AstroPress 导出：${name}`);
    lines.push(`-- 时间：${new Date().toISOString()}`);
    lines.push("");
    lines.push(`DROP TABLE IF EXISTS ${quoteIdent(name)};`);
    lines.push(createSql + ";");
    for (const row of rows) {
      const values = columns.map((c) => encodeValue(row?.[c])).join(", ");
      lines.push(`INSERT INTO ${quoteIdent(name)} (${colList}) VALUES (${values});`);
    }

    headers.set("Content-Type", "application/sql; charset=utf-8");
    return new Response(lines.join("\n"), { headers });
  } catch (e) {
    return json({ error: errMsg(e) }, 400);
  }
};

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (isBlob(v)) {
    const n = v instanceof Uint8Array ? v.byteLength : v.byteLength;
    return `[BLOB ${n} bytes]`;
  }
  return String(v);
}

function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(columns: string[], rows: any[]): string {
  const lines: string[] = [columns.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(csvCell(row?.[c]))).join(","));
  }
  return lines.join("\r\n");
}
