import { sql } from "drizzle-orm";

/**
 * 惰性建表：模块级 promise 单例去重，首次访问时由管理 API / 后台中间件各调用一次。
 * 参数 db 任意即可（locals.db 由应用中间件对所有路由注入）；失败后允许重试。
 */
let ensured: Promise<void> | null = null;

export function ensureSchema(db: any): Promise<void> {
  if (!db) return Promise.reject(new Error("missing db"));
  if (!ensured) {
    ensured = (async () => {
      try {
        await db.run(sql`
          CREATE TABLE IF NOT EXISTS ap_activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            user TEXT NOT NULL DEFAULT '',
            method TEXT NOT NULL DEFAULT '',
            path TEXT NOT NULL DEFAULT '',
            status INTEGER NOT NULL DEFAULT 0,
            ip TEXT NOT NULL DEFAULT '',
            ua TEXT NOT NULL DEFAULT ''
          )
        `);
      } catch (err) {
        ensured = null;
        throw err;
      }
    })();
  }
  return ensured;
}
