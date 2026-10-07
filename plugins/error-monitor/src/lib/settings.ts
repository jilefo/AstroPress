import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_404_settings";
const CACHE_TTL = 15_000;
const MAX_IGNORES = 50;

export const DEFAULT_SETTINGS = {
  enabled: true,
  logAssets: false,
  ignores: ["/favicon.ico", "/robots.txt", "/sitemap.xml", "/apple-touch-icon.png"],
};

export interface MonitorSettings {
  enabled: boolean;
  logAssets: boolean;
  ignores: string[];
}

/** 规整 ignores：字符串数组，每项截断 200，最多 50 项 */
export function normalizeIgnores(input: unknown): string[] {
  if (!Array.isArray(input)) return DEFAULT_SETTINGS.ignores.slice();
  return input
    .map((v) => String(v ?? "").slice(0, 200))
    .filter((v) => v.length > 0)
    .slice(0, MAX_IGNORES);
}

let cache: MonitorSettings | null = null;
let cacheAt = 0;

export async function loadSettings(db: any): Promise<MonitorSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<MonitorSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings: MonitorSettings = {
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
    logAssets: typeof parsed.logAssets === "boolean" ? parsed.logAssets : DEFAULT_SETTINGS.logAssets,
    ignores: normalizeIgnores(parsed.ignores),
  };
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<MonitorSettings>): Promise<MonitorSettings> {
  const settings: MonitorSettings = {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_SETTINGS.enabled,
    logAssets: typeof data.logAssets === "boolean" ? data.logAssets : DEFAULT_SETTINGS.logAssets,
    ignores: normalizeIgnores(data.ignores),
  };
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
