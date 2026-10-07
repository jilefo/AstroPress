import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * FTS5 virtual table reference for TypeScript typing.
 * The actual table is created via raw SQL in migrations (not Drizzle schema).
 * See migrations/sqlite/0002_fts.sql
 */
export const wpFts = sqliteTable("wp_fts", {
  postId: integer("post_id").notNull(),
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  type: text("type").notNull().default("post"),
  status: text("status").notNull().default("publish"),
});
