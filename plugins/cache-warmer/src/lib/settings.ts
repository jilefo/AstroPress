import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_cache_warmer_settings";
const CACHE_TTL = 15_000;

export const MIN_URL_COUNT = 1;
export const MAX_URL_COUNT = 200;
export const BASE_URL_MAX_LEN = 200;
export const INTERVAL_CHOICES = [0, 1, 6, 24];

export const DEFAULT_SETTINGS = {
  baseUrl: "http://localhost:4321",
  urlCount: 50,
  intervalHours: 0,
  enabled: true,
};

export interface CacheWarmerSettings {
  /** 站点基址（如 http://localhost:4321），预热请求发向该地址 */
  baseUrl: string;
  /** 每批最多抓取的 URL 数（首页 + sitemap 前 N 个），上限 200 */
  urlCount: number;
  /** 定时预热间隔（小时）：0=关，1/6/24 */
  intervalHours: number;
  /** 定时预热总开关（手动预热不受影响） */
  enabled: boolean;
}

let cache: CacheWarmerSettings | null = null;
let cacheAt = 0;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function normalizeBaseUrl(value: unknown): string {
  let s = String(value ?? "").trim().slice(0, BASE_URL_MAX_LEN);
  s = s.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) return DEFAULT_SETTINGS.baseUrl;
  return s;
}

/** POST 入参归一化：baseUrl 校验协议、urlCount 边界、intervalHours 仅允许 0/1/6/24 */
export function normalizeSettings(data: any): CacheWarmerSettings {
  const rawInterval = clampInt(data?.intervalHours, 0, 24, DEFAULT_SETTINGS.intervalHours);
  return {
    baseUrl: normalizeBaseUrl(data?.baseUrl),
    urlCount: clampInt(data?.urlCount, MIN_URL_COUNT, MAX_URL_COUNT, DEFAULT_SETTINGS.urlCount),
    intervalHours: INTERVAL_CHOICES.includes(rawInterval) ? rawInterval : DEFAULT_SETTINGS.intervalHours,
    enabled: !!data?.enabled,
  };
}

export async function loadSettings(db: any): Promise<CacheWarmerSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<CacheWarmerSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings: CacheWarmerSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<CacheWarmerSettings>): Promise<CacheWarmerSettings> {
  const settings = normalizeSettings(data);
  const payload = JSON.stringify(settings);

  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  if (row) {
    await db.update(wpOptions).set({ optionValue: payload }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: SETTINGS_KEY, optionValue: payload });
  }

  cache = null;
  cacheAt = 0;
  return settings;
}
