import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * 插件自有表（仅用于 drizzle 查询构造；建表走 ensureSchema 原生 DDL）。
 * 不修改核心 schema 文件。
 */
export const apLinkCats = sqliteTable("ap_link_cats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sort: integer("sort").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const apLinks = sqliteTable(
  "ap_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    catId: integer("cat_id").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    clicks: integer("clicks").notNull().default(0),
    status: text("status").notNull().default("pending"), // approved | pending
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    catIdx: index("ap_links_cat").on(table.catId, table.status),
  })
);

export type LinkStatus = "approved" | "pending";
export const LINK_STATUSES: LinkStatus[] = ["pending", "approved"];

/**
 * 惰性建表：模块级 promise 单例去重，首次访问时由管理 API / 公开页面各调用一次。
 * 失败后允许重试（ensured 复位为 null）。
 */
let ensured: Promise<void> | null = null;

export function ensureSchema(db: any): Promise<void> {
  if (!db) return Promise.reject(new Error("missing db"));
  if (!ensured) {
    ensured = (async () => {
      try {
        await db.run(sql`
          CREATE TABLE IF NOT EXISTS ap_link_cats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            sort INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )
        `);
        await db.run(sql`
          CREATE TABLE IF NOT EXISTS ap_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cat_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            clicks INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL
          )
        `);
        await db.run(sql`
          CREATE INDEX IF NOT EXISTS ap_links_cat
          ON ap_links (cat_id, status)
        `);
      } catch (err) {
        ensured = null;
        throw err;
      }
    })();
  }
  return ensured;
}
