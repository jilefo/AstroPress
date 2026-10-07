import { sql } from "drizzle-orm";

/**
 * 惰性建表：模块级 promise 单例去重，首次访问时由管理 API / 前台中间件各调用一次。
 * 参数 db 任意即可（locals.db 由应用中间件对所有路由注入）；失败后允许重试。
 */
let ensured: Promise<void> | null = null;

export function ensureSchema(db: any): Promise<void> {
  if (!db) return Promise.reject(new Error("missing db"));
  if (!ensured) {
    ensured = (async () => {
      try {
        await db.run(sql`
          CREATE TABLE IF NOT EXISTS ap_404_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            referer TEXT NOT NULL DEFAULT '',
            hits INTEGER NOT NULL DEFAULT 1,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
          )
        `);
        await db.run(sql`
          CREATE INDEX IF NOT EXISTS ap_404_last ON ap_404_log (last_seen)
        `);
        await db.run(sql`
          CREATE INDEX IF NOT EXISTS ap_404_hits ON ap_404_log (hits)
        `);
      } catch (err) {
        ensured = null;
        throw err;
      }
    })();
  }
  return ensured;
}
