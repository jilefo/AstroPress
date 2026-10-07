import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_seo_tools_settings";

export const DEFAULT_SETTINGS = {
  feedEnabled: true,
  feedCount: 20,
  feedTitle: "",
  feedDescription: "",
  robotsExtra: "",
};

export interface SeoSettings {
  feedEnabled: boolean;
  feedCount: number;
  feedTitle: string;
  feedDescription: string;
  robotsExtra: string;
}

/** 从 wp_options 读取插件设置（JSON），缺省值回退 */
export async function loadSettings(db: any): Promise<SeoSettings> {
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

/** 保存插件设置到 wp_options（JSON），已存在则更新否则插入 */
export async function saveSettings(db: any, data: Partial<SeoSettings>): Promise<SeoSettings> {
  const payload = JSON.stringify({ ...DEFAULT_SETTINGS, ...data });
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
  return { ...DEFAULT_SETTINGS, ...data } as SeoSettings;
}
