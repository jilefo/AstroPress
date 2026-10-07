import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_share_settings";
const CACHE_TTL_MS = 15_000; // 15 秒缓存，避免每个请求都查库

export interface SharePlatforms {
  wechat: boolean;
  weibo: boolean;
  qq: boolean;
  zhihu: boolean;
  twitter: boolean;
  facebook: boolean;
  linkedin: boolean;
  telegram: boolean;
  whatsapp: boolean;
  copylink: boolean;
}

export type SharePosition = "after" | "before" | "both";

export interface ShareSettings {
  enabled: boolean;
  heading: string;
  position: SharePosition;
  platforms: SharePlatforms;
}

export const DEFAULT_SETTINGS: ShareSettings = {
  enabled: true,
  heading: "分享这篇文章",
  position: "after",
  platforms: {
    wechat: true,
    weibo: true,
    qq: true,
    zhihu: false,
    twitter: true,
    facebook: false,
    linkedin: false,
    telegram: false,
    whatsapp: false,
    copylink: true,
  },
};

let cache: { data: ShareSettings; expires: number } | null = null;

function normalize(parsed: any): ShareSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    platforms: { ...DEFAULT_SETTINGS.platforms, ...(parsed?.platforms ?? {}) },
  };
}

export async function loadSettings(db: any): Promise<ShareSettings> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  let data: ShareSettings = DEFAULT_SETTINGS;
  try {
    data = normalize(JSON.parse(row?.value ?? "{}"));
  } catch {
    data = DEFAULT_SETTINGS;
  }
  cache = { data, expires: now + CACHE_TTL_MS };
  return data;
}

export async function saveSettings(db: any, data: Partial<ShareSettings>): Promise<ShareSettings> {
  const merged = normalize(data);
  const payload = JSON.stringify(merged);
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
  cache = { data: merged, expires: Date.now() + CACHE_TTL_MS };
  return merged;
}
