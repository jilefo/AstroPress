import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_cs_settings";
const CACHE_TTL = 15_000; // 15 秒缓存

export const DEFAULT_SETTINGS = {
  enabled: true,
  title: "联系客服",
  qq: "",
  wechat: "",
  telegram: "",
  email: "",
  phone: "",
  workingHours: "",
  position: "bottom-right" as "bottom-right" | "bottom-left",
  primaryColor: "#2271b1",
};

export interface CsSettings {
  enabled: boolean;
  title: string;
  qq: string;
  wechat: string;
  telegram: string;
  email: string;
  phone: string;
  workingHours: string;
  position: "bottom-right" | "bottom-left";
  primaryColor: string;
}

let cache: { data: CsSettings; at: number } | null = null;

export function invalidateCache() {
  cache = null;
}

export async function loadSettings(db: any): Promise<CsSettings> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL) return cache.data;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  let data: CsSettings;
  try {
    const parsed = JSON.parse(row?.value ?? "{}");
    data = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    data = { ...DEFAULT_SETTINGS };
  }
  cache = { data, at: now };
  return data;
}

export async function saveSettings(db: any, data: Partial<CsSettings>): Promise<CsSettings> {
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
  invalidateCache();
  return merged;
}
