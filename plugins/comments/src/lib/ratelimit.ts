import { sql } from "drizzle-orm";
import { sqlRun } from "@astropress/core";

/**
 * 反垃圾频控：同 IP 30 秒内最多 3 条（仅对字段合法的提交计数）。
 *
 * 旧实现为进程内 Map —— 在 Cloudflare Workers 多 isolate 下计数分散，
 * 连续提交被负载均衡到不同 isolate 后各自不足 3 条，限流形同虚设。
 * 现改为 D1 滑动窗口：单条 INSERT..SELECT 原子完成「计数判定 + 记录」
 * （SQLite 语句级原子性，无 read-modify-write 竞态），跨 isolate 一致。
 */
const WINDOW_MS = 30_000;
const MAX_HITS = 3;
/** 约 5% 请求顺带清理过期记录，避免表无限增长 */
const SWEEP_PROBABILITY = 0.05;

export async function checkRateLimit(db: any, ip: string, now = Date.now()): Promise<boolean> {
  if (!db) return true; // 无 db 时放行（上游已 503）
  const key = (ip || "anon").slice(0, 45);
  const cutoff = now - WINDOW_MS;
  try {
    if (Math.random() < SWEEP_PROBABILITY) {
      await sqlRun(db, sql`DELETE FROM ap_comment_rate WHERE ts < ${cutoff}`);
    }
    // 原子判定+写入：窗口内已有记录 < MAX_HITS 才插入成功（changes=1）
    const meta = await sqlRun(db, sql`
      INSERT INTO ap_comment_rate (ip, ts)
      SELECT ${key}, ${now}
      WHERE (SELECT COUNT(*) FROM ap_comment_rate WHERE ip = ${key} AND ts >= ${cutoff}) < ${MAX_HITS}
    `);
    return meta.changes > 0;
  } catch {
    // 频控存储故障时放行，不阻塞正常评论（评论表有蜜罐+审核兜底）
    return true;
  }
}

// 兼容旧签名占位（原内存实现的重置钩子）
export function _resetRateLimit(): void {}
