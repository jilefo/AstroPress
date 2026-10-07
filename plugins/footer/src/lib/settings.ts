import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_footer_settings";
const CACHE_TTL = 15_000;

export interface FooterLink {
  label: string;
  url: string;
}

export const DEFAULT_SETTINGS = {
  enabled: true,
  copyright: "",
  icp: "",
  police: "",
  links: [] as FooterLink[],
  customHtml: "",
  showPoweredBy: true,
};

export interface FooterSettings {
  enabled: boolean;
  copyright: string;
  icp: string;
  police: string;
  links: FooterLink[];
  customHtml: string;
  showPoweredBy: boolean;
}

let cache: FooterSettings | null = null;
let cacheAt = 0;

export async function loadSettings(db: any): Promise<FooterSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<FooterSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings: FooterSettings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    links: Array.isArray(parsed.links) ? parsed.links.slice(0, 5) : [],
  };
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<FooterSettings>): Promise<FooterSettings> {
  const links = Array.isArray(data.links) ? data.links.slice(0, 5) : [];
  const payload = JSON.stringify({ ...DEFAULT_SETTINGS, ...data, links });

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
  return { ...DEFAULT_SETTINGS, ...data, links } as FooterSettings;
}
