import { sql } from "drizzle-orm";

/**
 * 惰性建表：模块级 promise 单例去重，首次访问时由后台中间件 / 管理 API 各调用一次。
 * 参数 db 任意即可（locals.db 由应用中间件对所有路由注入）；失败后允许重试。
 */
let ensured: Promise<void> | null = null;

export function ensureSchema(db: any): Promise<void> {
  if (!db) return Promise.reject(new Error("missing db"));
  if (!ensured) {
    ensured = (async () => {
      try {
        await db.run(sql`
          CREATE TABLE IF NOT EXISTS ap_post_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            excerpt TEXT NOT NULL DEFAULT '',
            saved_at TEXT NOT NULL,
            editor TEXT NOT NULL DEFAULT ''
          )
        `);
        await db.run(sql`
          CREATE INDEX IF NOT EXISTS ap_post_revisions_post ON ap_post_revisions (post_id)
        `);
      } catch (err) {
        ensured = null;
        throw err;
      }
    })();
  }
  return ensured;
}

export interface RevisionSnapshot {
  title: string;
  content: string;
  excerpt: string;
  status: string;
}

/** 每篇文章保留的版本上限 */
export const MAX_REVISIONS_PER_POST = 20;

/** 写入一条旧版本快照，并按 post_id 裁剪超出上限的最旧版本 */
export async function insertRevision(
  db: any,
  postId: number,
  snap: RevisionSnapshot,
  editor: string
): Promise<void> {
  const savedAt = new Date().toISOString();
  await db.run(sql`
    INSERT INTO ap_post_revisions (post_id, title, content, excerpt, saved_at, editor)
    VALUES (${postId}, ${snap.title}, ${snap.content}, ${snap.excerpt}, ${savedAt}, ${editor})
  `);
  await db.run(sql`
    DELETE FROM ap_post_revisions
    WHERE post_id = ${postId}
      AND id NOT IN (
        SELECT id FROM ap_post_revisions
        WHERE post_id = ${postId}
        ORDER BY id DESC
        LIMIT ${MAX_REVISIONS_PER_POST}
      )
  `);
}
