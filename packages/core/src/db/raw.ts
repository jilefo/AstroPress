/**
 * 跨驱动原生 SQL 辅助。
 *
 * 背景：drizzle-orm 0.36 各驱动的 db.run(sql) 返回结构不一致：
 *  - Cloudflare D1：`{ results, success, meta }`（没有 rows/columns 字段）
 *  - libsql / better-sqlite3：`{ rows, columns, rowsAffected, lastInsertRowid }`
 * 直接读 `res.rows` 的代码在 D1 上会静默拿到空集（db-console 线上 0 表事故根因）。
 *
 * SELECT 统一走 drizzle 的 db.all()（两种驱动都返回「行对象数组」）；
 * 写操作走 db.run() 并归一化变更元信息。
 */
import type { AnyDatabase } from "./index";

/** 执行返回结果集的语句（SELECT/PRAGMA/EXPLAIN…），返回行对象数组。 */
export async function sqlAll(
  db: AnyDatabase,
  query: unknown
): Promise<Record<string, unknown>[]> {
  const rows = await db.all(query);
  if (!Array.isArray(rows)) return [];
  return rows as Record<string, unknown>[];
}

/** 取单行（无结果返回 null）。 */
export async function sqlOne(
  db: AnyDatabase,
  query: unknown
): Promise<Record<string, unknown> | null> {
  const rows = await sqlAll(db, query);
  return rows[0] ?? null;
}

export interface WriteMeta {
  changes: number;
  lastRowId: number | string | null;
}

/** 执行写语句（INSERT/UPDATE/DELETE/DDL），归一化影响行数与最后行 ID。 */
export async function sqlRun(
  db: AnyDatabase,
  query: unknown
): Promise<WriteMeta> {
  const res: any = await db.run(query);
  return {
    changes:
      res?.rowsAffected ??
      res?.meta?.changes ??
      res?.changes ??
      res?.rows?.length ??
      0,
    lastRowId: res?.lastInsertRowid ?? res?.meta?.last_row_id ?? null,
  };
}

/**
 * 从行集合推导列名：
 * libsql ResultSet 自带 columns；D1 行对象以列名为键，取首行键集合。
 */
export function deriveColumns(
  rows: Record<string, unknown>[],
  columns?: string[]
): string[] {
  if (Array.isArray(columns) && columns.length) return columns;
  if (rows[0] && typeof rows[0] === "object") return Object.keys(rows[0]);
  return [];
}

/**
 * D1 的 SQLite 对 LIKE/GLOB 模式有 50 字节复杂度上限（≥51 字节报
 * "LIKE or GLOB pattern too complex: SQLITE_ERROR [code: 7500]"；
 * 本地 SQLite/PostgreSQL 无此限制，故 dev 测不出）。上限按 UTF-8 字节计
 * （48 个中文字符 = 144 字节同样超限）。模式形如 `%needle%` 时
 * needle 必须 ≤48 字节，否则 D1 上直接 500。
 */
export const LIKE_NEEDLE_MAX = 48;

/** 截断 LIKE 通配内容到 D1 安全长度（按 UTF-8 字节计，不拆开多字节字符）。 */
export function likeNeedle(input: string, max: number = LIKE_NEEDLE_MAX): string {
  const s = String(input ?? "");
  const bytes = new TextEncoder().encode(s);
  if (bytes.length <= max) return s;
  const decode = new TextDecoder("utf-8", { fatal: true });
  for (let n = max; n > 0; n--) {
    try {
      return decode.decode(bytes.slice(0, n));
    } catch {
      // 末尾多字节字符被截断，回退一字节重试（最多 3 次）
    }
  }
  return "";
}

/**
 * 防御性 JSON 解析：wp_options 中的 JSON 选项（主题 tokens、page_schema、forms…）
 * 一旦被手工写坏，裸 JSON.parse 会让整个页面 500（footer schema 事故根因）。
 * 统一用本函数解析，损坏时回退 fallback 而不是抛错。
 */
export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
