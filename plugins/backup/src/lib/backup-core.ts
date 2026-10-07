import { sql } from "drizzle-orm";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import * as fs from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  backupDir,
  ensureBackupDir,
  findMediaDir,
  resolveDbFile,
} from "./paths";
import { encodeValue, quoteIdent } from "./sql-literal";

// ─── 限制常量 ──────────────────────────────────────────────────────────────
export const MAX_SINGLE_MEDIA = 50 * 1024 * 1024; // 单个媒体 >50MB 跳过
export const MAX_MEDIA_TOTAL = 800 * 1024 * 1024; // 媒体合计 >800MB 拒绝
export const MAX_UPLOAD = 1024 * 1024 * 1024; // 上传恢复上限 1GB
const INSERT_BATCH = 100; // 每 100 行一条多值 INSERT
const MAX_ERRORS = 20; // 恢复时最多回传的错误条数

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Manifest ──────────────────────────────────────────────────────────────

export interface SkippedMedia {
  key: string;
  size: number;
  reason: string;
}

export interface BackupManifest {
  app: "astropress";
  kind: "backup";
  version: 1;
  createdAt: string;
  /** 仅数据库文件名，不含路径 */
  dbFile: string;
  mediaCount: number;
  tables: string[];
  skipped?: SkippedMedia[];
}

interface UserTable {
  name: string;
  type: string;
}

// ─── 文件名校验（防穿越） ────────────────────────────────────────────────────

/**
 * 备份文件名白名单：
 *   - 必须 backup- 前缀、.apzip 后缀
 *   - 不含任何路径分隔符（basename 必须等于自身）
 *   - 中间只允许文件名安全字符
 */
export function isSafeBackupName(file: unknown): file is string {
  if (typeof file !== "string" || file.length === 0 || file.length > 160) return false;
  if (file.includes("/") || file.includes("\\") || file.includes("\0")) return false;
  if (file !== basename(file)) return false;
  return /^backup-[A-Za-z0-9._-]{1,120}\.apzip$/.test(file);
}

export function backupPath(file: string): string {
  return resolve(backupDir, file);
}

function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

// ─── 逻辑转储 dump.sql ──────────────────────────────────────────────────────

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
 * 生成 dump.sql：
 *   每条语句以 ";\n" 结束；CREATE 为 sqlite_master 原文（SQLite 导出的 DDL
 *   内部不含换行+分号）；行数据每 100 行一条多值 INSERT，值全部安全编码。
 */
export async function buildDump(db: any, tables?: UserTable[]): Promise<string> {
  const list = tables ?? (await listUserTables(db));
  const lines: string[] = [];
  lines.push("-- AstroPress 数据库逻辑备份 dump.sql");
  lines.push("-- 生成时间: " + new Date().toISOString());
  lines.push("-- 表数量: " + list.length);
  lines.push("-- 恢复方式: 逐条执行（字符串/注释安全的拆分器）");
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
    // @libsql/client 0.14 的 columns 为 string[]，兼容旧版 {name} 形态
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

// ─── 媒体收集 ──────────────────────────────────────────────────────────────

interface MediaEntry {
  /** zip 内相对 key（media/ 前缀） */
  key: string;
  abs: string;
  size: number;
}

async function walkMedia(dir: string, mediaRoot: string, out: {
  files: MediaEntry[];
  skipped: SkippedMedia[];
  total: number;
}): Promise<void> {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const abs = resolve(dir, item.name);
    if (item.isDirectory()) {
      await walkMedia(abs, mediaRoot, out);
      continue;
    }
    if (!item.isFile()) continue;
    const st = await fs.stat(abs);
    // 统一为 posix 相对路径作为 zip key
    const key = "media/" + relative(mediaRoot, abs).split(sep).join("/");
    if (st.size > MAX_SINGLE_MEDIA) {
      out.skipped.push({ key, size: st.size, reason: "单个文件超过 50MB，已跳过" });
      continue;
    }
    out.files.push({ key, abs, size: st.size });
    out.total += st.size;
  }
}

// ─── 创建备份 ──────────────────────────────────────────────────────────────

export interface CreatedBackup {
  file: string;
  size: number;
  manifest: BackupManifest;
  mediaSkipped: SkippedMedia[];
}

export async function createBackup(db: any, includeMedia: boolean): Promise<CreatedBackup> {
  const createdAt = new Date();
  const tables = await listUserTables(db);
  const dump = await buildDump(db, tables);

  const skipped: SkippedMedia[] = [];
  const mediaEntries: MediaEntry[] = [];
  let mediaCount = 0;

  if (includeMedia) {
    const mediaDir = await findMediaDir();
    if (mediaDir) {
      const collected = { files: [] as MediaEntry[], skipped: [] as SkippedMedia[], total: 0 };
      await walkMedia(mediaDir, mediaDir, collected);
      if (collected.total > MAX_MEDIA_TOTAL) {
        throw new ApiError(
          413,
          `媒体库合计 ${(collected.total / 1024 / 1024).toFixed(1)}MB 超过 800MB 上限，请使用文件系统分卷方案（本次不实现）。`
        );
      }
      mediaEntries.push(...collected.files);
      skipped.push(...collected.skipped);
      mediaCount = collected.files.length;
    }
  }

  // WAL 先落盘（失败忽略），再尝试物理复制主库文件
  try {
    await db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* WAL 检查点失败不阻断备份：dump.sql 始终生成 */
  }

  const dbFile = await resolveDbFile();
  let dbBytes: Uint8Array | null = null;
  try {
    dbBytes = new Uint8Array(await fs.readFile(dbFile));
  } catch {
    dbBytes = null;
  }

  const manifest: BackupManifest = {
    app: "astropress",
    kind: "backup",
    version: 1,
    createdAt: createdAt.toISOString(),
    dbFile: basename(dbFile) || "local.db",
    mediaCount,
    tables: tables.map((t) => t.name),
  };
  if (skipped.length > 0) manifest.skipped = skipped;

  const zippable: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "dump.sql": strToU8(dump),
  };
  // 物理副本固定 key；复制失败则不包含（逻辑 dump 仍在）
  if (dbBytes && dbBytes.byteLength > 0) zippable["data/local.db"] = dbBytes;

  for (const entry of mediaEntries) {
    zippable[entry.key] = new Uint8Array(await fs.readFile(entry.abs));
  }

  const bytes = zipSync(zippable, { level: 6 });
  const file = `backup-${localStamp(createdAt)}.apzip`;
  const dir = await ensureBackupDir();
  await fs.writeFile(resolve(dir, file), bytes);

  return { file, size: bytes.byteLength, manifest, mediaSkipped: skipped };
}

// ─── 列表 ──────────────────────────────────────────────────────────────────

export interface BackupListEntry {
  file: string;
  size: number;
  sizeMB: number;
  mtime: string;
  manifestOk: boolean;
  createdAt: string | null;
  mediaCount: number | null;
  tablesCount: number | null;
  tables: string[] | null;
  skipped: SkippedMedia[] | null;
}

export function readManifest(bytes: Uint8Array): BackupManifest | null {
  try {
    // 只解压 manifest.json，避免列表时把大备份整包读入内存
    const entries = unzipSync(bytes, {
      filter: (file) => file.name === "manifest.json",
    });
    const raw = entries["manifest.json"];
    if (!raw) return null;
    const m = JSON.parse(strFromU8(raw));
    if (m && m.app === "astropress" && m.kind === "backup") return m as BackupManifest;
    return null;
  } catch {
    return null;
  }
}

export async function listBackupEntries(): Promise<BackupListEntry[]> {
  const dir = await ensureBackupDir();
  const names = (await fs.readdir(dir)).filter(isSafeBackupName);
  const out: BackupListEntry[] = [];
  for (const file of names) {
    const abs = resolve(dir, file);
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) continue;
      let manifest: BackupManifest | null = null;
      try {
        manifest = readManifest(new Uint8Array(await fs.readFile(abs)));
      } catch {
        manifest = null;
      }
      out.push({
        file,
        size: st.size,
        sizeMB: Math.round((st.size / 1024 / 1024) * 100) / 100,
        mtime: st.mtime.toISOString(),
        manifestOk: manifest !== null,
        createdAt: manifest?.createdAt ?? null,
        mediaCount: manifest?.mediaCount ?? null,
        tablesCount: manifest?.tables?.length ?? null,
        tables: manifest?.tables ?? null,
        skipped: manifest?.skipped ?? null,
      });
    } catch {
      // 单个文件读取失败不阻断列表
    }
  }
  out.sort((a, b) => (a.file < b.file ? 1 : -1));
  return out;
}

// ─── 恢复：SQL 拆分与执行 ───────────────────────────────────────────────────

/**
 * 小型 SQL 语句拆分器（逐字符状态机）：
 *   - 忽略单引号字符串（'' 转义）、双引号/反引号/方括号标识符
 *   - 忽略 -- 行注释与 /* 块注释
 *   - 仅在顶层分号处切分
 * 可安全处理数据文本中出现的 ";换行 等序列。
 */
export function splitSqlStatements(input: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let i = 0;
  const n = input.length;

  const push = () => {
    const s = buf.trim();
    if (s) stmts.push(s);
    buf = "";
  };

  while (i < n) {
    const c = input[i];

    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      buf += c;
      i++;
      while (i < n) {
        buf += input[i];
        if (input[i] === quote) {
          if (input[i + 1] === quote) {
            buf += input[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "[") {
      // SQLite 风格方括号标识符
      buf += c;
      i++;
      while (i < n) {
        buf += input[i];
        if (input[i] === "]") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "-" && input[i + 1] === "-") {
      while (i < n && input[i] !== "\n") {
        buf += input[i];
        i++;
      }
      continue;
    }

    if (c === "/" && input[i + 1] === "*") {
      buf += "/*";
      i += 2;
      while (i < n && !(input[i] === "*" && input[i + 1] === "/")) {
        buf += input[i];
        i++;
      }
      if (i < n) {
        buf += "*/";
        i += 2;
      }
      continue;
    }

    if (c === ";") {
      push();
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  push();
  return stmts;
}

const CREATE_RE =
  /^CREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/i;

function createdName(stmt: string): string | null {
  const m = stmt.match(CREATE_RE);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? m[4] ?? null;
}

/**
 * 逻辑恢复数据库：
 *   PRAGMA foreign_keys=OFF → 逐句执行 dump.sql；
 *   已存在的表跳过其 CREATE（dump 内的 CREATE 为建库原文）；
 *   wp_sessions 不在 dump 中，不会被动到。
 */
export async function restoreDatabase(
  db: any,
  dumpText: string
): Promise<{ statements: number; errors: string[] }> {
  await db.run("PRAGMA foreign_keys=OFF");
  const stmts = splitSqlStatements(dumpText);

  const master = await db.run(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
  );
  const existing = new Set<string>((master.rows ?? []).map((r: any) => String(r.name)));

  let statements = 0;
  const errors: string[] = [];

  for (const stmt of stmts) {
    const created = createdName(stmt);
    if (created !== null && existing.has(created)) continue;
    try {
      await db.run(stmt);
      statements++;
      if (created !== null) existing.add(created);
    } catch (e) {
      errors.push(shortStmt(stmt) + " → " + msgOf(e));
      if (errors.length >= MAX_ERRORS) {
        errors.push("其余错误已省略");
        break;
      }
    }
  }
  return { statements, errors };
}

/**
 * 将 zip 内 media/ 前缀文件写回媒体目录。
 * zip-slip 防护：规范化后路径必须仍位于媒体目录之内。
 */
export async function restoreMediaFiles(
  entries: Record<string, Uint8Array>,
  mediaDir: string
): Promise<{ mediaFiles: number; skipped: string[]; errors: string[] }> {
  const root = resolve(mediaDir);
  await fs.mkdir(root, { recursive: true });

  let mediaFiles = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(entries).sort()) {
    if (!key.startsWith("media/")) continue;
    const rel = key.slice(6);
    if (!rel || rel.endsWith("/")) continue;

    const dest = resolve(root, rel);
    if (dest !== root && !dest.startsWith(root + sep)) {
      skipped.push(key);
      continue;
    }

    try {
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.writeFile(dest, entries[key]);
      mediaFiles++;
    } catch (e) {
      errors.push(key + " → " + msgOf(e));
      if (errors.length >= MAX_ERRORS) {
        errors.push("其余错误已省略");
        break;
      }
    }
  }
  return { mediaFiles, skipped, errors };
}

function msgOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function shortStmt(stmt: string): string {
  const one = stmt.replace(/\s+/g, " ").trim();
  return one.length > 80 ? one.slice(0, 80) + "…" : one;
}
