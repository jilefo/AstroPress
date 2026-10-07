import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_page_cache_settings";
const CACHE_TTL = 15_000;

export const MIN_TTL = 1;
export const MAX_TTL = 86_400;
export const MIN_MAX_ENTRIES = 10;
export const MAX_MAX_ENTRIES = 5_000;
export const MAX_EXCLUDES = 30;
export const EXCLUDE_MAX_LEN = 200;

export const DEFAULT_SETTINGS = {
  enabled: true,
  ttlSec: 300,
  maxEntries: 500,
  cache404: false,
  cacheWithQuery: false,
  excludes: ["/search", "/feed", "/sitemap"],
};

export interface PageCacheSettings {
  enabled: boolean;
  ttlSec: number;
  maxEntries: number;
  cache404: boolean;
  cacheWithQuery: boolean;
  excludes: string[];
}

let cache: PageCacheSettings | null = null;
let cacheAt = 0;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** POST 入参归一化：数值边界 + excludes 截断/限项 */
export function normalizeSettings(data: any): PageCacheSettings {
  const excludes = Array.isArray(data?.excludes)
    ? data.excludes
        .map((x: unknown) => String(x ?? "").slice(0, EXCLUDE_MAX_LEN))
        .filter((x: string) => x.length > 0)
        .slice(0, MAX_EXCLUDES)
    : [];

  return {
    enabled: !!data?.enabled,
    ttlSec: clampInt(data?.ttlSec, MIN_TTL, MAX_TTL, DEFAULT_SETTINGS.ttlSec),
    maxEntries: clampInt(data?.maxEntries, MIN_MAX_ENTRIES, MAX_MAX_ENTRIES, DEFAULT_SETTINGS.maxEntries),
    cache404: !!data?.cache404,
    cacheWithQuery: !!data?.cacheWithQuery,
    excludes,
  };
}

export async function loadSettings(db: any): Promise<PageCacheSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<PageCacheSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings: PageCacheSettings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    excludes: Array.isArray(parsed.excludes)
      ? parsed.excludes.slice(0, MAX_EXCLUDES)
      : DEFAULT_SETTINGS.excludes.slice(),
  };
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<PageCacheSettings>): Promise<PageCacheSettings> {
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
