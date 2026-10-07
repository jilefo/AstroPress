/**
 * 媒体库文件收集：遍历媒体目录，产出待推送清单。
 *   - 单文件 >10MB 跳过并记录警告
 *   - 单次同步最多 50 个文件（按相对路径排序取前 50，其余留待下次，防超时）
 */
import * as fs from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { findMediaDir } from "./paths";

export const MAX_SINGLE_MEDIA = 10 * 1024 * 1024; // 单文件 >10MB 跳过
export const MAX_MEDIA_PER_SYNC = 50; // 单次同步最多 50 个媒体文件

export interface MediaEntry {
  /** posix 相对路径（不含 media/ 前缀） */
  rel: string;
  abs: string;
  size: number;
}

export interface SkippedMedia {
  rel: string;
  size: number;
  reason: string;
}

export interface MediaPlan {
  mediaDirFound: boolean;
  files: MediaEntry[];
  skipped: SkippedMedia[];
  /** 符合大小要求但因 50 个上限未纳入本次的文件数 */
  remaining: number;
  totalEligible: number;
}

async function walk(dir: string, root: string, out: { files: MediaEntry[]; skipped: SkippedMedia[] }): Promise<void> {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const abs = resolve(dir, item.name);
    if (item.isDirectory()) {
      await walk(abs, root, out);
      continue;
    }
    if (!item.isFile()) continue;
    const st = await fs.stat(abs);
    const rel = relative(root, abs).split(sep).join("/");
    if (st.size > MAX_SINGLE_MEDIA) {
      out.skipped.push({
        rel,
        size: st.size,
        reason: `单个文件超过 ${MAX_SINGLE_MEDIA / 1024 / 1024}MB，已跳过`,
      });
      continue;
    }
    out.files.push({ rel, abs, size: st.size });
  }
}

/** 收集本次同步的媒体清单（前 50 个） */
export async function collectMediaPlan(): Promise<MediaPlan> {
  const dir = await findMediaDir();
  if (!dir) {
    return { mediaDirFound: false, files: [], skipped: [], remaining: 0, totalEligible: 0 };
  }
  const collected = { files: [] as MediaEntry[], skipped: [] as SkippedMedia[] };
  await walk(dir, dir, collected);
  collected.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const batch = collected.files.slice(0, MAX_MEDIA_PER_SYNC);
  return {
    mediaDirFound: true,
    files: batch,
    skipped: collected.skipped,
    remaining: collected.files.length - batch.length,
    totalEligible: collected.files.length,
  };
}

/** 读取媒体文件为 base64 */
export async function readMediaBase64(abs: string): Promise<string> {
  const buf = await fs.readFile(abs);
  return buf.toString("base64");
}
