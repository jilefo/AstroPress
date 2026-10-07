import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_donation_settings";
const CACHE_TTL_MS = 15_000;

export const DEFAULT_SETTINGS = {
  enabled: true,
  buttonText: "☕ 打赏支持",
  heading: "打赏支持",
  message: "如果这篇文章对您有帮助，请作者喝杯咖啡",
  wechatQr: "",
  alipayQr: "",
  paypalLink: "",
  applePayQr: "",
  googlePayQr: "",
  afdianLink: "",
  position: "after_content" as "after_content",
};

export interface DonationSettings {
  enabled: boolean;
  buttonText: string;
  heading: string;
  message: string;
  wechatQr: string;
  alipayQr: string;
  paypalLink: string;
  applePayQr: string;
  googlePayQr: string;
  afdianLink: string;
  position: "after_content";
}

let cache: { data: DonationSettings; ts: number } | null = null;

export async function loadSettings(db: any): Promise<DonationSettings> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  let data: DonationSettings;
  try {
    const parsed = JSON.parse(row?.value ?? "{}");
    data = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    data = DEFAULT_SETTINGS;
  }
  cache = { data, ts: Date.now() };
  return data;
}

export async function saveSettings(db: any, data: Partial<DonationSettings>): Promise<DonationSettings> {
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
  cache = { data: merged, ts: Date.now() };
  return merged;
}
