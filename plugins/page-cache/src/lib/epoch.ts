/**
 * 跨 isolate 缓存纪元（D1 持久化 + 进程内 2s TTL 缓存）
 *
 * 问题：CF Workers 多 isolate 各自持有进程内 LRU 缓存。写操作（如评论审批）
 * 只清空本 isolate 的缓存，其余 isolate 继续返回旧页面直到 TTL 过期。
 * 方案：每次写操作把全局纪元（epoch）写入 wp_options；各 isolate 的 HIT
 * 校验缓存入库时间晚于纪元才有效，否则视为 MISS 重新渲染。
 * 纪元读取带 2s 进程内缓存（V8 收口：写后全局可见窗口 ≤2s。D1 读放大为
 * 每 isolate 每 2s 至多 1 次，摊薄后可忽略。曾评估 Durable Object 纪元权威源
 * 方案——@astrojs/cloudflare 11.2 不支持自定义 DO 导出，需构建链注入，风险大，
 * 留档暂不采用）；任何异常 fail-open（epoch=0，所有条目有效），绝不影响可用性。
 */
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const EPOCH_KEY = "ap_page_cache_epoch";
const TTL_MS = 2_000;

let cached = 0;
let cachedAt = 0;
let inflight: Promise<number> | null = null;

async function fetchEpoch(db: any): Promise<number> {
  try {
    const [row] = await db
      .select({ optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, EPOCH_KEY))
      .limit(1);
    const v = parseInt(String(row?.optionValue ?? "0"), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** 读取全局纪元（2s 进程内缓存 + 并发合并 + fail-open，写后跨 isolate 可见窗口 ≤2s） */
export async function getEpoch(db: any): Promise<number> {
  if (Date.now() - cachedAt <= TTL_MS) return cached;
  if (!inflight) {
    inflight = fetchEpoch(db).then((v) => {
      cached = v;
      cachedAt = Date.now();
      inflight = null;
      return v;
    });
  }
  return inflight;
}

/** 写操作后 bump 全局纪元；同时刷新进程内缓存使本 isolate 立即生效 */
export async function bumpEpoch(db: any): Promise<void> {
  const now = Date.now();
  try {
    await db
      .insert(wpOptions)
      .values({ optionName: EPOCH_KEY, optionValue: String(now), autoload: "no" })
      .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: String(now) } });
  } catch {
    /* fail-open：纪元写失败仅意味着其他 isolate 可能晚一拍失效 */
  }
  cached = now;
  cachedAt = now;
}
