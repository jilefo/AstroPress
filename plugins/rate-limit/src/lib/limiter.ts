/**
 * 进程内 IP 令牌桶限流器
 *
 * - Map<规则名|IP, 桶>，桶按窗口匀速补充令牌，上限 = 规则 limit
 * - 命中上限：记录该规则的拦截计数，返回 Retry-After 秒数
 * - 内存保护：桶数量超 MAX_KEYS 时惰性清理「已回满/可视为过期」的桶；
 *   极端情况下仍超限则按插入顺序淘汰最旧桶（仅重置计数，不泄漏内存）
 */

export interface LimitRule {
  name: string;
  limit: number;
  windowSec: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
  limit: number;
  windowMs: number;
}

const MAX_KEYS = 100_000;

const buckets = new Map<string, Bucket>();
/** 每规则拦截（命中上限）计数 */
const blocked = new Map<string, number>();

export interface ConsumeResult {
  allowed: boolean;
  retryAfterSec: number;
}

/** 消费 1 个令牌；allowed=false 时 retryAfterSec 为建议等待秒数 */
export function consume(ip: string, rule: LimitRule, now = Date.now()): ConsumeResult {
  const windowMs = Math.max(1, rule.windowSec) * 1000;
  const key = `${rule.name}|${ip}`;

  let b = buckets.get(key);
  if (!b || b.limit !== rule.limit || b.windowMs !== windowMs) {
    // 无桶或规则参数已变更：以满桶重新开始
    b = { tokens: rule.limit, updatedAt: now, limit: rule.limit, windowMs };
    buckets.set(key, b);
    sweep(now);
  }

  // 匀速补充令牌
  const elapsed = now - b.updatedAt;
  if (elapsed > 0) {
    b.tokens = Math.min(b.limit, b.tokens + (elapsed * b.limit) / b.windowMs);
    b.updatedAt = now;
  }

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  blocked.set(rule.name, (blocked.get(rule.name) ?? 0) + 1);
  const waitMs = ((1 - b.tokens) * b.windowMs) / b.limit;
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) };
}

/** Map 超限时清理：先删已回满的桶，仍超限再淘汰最旧 */
function sweep(now: number): void {
  if (buckets.size <= MAX_KEYS) return;
  for (const [k, b] of buckets) {
    const refilled = b.tokens + ((now - b.updatedAt) * b.limit) / b.windowMs;
    if (refilled >= b.limit) buckets.delete(k);
  }
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/** 统计快照：活跃桶数 + 每规则拦截计数（含已从设置中删除的规则的历史计数） */
export function stats(ruleNames: string[]): { buckets: number; blocked: Record<string, number> } {
  const per: Record<string, number> = {};
  for (const [name, count] of blocked) per[name] = count;
  for (const name of ruleNames) {
    if (!(name in per)) per[name] = 0;
  }
  return { buckets: buckets.size, blocked: per };
}

/** 清空全部桶与拦截计数，返回清除的桶数量 */
export function reset(): number {
  const cleared = buckets.size;
  buckets.clear();
  blocked.clear();
  return cleared;
}
