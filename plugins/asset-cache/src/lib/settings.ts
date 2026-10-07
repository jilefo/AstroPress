import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_asset_cache_settings";
const CACHE_TTL = 15_000;

export const MIN_MAX_AGE = 0;
export const MAX_MAX_AGE = 31_536_000; // 1 年（秒）
export const MAX_EXTRA_RULES = 30;
export const EXT_MAX_LEN = 10;

/** 内置静态扩展名（命中后使用 staticMaxAge） */
export const STATIC_EXTS = [
  "css", "js", "woff", "woff2", "ttf", "otf",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif",
  "mp4", "mp3",
];

export interface ExtraRule {
  /** 小写扩展名（不含点） */
  ext: string;
  maxAge: number;
}

export interface AssetCacheSettings {
  enabled: boolean;
  /** /_astro/* 的 max-age（秒），始终附带 immutable；0 = 不设置 */
  astroMaxAge: number;
  /** /media/* 的 max-age（秒）；0 = 不设置 */
  mediaMaxAge: number;
  /** 内置静态扩展名的 max-age（秒）；0 = 不设置 */
  staticMaxAge: number;
  /** 上游已有非默认 Cache-Control 时仍强制覆盖 */
  forceOverride: boolean;
  /** 附加自定义扩展名 → max-age 映射（优先于内置扩展名） */
  extraRules: ExtraRule[];
}

export const DEFAULT_SETTINGS: AssetCacheSettings = {
  enabled: true,
  astroMaxAge: 31_536_000,
  mediaMaxAge: 604_800,
  staticMaxAge: 86_400,
  forceOverride: false,
  extraRules: [],
};

let cache: AssetCacheSettings | null = null;
let cacheAt = 0;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** 扩展名规范化：小写、去点、仅字母数字，超长截断；非法返回空串 */
function normalizeExt(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase().replace(/^\.+/, "");
  if (!/^[a-z0-9]+$/.test(s)) return "";
  return s.slice(0, EXT_MAX_LEN);
}

function normalizeRules(data: unknown): ExtraRule[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const rules: ExtraRule[] = [];
  for (const item of data) {
    if (rules.length >= MAX_EXTRA_RULES) break;
    const ext = normalizeExt((item as any)?.ext);
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    rules.push({
      ext,
      maxAge: clampInt((item as any)?.maxAge, MIN_MAX_AGE, MAX_MAX_AGE, DEFAULT_SETTINGS.staticMaxAge),
    });
  }
  return rules;
}

/** POST 入参归一化：数值边界 + extraRules 去重/限项 */
export function normalizeSettings(data: any): AssetCacheSettings {
  return {
    enabled: !!data?.enabled,
    astroMaxAge: clampInt(data?.astroMaxAge, MIN_MAX_AGE, MAX_MAX_AGE, DEFAULT_SETTINGS.astroMaxAge),
    mediaMaxAge: clampInt(data?.mediaMaxAge, MIN_MAX_AGE, MAX_MAX_AGE, DEFAULT_SETTINGS.mediaMaxAge),
    staticMaxAge: clampInt(data?.staticMaxAge, MIN_MAX_AGE, MAX_MAX_AGE, DEFAULT_SETTINGS.staticMaxAge),
    forceOverride: !!data?.forceOverride,
    extraRules: normalizeRules(data?.extraRules),
  };
}

export async function loadSettings(db: any): Promise<AssetCacheSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<AssetCacheSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const merged = { ...DEFAULT_SETTINGS, ...parsed };
  const settings: AssetCacheSettings = {
    ...merged,
    extraRules: normalizeRules(parsed.extraRules),
  };
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<AssetCacheSettings>): Promise<AssetCacheSettings> {
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
