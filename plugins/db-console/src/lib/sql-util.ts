/// <reference path="../env.d.ts" />
import { fileURLToPath } from "node:url";
import { isBlob } from "./sql-literal";

/** 表名/视图名白名单：仅接受合法的裸标识符（长度 1-64） */
export const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

export function isValidName(name: unknown): name is string {
  return typeof name === "string" && NAME_RE.test(name);
}

export const PAGE_SIZE = 50;
export const MAX_SQL_LEN = 20000;
export const EXPORT_ROW_LIMIT = 10000;
/** 裸 SELECT 在控制台返回的最大行数，防无 LIMIT 大结果集打爆响应内存 */
export const MAX_EXEC_ROWS = 5000;

const QUERY_KEYWORDS = new Set(["SELECT", "SHOW", "PRAGMA", "EXPLAIN", "DESCRIBE"]);

/**
 * 将 SQL 中的字符串字面量、引号标识符、注释替换为等长空白，
 * 以便安全地扫描分号与首关键字（避免被字面量内容欺骗）。
 */
export function blankLiteralsAndComments(s: string): string {
  let out = "";
  let i = 0;
  const n = s.length;
  const blank = (c: string) => (c === "\n" || c === "\t" ? c : " ");
  while (i < n) {
    const c = s[i];
    const two = c + (s[i + 1] ?? "");
    if (two === "--") {
      while (i < n && s[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (two === "/*") {
      out += "  ";
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) {
        out += blank(s[i]);
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      out += " ";
      i++;
      while (i < n) {
        if (s[i] === quote) {
          if (s[i + 1] === quote) {
            out += "  ";
            i += 2;
            continue;
          }
          out += " ";
          i++;
          break;
        }
        out += blank(s[i]);
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * 多语句检测：去掉字面量与注释后，按分号切分，
 * 存在两个非空片段即拒绝（末尾单个分号允许）。
 */
export function hasMultipleStatements(sqlText: string): boolean {
  const parts = blankLiteralsAndComments(sqlText)
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 1;
}

export type StmtKind = "query" | "write";

/**
 * 危险 PRAGMA 黑名单：
 * - writable_schema=1 后可直接改写 sqlite_master（相当于直接破坏数据库结构）；
 * - trusted_schema=1 后，不可信库中的视图/触发器会以高权限执行。
 */
const DANGEROUS_PRAGMAS = new Set(["WRITABLE_SCHEMA", "TRUSTED_SCHEMA"]);

/** 拦截连接/附件类、VACUUM（空间回收请走备份流程）与危险 PRAGMA */
export function isForbiddenStatement(sqlText: string): boolean {
  const s = blankLiteralsAndComments(sqlText);
  if (/^\s*(ATTACH|DETACH|VACUUM)\b/i.test(s)) return true;
  const pm = s.match(/^\s*PRAGMA\s+([A-Za-z_][A-Za-z0-9_]*)/i);
  if (pm && DANGEROUS_PRAGMAS.has(pm[1].toUpperCase())) return true;
  return false;
}

/** 取首个关键字并区分查询/写操作 */
export function classifyStatement(sqlText: string): { kind: StmtKind; keyword: string } {
  const m = blankLiteralsAndComments(sqlText).match(/[A-Za-z]+/);
  const keyword = (m ? m[0] : "").toUpperCase();
  return { kind: QUERY_KEYWORDS.has(keyword) ? "query" : "write", keyword };
}

/**
 * ResultSet 列名数组。
 * @libsql/client 0.14 的 columns 为 string[]，兼容旧版 {name} 形态。
 */
export function columnNames(res: any): string[] {
  if (!Array.isArray(res?.columns)) return [];
  return res.columns.map((c: any) => (typeof c === "string" ? c : String(c.name)));
}

type JsonCell = unknown;

/** 单元格转成可 JSON 序列化的形态：BLOB 标记、bigint 转字符串 */
export function cellToJson(v: unknown): JsonCell {
  if (typeof v === "bigint") return v.toString();
  if (isBlob(v)) return { __blob: asLen(v) };
  return (v ?? null) as JsonCell;
}

function asLen(v: ArrayBuffer | Uint8Array): number {
  return v instanceof Uint8Array ? v.byteLength : v.byteLength;
}

/** 行集合（对象数组）整体序列化，列名以 ResultSet.columns 为准 */
export function rowsToJson(rows: any[], columns: string[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const o: Record<string, unknown> = {};
    for (const col of columns) o[col] = cellToJson(row?.[col]);
    return o;
  });
}

/** 当前数据库文件路径（从 virtual:astropress/config 的 database.url 解析，失败 unknown） */
export async function getDbFileLabel(): Promise<string> {
  let url: string | undefined;
  try {
    const cfg: any = await import("virtual:astropress/config");
    url = cfg?.database?.url;
  } catch {
    /* 虚拟模块不可用 */
  }
  if (!url || typeof url !== "string") return "unknown";
  if (url.startsWith("file://")) {
    try {
      return fileURLToPath(url);
    } catch {
      /* fallthrough */
    }
  }
  if (url.startsWith("file:")) return url.slice(5);
  return url;
}
