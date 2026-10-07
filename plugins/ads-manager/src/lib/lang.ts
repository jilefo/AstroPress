import { getOption } from "@astropress/core/query";
import type { MlSettingsLite } from "./lang-types";

/**
 * Standalone language resolution (compatible with plugin-multilingual's
 * conventions: /{lang}/... prefix, ?lang= param, ml_pref cookie) so the ads
 * plugin works with or without the multilingual plugin installed.
 */
export async function resolveCtxLang(req: Request, db: any): Promise<string | null> {
  let settings: MlSettingsLite | null = null;
  if (db) {
    try {
      const raw = await getOption(db, "astropress_ml_settings", "");
      if (raw) settings = JSON.parse(raw) as MlSettingsLite;
    } catch {
      settings = null;
    }
  }
  if (!settings?.languages?.length) return null;

  const url = new URL(req.url);
  const seg = url.pathname.split("/").filter(Boolean)[0];
  const byPrefix = settings.languages.find((l) => l.enabled && l.code === seg);
  if (byPrefix) return byPrefix.code;

  const param = url.searchParams.get("lang");
  if (param && settings.languages.some((l) => l.enabled && l.code === param)) return param;

  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)ml_pref=([a-z0-9-]+)/i)?.[1];
  if (cookie && settings.languages.some((l) => l.enabled && l.code === cookie)) return cookie;
  return null;
}

export function detectDevice(req: Request): "mobile" | "desktop" {
  const ua = req.headers.get("user-agent") ?? "";
  return /mobile|android|iphone|ipad|ipod/i.test(ua) ? "mobile" : "desktop";
}