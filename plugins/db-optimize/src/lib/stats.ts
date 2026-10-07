import { sql } from "drizzle-orm";
import { sqlAll, sqlOne } from "@astropress/core";

/**
 * SQLite 数据库统计与体积测量。
 *
 * 所有 SQL 均通过 drizzle 的 sql 模板执行（db.run(sql`...`)），
 * 动态表名使用 sql.raw(quoteIdent(name)) 安全引用（实现参考 backup 插件）。
 */

export interface TableStat {
  name: string;
  rows: number;
}

export type StatsResult = {
  supported: true;
  /**
   * page_count * page_size 估算字节数。
   * Cloudflare D1 禁止 PRAGMA（SQLITE_AUTH），此时为 null；
   * 表行数等普通 SELECT 统计依然可用。
   */
  dbBytes: number | null;
  pageCount: number | null;
  pageSize: number | null;
  /** PRAGMA 不可用（Cloudflare D1 等托管数据库）：体积/VACUUM 类功能降级 */
  bytesUnavailable: boolean;
  /** 与 bytesUnavailable 同义：ANALYZE/VACUUM/PRAGMA optimize 是否可执行 */
  vacuumSupported: boolean;
  tables: TableStat[];
  autoload: { count: number; bytes: number };
  revisions: number;
};

/** 双引号包裹的标识符（内部 " 双写转义），参考 backup 插件 quoteIdent */
export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 判断是否为「托管数据库禁止 PRAGMA」类错误（Cloudflare D1: SQLITE_AUTH） */
export function isPragmaDenied(e: unknown): boolean {
  const m = errMsg(e);
  return /SQLITE_AUTH|not authorized/i.test(m);
}

/**
 * 取结果集首行中某一列的数值（D1/libsql 行对象均以列名为键）。
 */
function rowNumber(row: any, col: string): number {
  if (row === null || row === undefined) return 0;
  const v = row[col];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 通过 PRAGMA page_count / page_size 测量数据库体积。
 * 非 SQLite 驱动执行 PRAGMA 会抛错，由调用方决定如何降级。
 */
export async function measureDbBytes(
  db: any
): Promise<{ bytes: number; pageCount: number; pageSize: number }> {
  const pc = await db.run(sql`PRAGMA page_count`);
  const ps = await db.run(sql`PRAGMA page_size`);
  const pageCount = rowNumber(pc.rows?.[0], "page_count");
  const pageSize = rowNumber(ps.rows?.[0], "page_size");
  return { bytes: pageCount * pageSize, pageCount, pageSize };
}

/**
 * 汇总数据库统计信息。
 *
 * PRAGMA 不可用（Cloudflare D1 等托管数据库抛 SQLITE_AUTH）时仅体积相关项
 * 降级为 null，表行数 / autoload / 修订版本等普通 SELECT 统计照常返回。
 */
export async function getStats(db: any): Promise<StatsResult> {
  let dbBytes: number | null = null;
  let pageCount: number | null = null;
  let pageSize: number | null = null;
  let bytesUnavailable = false;
  try {
    const m = await measureDbBytes(db);
    dbBytes = m.bytes; pageCount = m.pageCount; pageSize = m.pageSize;
  } catch (e) {
    // PRAGMA 被托管数据库拒绝（D1）属预期降级；其他错误也不暴露英文原文到前台
    bytesUnavailable = true;
    if (!isPragmaDenied(e)) {
      // 非预期错误仅记录到服务端控制台，不把驱动错误透传给界面
      console.error("[db-optimize] measure failed:", errMsg(e));
    }
  }

  // 全部用户表（排除 sqlite 内部表）。查询失败才视为整体不可用。
  const tmRows = await sqlAll(
    db,
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  // _cf_KV 等 Cloudflare D1 内部支撑表不计入用户表
  const names: string[] = tmRows
    .map((r: any) => String(r.name))
    .filter((n) => !n.startsWith("_cf_"));

  const tables: TableStat[] = [];
  for (const name of names) {
    // 表名来自 sqlite_master，仍须经 quoteIdent 安全引用后再拼接
    const ident = sql.raw(quoteIdent(name));
    try {
      const row = await sqlOne(db, sql`SELECT COUNT(*) AS c FROM ${ident}`);
      tables.push({ name, rows: rowNumber(row, "c") });
    } catch {
      // 单张表统计失败（如虚拟表）不阻断整体统计
      tables.push({ name, rows: 0 });
    }
  }

  // autoload 选项（autoload='yes'）：数量与 option_value 字节占用
  let autoload = { count: 0, bytes: 0 };
  try {
    const row = await sqlOne(
      db,
      sql`SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(option_value)), 0) AS bytes
          FROM wp_options WHERE autoload = 'yes'`
    );
    autoload = { count: rowNumber(row, "c"), bytes: rowNumber(row, "bytes") };
  } catch {
    /* wp_options 不存在或结构不符时保持 0 */
  }

  // 文章修订版本数量
  let revisions = 0;
  try {
    const row = await sqlOne(
      db,
      sql`SELECT COUNT(*) AS c FROM wp_posts WHERE post_type = 'revision'`
    );
    revisions = rowNumber(row, "c");
  } catch {
    /* wp_posts 不存在时保持 0 */
  }

  return {
    supported: true,
    dbBytes,
    pageCount,
    pageSize,
    bytesUnavailable,
    vacuumSupported: !bytesUnavailable,
    tables,
    autoload,
    revisions,
  };
}
