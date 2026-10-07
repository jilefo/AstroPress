import type { APIRoute } from "astro";
import { unzipSync, strFromU8 } from "fflate";
import * as fs from "node:fs/promises";
import {
  MAX_UPLOAD,
  backupPath,
  isSafeBackupName,
  restoreDatabase,
  restoreMediaFiles,
} from "../../lib/backup-core";
import { json, sameOrigin } from "../../lib/http";
import { findMediaDir } from "../../lib/paths";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * POST /admin-ext/api/backup/restore（multipart/form-data）
 *   file     可选：上传的 .apzip
 *   existing 可选：backups/ 内既有备份文件名（与 file 二选一）
 *   db       "true" 恢复数据库（执行 dump.sql）
 *   media    "true" 恢复媒体文件
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("备份与恢复");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "请求必须是 multipart/form-data" }, 400);
  }

  const wantDb = form.get("db") === "true";
  const wantMedia = form.get("media") === "true";
  if (!wantDb && !wantMedia) return json({ error: "至少选择一项恢复内容" }, 400);

  // ─── 获取备份字节：上传文件优先，其次既有备份 ───
  let bytes: Uint8Array;
  let sourceName: string;
  const uploaded = form.get("file");
  const existing = form.get("existing");

  if (uploaded instanceof File) {
    if (!uploaded.name.toLowerCase().endsWith(".apzip")) {
      return json({ error: "只支持 .apzip 备份文件" }, 400);
    }
    if (uploaded.size > MAX_UPLOAD) {
      return json({ error: "上传备份不能超过 1GB" }, 413);
    }
    bytes = new Uint8Array(await uploaded.arrayBuffer());
    sourceName = uploaded.name;
  } else if (typeof existing === "string" && existing) {
    if (!isSafeBackupName(existing)) return json({ error: "非法的备份文件名" }, 400);
    try {
      bytes = new Uint8Array(await fs.readFile(backupPath(existing)));
    } catch {
      return json({ error: "指定的备份不存在" }, 404);
    }
    sourceName = existing;
  } else {
    return json({ error: "请上传备份文件或选择一份既有备份" }, 400);
  }

  // ─── 解压 ───
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return json({ error: "备份文件无法解压，请确认是本插件生成的 .apzip" }, 400);
  }

  const errors: string[] = [];
  let statements = 0;
  let mediaFiles = 0;
  let skippedMedia: string[] = [];

  // ─── 数据库逻辑恢复 ───
  if (wantDb) {
    const dumpBytes = entries["dump.sql"];
    if (!dumpBytes) {
      errors.push("备份中缺少 dump.sql，无法恢复数据库");
    } else {
      const dump = strFromU8(dumpBytes);
      const r = await restoreDatabase(db, dump);
      statements = r.statements;
      errors.push(...r.errors);
    }
  }

  // ─── 媒体恢复（zip-slip 校验在内部完成） ───
  if (wantMedia) {
    const mediaDir = await findMediaDir();
    if (!mediaDir) {
      errors.push("未找到媒体目录 apps/admin/public/media，已跳过媒体恢复");
    } else {
      const hasMedia = Object.keys(entries).some((k) => k.startsWith("media/"));
      if (!hasMedia) {
        errors.push("该备份不包含媒体文件（可能创建时未勾选）");
      }
      const r = await restoreMediaFiles(entries, mediaDir);
      mediaFiles = r.mediaFiles;
      skippedMedia = r.skipped;
      errors.push(...r.errors);
    }
  }

  return json({
    ok: errors.length === 0,
    source: sourceName,
    restored: { statements, mediaFiles, skippedMedia },
    errors,
  });
};
