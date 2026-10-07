import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_links_settings";

export const DEFAULT_SETTINGS = {
  enabled: true,
  pageTitle: "网站目录",
  subtitle: "收藏与推荐的网站链接",
  newTab: true,
  showClicks: true,
};

export interface LinksSettings {
  enabled: boolean;
  pageTitle: string;
  subtitle: string;
  newTab: boolean;
  showClicks: boolean;
}

/** 从 wp_options 读取网站目录设置，缺失/损坏时回退默认值 */
export async function loadSettings(db: any): Promise<LinksSettings> {
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

/** 保存网站目录设置到 wp_options */
export async function saveSettings(db: any, data: Partial<LinksSettings>): Promise<LinksSettings> {
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
  return { ...DEFAULT_SETTINGS, ...data } as LinksSettings;
}
