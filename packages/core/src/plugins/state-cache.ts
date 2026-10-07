/**
 * @astropress/core/plugin-state
 *
 * 插件启停状态（wp_options.astropress_plugin_states）的进程级共享缓存。
 *
 * 背景（F 轮任务8 性能优化）：此前每个前台中间件各自维护一份 15s 缓存，
 * 一次冷请求要让 N 个插件各查一次同一行 option；且插件停用后最坏要等 15s 才生效。
 * 本模块把状态读取收敛为「每进程每 15s 最多 1 次查询」，并提供主动失效：
 * 插件管理器在同一进程内改状态后立即 invalidate，前台零延迟生效；
 * 跨进程（如独立的 web 进程）最坏仍退化回 15s TTL，语义不变。
 *
 * 失败策略保持 fail-open：任何异常都视为「插件启用」，绝不让状态查询故障拖垮页面。
 */
import { eq } from "drizzle-orm";
import { wpOptions } from "../schema";

const STATES_KEY = "astropress_plugin_states";
const DEFAULT_TTL_MS = 15_000;

interface StateCache {
  at: number;
  map: Record<string, boolean>;
}

let cache: StateCache | null = null;
let inflight: Promise<StateCache> | null = null;

async function load(db: any): Promise<StateCache> {
  const [row] = await db
    .select({ v: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, STATES_KEY))
    .limit(1);
  let map: Record<string, boolean> = {};
  try {
    map = row?.v ? JSON.parse(row.v) : {};
  } catch {
    map = {};
  }
  cache = { at: Date.now(), map };
  return cache;
}

/** 该插件是否被管理器禁用（显式 false 才算禁用；缺省/异常均视为启用）。 */
export async function isPluginDisabled(db: any, slug: string, ttlMs = DEFAULT_TTL_MS): Promise<boolean> {
  try {
    let snapshot = cache;
    if (!snapshot || Date.now() - snapshot.at > ttlMs) {
      // 并发合并：同一时刻多个中间件只触发一次查询
      inflight ??= load(db).finally(() => {
        inflight = null;
      });
      snapshot = await inflight;
    }
    return snapshot.map?.[slug] === false;
  } catch {
    return false; // fail-open
  }
}

/** 主动清空缓存（插件状态变更后调用，使本进程前台立即生效）。 */
export function invalidatePluginStates(): void {
  cache = null;
  inflight = null;
}
