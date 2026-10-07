import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_sitemap_settings";

export const DEFAULT_SETTINGS = {
  enabled: true,
  maxPosts: 1000,
  includePages: true,
};

export interface SitemapSettings {
  enabled: boolean;
  maxPosts: number;
  includePages: boolean;
}

export async function loadSettings(db: any): Promise<SitemapSettings> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  try {
    const parsed = JSON.parse(row?.value ?? "{}");
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    merged.maxPosts = Math.max(1, Math.min(5000, Number(merged.maxPosts) || DEFAULT_SETTINGS.maxPosts));
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(db: any, data: Partial<SitemapSettings>): Promise<SitemapSettings> {
  const merged = { ...DEFAULT_SETTINGS, ...data };
  merged.maxPosts = Math.max(1, Math.min(5000, Number(merged.maxPosts) || DEFAULT_SETTINGS.maxPosts));
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
  return merged;
}
