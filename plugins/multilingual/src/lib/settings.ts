import { getOption, updateOption } from "@astropress/core/query";
import type { MlLanguage, MlSettings } from "./types";

const KEY = "astropress_ml_settings";
let cache: { value: MlSettings; at: number } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

/** Lang code = URL prefix + <html lang> source — strictly constrain it. */
const CODE_RE = /^[a-z]{2}(-[a-z0-9]{2,8})?$/;

/**
 * Normalize an untrusted settings object into a safe MlSettings.
 * Returns null when the shape is unusable (caller keeps defaults / 400s).
 * Language codes feed <html lang="…"> and URL prefixes, so anything outside
 * CODE_RE is dropped rather than stored.
 */
export function sanitizeSettings(raw: unknown): MlSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<MlSettings> & { languages?: unknown };
  if (!Array.isArray(r.languages) || r.languages.length === 0) return null;

  const languages: MlLanguage[] = [];
  const seen = new Set<string>();
  for (const item of r.languages) {
    if (!item || typeof item !== "object") continue;
    const code = String((item as Partial<MlLanguage>).code ?? "").trim().toLowerCase();
    if (!CODE_RE.test(code) || seen.has(code)) continue;
    seen.add(code);
    const locale = (item as Partial<MlLanguage>).locale;
    const label = (item as Partial<MlLanguage>).nativeLabel;
    languages.push({
      code,
      locale: typeof locale === "string" && locale.trim() ? locale.trim().slice(0, 20) : code,
      nativeLabel: typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : code,
      enabled: (item as Partial<MlLanguage>).enabled !== false,
    });
  }
  if (!languages.length) return null;

  const defaultLang =
    typeof r.defaultLang === "string" && languages.some((l) => l.code === r.defaultLang)
      ? r.defaultLang
      : languages[0].code;
  const urlStrategy = r.urlStrategy === "param" ? "param" : "prefix";
  return { defaultLang, urlStrategy, languages };
}

export async function loadSettings(db: any): Promise<MlSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  // Unconfigured site → empty languages → plugin stays inert (no rewriting).
  let value: MlSettings = { defaultLang: "en", urlStrategy: "prefix", languages: [] };
  if (db) {
    const raw = await getOption(db, KEY, "");
    if (raw) {
      try {
        value = sanitizeSettings(JSON.parse(raw)) ?? value;
      } catch {
        /* keep defaults on corrupt data */
      }
    }
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(db: any, value: unknown): Promise<MlSettings> {
  const clean = sanitizeSettings(value);
  if (!clean) throw new Error("多语言设置格式不正确");
  await updateOption(db, KEY, JSON.stringify(clean));
  invalidateSettingsCache();
  return clean;
}