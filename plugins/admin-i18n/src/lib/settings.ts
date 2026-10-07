import { getOption, updateOption } from "@astropress/core/query";

export interface I18nSettings {
  enabled: boolean;
  target: string;
  webhookUrl: string; // empty → fall back to env AP_N8N_WEBHOOK_URL
}

const KEY = "astropress_i18n_settings";
let cache: { value: I18nSettings; at: number } | null = null;

export const DEFAULT_SETTINGS: I18nSettings = {
  enabled: true,
  target: "zh-CN",
  webhookUrl: "",
};

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function loadSettings(db: any): Promise<I18nSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  let value: I18nSettings = { ...DEFAULT_SETTINGS };
  if (db) {
    const raw = await getOption(db, KEY, "");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<I18nSettings>;
        value = {
          enabled: parsed.enabled !== false,
          target: typeof parsed.target === "string" && parsed.target ? parsed.target : DEFAULT_SETTINGS.target,
          webhookUrl: typeof parsed.webhookUrl === "string" ? parsed.webhookUrl : "",
        };
      } catch {
        /* keep defaults on corrupt data */
      }
    }
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(db: any, value: I18nSettings): Promise<void> {
  await updateOption(db, KEY, JSON.stringify(value));
  invalidateSettingsCache();
}

/** Effective n8n webhook URL: stored setting wins, env var is the fallback. */
export function effectiveWebhook(settings: I18nSettings): string {
  const fromSettings = settings.webhookUrl.trim();
  if (fromSettings) return fromSettings;
  return (process.env.AP_N8N_WEBHOOK_URL ?? "").trim();
}
