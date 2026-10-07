/**
 * local.db 的 SQL 逻辑转储（仿 plugins/backup 的 dump 实现，自包含一份）。
 * 输出文本通过 Contents API 推送到远端仓库。
 */
import { sql } from "drizzle-orm";

const INSERT_BATCH = 100; // 每 100 行一条多值 INSERT

// ─── SQL 字面量编码（同 backup 插件） ────────────────────────────────────────

function isBlob(v: unknown): v is ArrayBuffer | Uint8Array {
  if (v instanceof Uint8Array) return true;
  if (typeof ArrayBuffer === "function" && v instanceof ArrayBuffer) return true;
  return false;
}

function toHex(v: ArrayBuffer | Uint8Array): string {
  const bytes = v instanceof Uint8Array ? v : new Uint8Array(v);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** 双引号包裹的标识符（内部 " 双写转义） */
export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/** JS 值 → SQL 字面量：null / 数字 / BLOB hex / 单引号转义字符串 */
export function encodeValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (isBlob(v)) return `X'${toHex(v)}'`;
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ─── 转储 ────────────────────────────────────────────────────────────────────

interface UserTable {
  name: string;
  type: string;
}

/** 用户表：排除 sqlite 内部表与会话表（wp_sessions 不动） */
export async function listUserTables(db: any): Promise<UserTable[]> {
  const res = await db.run(
    "SELECT name, type FROM sqlite_master " +
      "WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'wp_sessions' " +
      "ORDER BY name"
  );
  return (res.rows ?? []).map((r: any) => ({ name: String(r.name), type: String(r.type) }));
}

/**
 * 生成 dump.sql 文本：
 *   每条语句以 ";\n" 结束；CREATE 为 sqlite_master 原文；
 *   行数据每 100 行一条多值 INSERT，值全部安全编码。
 */
export async function buildDump(db: any, tables?: UserTable[]): Promise<string> {
  const list = tables ?? (await listUserTables(db));
  const lines: string[] = [];
  lines.push("-- AstroPress 数据库逻辑备份 dump.sql（git-sync 云端容灾）");
  lines.push("-- 生成时间: " + new Date().toISOString());
  lines.push("-- 表数量: " + list.length);
  lines.push("PRAGMA foreign_keys=OFF;");
  lines.push("");

  for (const t of list) {
    const name = t.name;
    const master = await db.run(
      sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${name} LIMIT 1`
    );
    const createSql: unknown = master.rows?.[0]?.sql;
    if (typeof createSql !== "string" || !createSql.trim()) continue;

    lines.push("-- ----------------------------");
    lines.push("-- 表结构: " + name);
    lines.push("-- ----------------------------");
    lines.push(createSql.trim().replace(/;+\s*$/, "") + ";");
    lines.push("");

    const res = await db.run(sql`SELECT * FROM ${sql.raw(quoteIdent(name))}`);
    const columns: string[] = Array.isArray(res.columns)
      ? res.columns.map((c: any) => (typeof c === "string" ? c : String(c.name)))
      : [];
    const rows: any[] = res.rows ?? [];
    if (columns.length === 0 || rows.length === 0) {
      lines.push("-- 数据: " + name + "（0 行）");
      lines.push("");
      continue;
    }

    lines.push("-- 数据: " + name + "（" + rows.length + " 行）");
    const colList = columns.map(quoteIdent).join(", ");
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH);
      const tuples = batch
        .map((row) => "(" + columns.map((c) => encodeValue(row[c])).join(", ") + ")")
        .join(", ");
      lines.push(`INSERT INTO ${quoteIdent(name)} (${colList}) VALUES ${tuples};`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
