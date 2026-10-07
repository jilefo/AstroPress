/**
 * @astropress/core/permalink
 *
 * 固定链接（permalink）出站 URL 生成器 + 设置共享缓存。
 *
 * 背景：文章历史上出站链接固定为 /blog/{slug}；permalink 插件引入后，
 * /{slug} 可直达文章（404 时内部 rewrite 到 /blog/{slug} 渲染，URL 不变）。
 * 本模块统一出站形态：设置 enabled（默认 true）时文章出站链接为 /{slug}，
 * 旧 /blog/{slug} 由插件反向 301 迁移；enabled=false 时回退 /blog/{slug}。
 * 页面（page）始终为 /{slug}。
 *
 * 缓存策略仿 plugin-state：每进程每 15s 最多 1 次查询，保存设置后主动失效；
 * 失败策略 fail-open（按启用处理，与插件中间件的默认回落一致）。
 */
import { eq } from "drizzle-orm";
import { wpOptions } from "./schema";

const SETTINGS_KEY = "astropress_permalink_settings";
const DEFAULT_TTL_MS = 15_000;

export interface PermalinkSettings {
  /** 启用 /{slug} 直达文章（出站链接去 /blog/ 前缀） */
  enabled: boolean;
  /** 旧 /blog/{slug} 链接 301 迁移到 /{slug} */
  redirectOld: boolean;
}

export const DEFAULT_PERMALINK_SETTINGS: PermalinkSettings = {
  enabled: true,
  redirectOld: true,
};

let cache: { at: number; value: PermalinkSettings } | null = null;
let inflight: Promise<PermalinkSettings> | null = null;

async function load(db: any): Promise<PermalinkSettings> {
  const [row] = await db
    .select({ v: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  let value: PermalinkSettings;
  try {
    value = { ...DEFAULT_PERMALINK_SETTINGS, ...JSON.parse(row?.v ?? "{}") };
  } catch {
    value = { ...DEFAULT_PERMALINK_SETTINGS };
  }
  cache = { at: Date.now(), value };
  return value;
}

/** 读取固定链接设置（15s 进程级缓存 + 并发合并查询；异常回落默认值）。 */
export async function loadPermalinkSettings(
  db: any,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<PermalinkSettings> {
  try {
    let snapshot = cache?.value;
    if (!snapshot || Date.now() - (cache?.at ?? 0) > ttlMs) {
      inflight ??= load(db).finally(() => {
        inflight = null;
      });
      snapshot = await inflight;
    }
    return snapshot;
  } catch {
    return { ...DEFAULT_PERMALINK_SETTINGS }; // fail-open
  }
}

/** 主动清空缓存（设置保存后调用，本进程立即生效；跨进程最坏 15s TTL）。 */
export function invalidatePermalinkSettings(): void {
  cache = null;
  inflight = null;
}

/**
 * 文章（post）出站链接：permalink 启用 → /{slug}；否则 → /blog/{slug}。
 * settings 缺省/异常时按启用处理（与 fail-open 一致）。
 */
export function postPath(slug: string, settings?: PermalinkSettings | null): string {
  return settings?.enabled === false ? "/blog/" + slug : "/" + slug;
}

/** 页面（page）出站链接：恒为 /{slug}。 */
export function pagePath(slug: string): string {
  return "/" + slug;
}
