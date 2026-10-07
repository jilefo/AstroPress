import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { invalidatePermalinkSettings } from "@astropress/core/permalink";

const SETTINGS_KEY = "astropress_permalink_settings";

export const DEFAULT_SETTINGS = {
  enabled: true,
  redirectOld: true,
};

export interface PermalinkSettings {
  enabled: boolean;
  redirectOld: boolean;
}

export async function loadSettings(db: any): Promise<PermalinkSettings> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  try {
    const parsed = JSON.parse(row?.value ?? "{}");
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(db: any, data: Partial<PermalinkSettings>): Promise<PermalinkSettings> {
  const merged = { ...DEFAULT_SETTINGS, ...data };
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
  // 同进程立即生效（中间件/出站链接走 core 的 15s 共享缓存）
  invalidatePermalinkSettings();
  return merged;
}
