import { sql } from "drizzle-orm";
import { sqlAll, sqlOne } from "@astropress/core";

let ensured = false;

/** 惰性建表 */
export async function ensureTable(db: any): Promise<void> {
  if (ensured) return;
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS ap_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER NOT NULL DEFAULT 0
    )`);
    ensured = true;
  } catch { /* 已存在或无权限 */ }
}

/** 创建通知 */
export async function createNotification(db: any, data: {
  type: string; title: string; message: string; link?: string; userId?: number;
}): Promise<void> {
  await ensureTable(db);
  try {
    await db.run(sql`INSERT INTO ap_notifications (type, title, message, link, user_id)
      VALUES (${data.type}, ${data.title}, ${data.message}, ${data.link ?? ""}, ${data.userId ?? 0})`);
    // 裁剪：>500 条时删除最旧的已读通知
    await db.run(sql`DELETE FROM ap_notifications WHERE is_read = 1 AND id NOT IN
      (SELECT id FROM ap_notifications ORDER BY id DESC LIMIT 400)`);
  } catch { /* 写入失败静默 */ }
}

/** 查询通知列表（按用户过滤：广播 user_id=0 对所有人可见，定向通知仅本人可见） */
export async function listNotifications(db: any, opts: {
  page: number; perPage: number; filter?: string; userId: number;
}): Promise<{ items: any[]; total: number }> {
  await ensureTable(db);
  const offset = (opts.page - 1) * opts.perPage;
  const scope = sql`(user_id = 0 OR user_id = ${opts.userId})`;
  let cond = sql`WHERE ${scope}`;
  if (opts.filter === "unread") cond = sql`WHERE ${scope} AND is_read = 0`;
  else if (opts.filter === "read") cond = sql`WHERE ${scope} AND is_read = 1`;

  try {
    const countRow = await sqlOne(
      db,
      sql`SELECT COUNT(*) as c FROM ap_notifications ${cond}`
    );
    const total = Number((countRow as any)?.c ?? 0);

    const items = await sqlAll(
      db,
      sql`SELECT * FROM ap_notifications ${cond} ORDER BY id DESC LIMIT ${opts.perPage} OFFSET ${offset}`
    );
    return { items, total };
  } catch {
    return { items: [], total: 0 };
  }
}

/** 标记已读（仅限广播或本人通知） */
export async function markRead(db: any, ids: number[], userId: number): Promise<void> {
  await ensureTable(db);
  if (!ids.length) return;
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  await db.run(
    sql`UPDATE ap_notifications SET is_read = 1 WHERE id IN (${idList}) AND (user_id = 0 OR user_id = ${userId})`
  ).catch(() => {});
}

/** 全部标记已读（仅限广播或本人通知） */
export async function markAllRead(db: any, userId: number): Promise<void> {
  await ensureTable(db);
  await db.run(
    sql`UPDATE ap_notifications SET is_read = 1 WHERE is_read = 0 AND (user_id = 0 OR user_id = ${userId})`
  ).catch(() => {});
}

/** 删除通知 */
export async function deleteNotifications(db: any, ids: number[]): Promise<void> {
  await ensureTable(db);
  if (!ids.length) return;
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  await db.run(sql`DELETE FROM ap_notifications WHERE id IN (${idList})`).catch(() => {});
}

/** 未读数量（按用户过滤：广播 + 本人） */
export async function unreadCount(db: any, userId: number): Promise<number> {
  await ensureTable(db);
  try {
    const row = await sqlOne(
      db,
      sql`SELECT COUNT(*) as c FROM ap_notifications WHERE is_read = 0 AND (user_id = 0 OR user_id = ${userId})`
    );
    return Number((row as any)?.c ?? 0);
  } catch {
    return 0;
  }
}
