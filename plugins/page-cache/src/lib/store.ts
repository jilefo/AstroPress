/**
 * 进程内 LRU 全页缓存单例（类似 WP Super Cache 的简单模式）
 *
 * - Map 的插入顺序即 LRU 顺序：get 命中时 delete + set 提升到最新
 * - 过期条目惰性删除；set 超限时淘汰最旧条目
 * - hits/misses/purges 为模块级计数，purge 不清零
 */

export interface CacheEntry {
  body: string;
  status: number;
  statusText: string;
  contentType: string;
  expires: number;
  /** 入库时间戳（ms），用于跨 isolate 纪元校验：cachedAt 早于全局纪元即视为陈旧 */
  cachedAt: number;
}

export interface CacheStats {
  entries: number;
  maxEntries: number;
  hits: number;
  misses: number;
  purges: number;
  bytes: number;
}

const cache = new Map<string, CacheEntry>();

let limit = 500;
let hits = 0;
let misses = 0;
let purges = 0;

/** 读取缓存；过期或不存在返回 undefined，命中时刷新 LRU 顺序 */
export function get(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // delete + set：把命中项移到 Map 末尾（最新）
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

/** 写入缓存；maxEntries 同步更新容量，超限时从 Map 头部（最旧）淘汰 */
export function set(key: string, entry: CacheEntry, maxEntries?: number): void {
  if (typeof maxEntries === "number" && Number.isInteger(maxEntries) && maxEntries > 0) {
    limit = maxEntries;
  }
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 清空全部缓存，返回清除条数；purges 计数累加（不清零） */
export function clear(): number {
  const cleared = cache.size;
  cache.clear();
  purges += 1;
  return cleared;
}

/**
 * 统计快照。
 * hits/misses 通过 getter/setter 暴露为活绑定，中间件可直接 stats.hits++ 落到模块级计数；
 * bytes 统计所有未过期 body 长度之和，全程容错，任何异常都不抛出。
 */
export function stats(): CacheStats {
  try {
    const now = Date.now();
    let bytes = 0;
    for (const [, entry] of cache) {
      if (entry.expires <= now) continue;
      try {
        bytes += typeof entry.body === "string" ? entry.body.length : 0;
      } catch {
        /* ignore 单项长度异常 */
      }
    }
    return {
      entries: cache.size,
      maxEntries: limit,
      get hits() {
        return hits;
      },
      set hits(v: number) {
        hits = v;
      },
      get misses() {
        return misses;
      },
      set misses(v: number) {
        misses = v;
      },
      get purges() {
        return purges;
      },
      bytes,
    };
  } catch {
    return { entries: 0, maxEntries: limit, hits, misses, purges, bytes: 0 };
  }
}
