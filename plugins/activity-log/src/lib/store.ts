import { sql } from "drizzle-orm";
import { sqlOne } from "@astropress/core";
import { ensureSchema } from "./schema";

/**
 * 审计日志写入
 *
 * - 单条 INSERT，无 N+1
 * - 摊销清理：每次写入按 1/50 概率检查表大小，超 MAX_ROWS 时删除最旧 TRIM_BATCH 行
 */

const MAX_ROWS = 50_000;
const TRIM_BATCH = 10_000;
const TRIM_PROBABILITY = 1 / 50;

export interface ActivityEntry {
  user: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  ua: string;
}

export async function record(db: any, entry: ActivityEntry): Promise<void> {
  await ensureSchema(db);
  await db.run(sql`
    INSERT INTO ap_activity_log (ts, user, method, path, status, ip, ua)
    VALUES (
      ${new Date().toISOString()},
      ${entry.user},
      ${entry.method},
      ${entry.path},
      ${entry.status},
      ${entry.ip},
      ${entry.ua}
    )
  `);

  if (Math.random() < TRIM_PROBABILITY) {
    try {
      const row = await sqlOne(db, sql`SELECT COUNT(*) AS c FROM ap_activity_log`);
      const total = Number(row?.c ?? 0);
      if (Number.isFinite(total) && total > MAX_ROWS) {
        await db.run(sql`
          DELETE FROM ap_activity_log
          WHERE id IN (SELECT id FROM ap_activity_log ORDER BY id ASC LIMIT ${TRIM_BATCH})
        `);
      }
    } catch {
      /* 裁剪失败静默，不影响主请求 */
    }
  }
}
