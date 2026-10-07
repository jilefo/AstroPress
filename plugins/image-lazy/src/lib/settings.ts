import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_image_lazy_settings";
const CACHE_TTL = 15_000;

export const DEFAULT_SETTINGS = {
  enabled: true,
  lazyImages: true,
  lazyIframes: true,
  skipFirst: 1,
};

export interface ImageLazySettings {
  enabled: boolean;
  lazyImages: boolean;
  lazyIframes: boolean;
  /** 跳过正文前 N 张图片不处理（首屏 LCP），边界 0~20 整数 */
  skipFirst: number;
}

/** 规整 skipFirst：0~20 的整数，非法值回退默认 */
export function clampSkipFirst(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.skipFirst;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  if (i > 20) return 20;
  return i;
}

function normalize(parsed: Partial<ImageLazySettings>): ImageLazySettings {
  return {
    enabled: parsed.enabled !== false,
    lazyImages: parsed.lazyImages !== false,
    lazyIframes: parsed.lazyIframes !== false,
    skipFirst: clampSkipFirst(parsed.skipFirst ?? DEFAULT_SETTINGS.skipFirst),
  };
}

let cache: ImageLazySettings | null = null;
let cacheAt = 0;

export async function loadSettings(db: any): Promise<ImageLazySettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<ImageLazySettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings = normalize(parsed);
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<ImageLazySettings>): Promise<ImageLazySettings> {
  const settings = normalize({ ...DEFAULT_SETTINGS, ...data });
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
