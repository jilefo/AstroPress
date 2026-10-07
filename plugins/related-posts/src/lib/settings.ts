import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_related_posts_settings";

export const DEFAULT_SETTINGS = {
  enabled: true,
  related: 4,
  random: 4,
  popular: 4,
  heading: "更多阅读",
  css: "",
};

export interface RelatedSettings {
  enabled: boolean;
  related: number;
  random: number;
  popular: number;
  heading: string;
  css: string;
}

export async function loadSettings(db: any): Promise<RelatedSettings> {
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

export async function saveSettings(db: any, data: Partial<RelatedSettings>): Promise<RelatedSettings> {
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
  return { ...DEFAULT_SETTINGS, ...data } as RelatedSettings;
}
