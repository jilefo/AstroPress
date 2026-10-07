import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * 插件自有表 ap_comments（仅用于 drizzle 查询构造；建表走 ensureSchema 原生 DDL）。
 * 不修改核心 schema 文件。
 */
export const apComments = sqliteTable(
  "ap_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id").notNull(),
    parent: integer("parent").notNull().default(0),
    author: text("author").notNull(),
    email: text("email").notNull(),
    website: text("website").notNull().default(""),
    content: text("content").notNull(),
    status: text("status").notNull().default("pending"), // approved | pending | spam | trash
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    postIdx: index("ap_comments_post").on(table.postId, table.status, table.createdAt),
  })
);

export type CommentStatus = "approved" | "pending" | "spam" | "trash";
export const COMMENT_STATUSES: CommentStatus[] = ["pending", "approved", "spam", "trash"];

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
          CREATE TABLE IF NOT EXISTS ap_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            parent INTEGER NOT NULL DEFAULT 0,
            author TEXT NOT NULL,
            email TEXT NOT NULL,
            website TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            ip TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
          )
        `);
        await db.run(sql`
          CREATE INDEX IF NOT EXISTS ap_comments_post
          ON ap_comments (post_id, status, created_at)
        `);
        await db.run(sql`
          CREATE TABLE IF NOT EXISTS ap_comment_rate (
            ip TEXT NOT NULL,
            ts INTEGER NOT NULL
          )
        `);
        await db.run(sql`
          CREATE INDEX IF NOT EXISTS ap_comment_rate_ip
          ON ap_comment_rate (ip, ts)
        `);
      } catch (err) {
        ensured = null;
        throw err;
      }
    })();
  }
  return ensured;
}
