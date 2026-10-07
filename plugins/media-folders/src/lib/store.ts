import { sql } from "drizzle-orm";
import { sqlAll, sqlOne, sqlRun } from "@astropress/core";

let ensured = false;

export async function ensureTable(db: any): Promise<void> {
  if (ensured) return;
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS ap_media_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      parent_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    ensured = true;
  } catch { /* 已存在 */ }
}

export async function listFolders(db: any): Promise<any[]> {
  await ensureTable(db);
  try {
    return await sqlAll(db, sql`SELECT * FROM ap_media_folders ORDER BY parent_id, name`);
  } catch { return []; }
}

export async function createFolder(db: any, name: string, parentId: number | null): Promise<number> {
  await ensureTable(db);
  const meta = await sqlRun(
    db,
    sql`INSERT INTO ap_media_folders (name, parent_id) VALUES (${name}, ${parentId})`
  );
  return Number(meta.lastRowId ?? 0);
}

export async function renameFolder(db: any, id: number, name: string): Promise<void> {
  await ensureTable(db);
  await db.run(sql`UPDATE ap_media_folders SET name = ${name} WHERE id = ${id}`);
}

export async function deleteFolder(db: any, id: number): Promise<void> {
  await ensureTable(db);
  // 将文件夹内的媒体移至未分类
  await db.run(sql`UPDATE wp_postmeta SET meta_value = '' WHERE meta_key = '_media_folder_id' AND meta_value = ${String(id)}`);
  // 子文件夹移至顶级
  await db.run(sql`UPDATE ap_media_folders SET parent_id = NULL WHERE parent_id = ${id}`);
  await db.run(sql`DELETE FROM ap_media_folders WHERE id = ${id}`);
}

export async function moveMedia(db: any, mediaIds: number[], folderId: number | null): Promise<void> {
  await ensureTable(db);
  for (const mid of mediaIds) {
    const val = folderId !== null ? String(folderId) : "";
    // 检查是否已有 _media_folder_id meta
    const existing = await sqlOne(
      db,
      sql`SELECT meta_id FROM wp_postmeta WHERE post_id = ${mid} AND meta_key = '_media_folder_id' LIMIT 1`
    );
    if (existing) {
      await db.run(sql`UPDATE wp_postmeta SET meta_value = ${val} WHERE post_id = ${mid} AND meta_key = '_media_folder_id'`);
    } else {
      await db.run(sql`INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (${mid}, '_media_folder_id', ${val})`);
    }
  }
}
