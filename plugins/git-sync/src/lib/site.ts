/**
 * 整站源码收集：遍历仓库根目录，产出待推送清单。
 *
 *   - 排除目录：node_modules / .git / .astro / dist / .turbo / backups /
 *     .ap-data / .vercel / .netlify / .vscode / .idea
 *   - 排除文件：.env*（密钥）、*.log、local.db*（二进制库，内容已由 dump.sql 覆盖）、
 *     .DS_Store / Thumbs.db
 *   - 单文件 >1MB 跳过（Git 托管平台 Contents API 硬限制）
 *   - 单次最多 100 个文件；游标存 wp_options，按相对路径排序轮转，
 *     多次执行「立即同步」即可覆盖全站
 */
import * as fs from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { repoRoot } from "./paths";

export const MAX_SINGLE_SITE_FILE = 1 * 1024 * 1024; // Contents API 单文件上限 1MB
export const MAX_SITE_PER_SYNC = 100; // 单次同步最多 100 个源码文件

const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".astro", "dist", ".turbo", "backups",
  ".ap-data", ".vercel", ".netlify", ".vscode", ".idea",
]);

const CURSOR_KEY = "astropress_git_sync_site_cursor";

function isExcludedFile(name: string): boolean {
  const n = name.toLowerCase();
  if (n === ".env" || n.startsWith(".env.")) return true;
  if (n.endsWith(".log")) return true;
  if (n === ".ds_store" || n === "thumbs.db") return true;
  if (n === "local.db" || n.startsWith("local.db-")) return true;
  return false;
}

export interface SiteEntry {
  /** posix 相对仓库根路径 */
  rel: string;
  abs: string;
  size: number;
}

export interface SkippedSiteFile {
  rel: string;
  size: number;
  reason: string;
}

export interface SitePlan {
  files: SiteEntry[];
  skipped: SkippedSiteFile[];
  /** 符合要求但因批量上限未纳入本次的文件数 */
  remaining: number;
  totalEligible: number;
  /** 游标是否已绕回起点（全站覆盖完成一轮） */
  wrapped: boolean;
}

async function walk(
  dir: string,
  root: string,
  out: { files: SiteEntry[]; skipped: SkippedSiteFile[] },
  excludeAbs?: string
): Promise<void> {
  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // 无权限/已删除的目录直接跳过
  }
  for (const item of items) {
    if (item.isDirectory()) {
      if (EXCLUDE_DIRS.has(item.name)) continue;
      const sub = resolve(dir, item.name);
      // 媒体目录由 media 范围单独推送，整站源码跳过避免重复上传
      if (excludeAbs && sub === excludeAbs) continue;
      await walk(sub, root, out, excludeAbs);
      continue;
    }
    if (!item.isFile()) continue;
    if (isExcludedFile(item.name)) continue;
    const abs = resolve(dir, item.name);
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    const rel = relative(root, abs).split(sep).join("/");
    if (st.size > MAX_SINGLE_SITE_FILE) {
      out.skipped.push({ rel, size: st.size, reason: "超过 1MB（Contents API 限制）" });
      continue;
    }
    out.files.push({ rel, abs, size: st.size });
  }
}

async function readCursor(db: any): Promise<string> {
  try {
    const [row] = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, CURSOR_KEY))
      .limit(1);
    return row ? String(row.value) : "";
  } catch {
    return "";
  }
}

async function writeCursor(db: any, cursor: string): Promise<void> {
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, CURSOR_KEY))
    .limit(1);
  if (row) {
    await db.update(wpOptions).set({ optionValue: cursor }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: CURSOR_KEY, optionValue: cursor });
  }
}

/**
 * 收集本次同步的整站源码清单（游标后 100 个）。
 * 游标推进在同步编排层完成（仅推送成功的最大 rel）。
 */
export async function collectSitePlan(db: any): Promise<SitePlan> {
  const collected = { files: [] as SiteEntry[], skipped: [] as SkippedSiteFile[] };
  // 媒体目录（apps/admin/public/media）由 media 范围单独推送，整站遍历时排除
  const mediaAbs = resolve(repoRoot, "apps", "admin", "public", "media");
  await walk(repoRoot, repoRoot, collected, mediaAbs);
  collected.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const cursor = await readCursor(db);
  let startIdx = 0;
  if (cursor) {
    startIdx = collected.files.findIndex((f) => f.rel > cursor);
    if (startIdx === -1) startIdx = 0; // 游标之后无文件 → 绕回起点
  }
  const wrapped = cursor !== "" && startIdx === 0;
  const batch = collected.files.slice(startIdx, startIdx + MAX_SITE_PER_SYNC);

  return {
    files: batch,
    skipped: collected.skipped,
    remaining: collected.files.length - startIdx - batch.length,
    totalEligible: collected.files.length,
    wrapped,
  };
}

/** 同步成功后推进游标 */
export async function advanceSiteCursor(db: any, lastRel: string): Promise<void> {
  try {
    await writeCursor(db, lastRel);
  } catch {
    /* 游标写入失败不影响同步结果 */
  }
}

/** 读取源码文件为 base64 */
export async function readSiteBase64(abs: string): Promise<string> {
  const buf = await fs.readFile(abs);
  return buf.toString("base64");
}
