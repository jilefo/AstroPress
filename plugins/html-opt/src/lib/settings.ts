import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_html_opt_settings";
const CACHE_TTL = 15_000;
const MAX_URLS = 10;

export const DEFAULT_SETTINGS = {
  enabled: true,
  removeComments: true,
  collapseWhitespace: true,
  resourceHints: true,
  preconnect: [] as string[],
  dnsPrefetch: [] as string[],
};

export interface HtmlOptSettings {
  enabled: boolean;
  removeComments: boolean;
  collapseWhitespace: boolean;
  resourceHints: boolean;
  preconnect: string[];
  dnsPrefetch: string[];
}

/**
 * 规范化 URL 列表：
 *   - 最多保留 10 项
 *   - 仅接受 http(s) 协议且带主机名的 URL（new URL 校验，非法直接丢弃）
 *   - 统一存 origin（scheme + host）
 *   - 按 origin 去重
 */
export function normalizeUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    try {
      const u = new URL(String(raw ?? "").trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (!u.hostname) continue;
      if (!out.includes(u.origin)) out.push(u.origin);
      if (out.length >= MAX_URLS) break;
    } catch {
      // 非法 URL，丢弃
    }
  }
  return out;
}

let cache: HtmlOptSettings | null = null;
let cacheAt = 0;

export async function loadSettings(db: any): Promise<HtmlOptSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<HtmlOptSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings: HtmlOptSettings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    preconnect: normalizeUrls(parsed.preconnect),
    dnsPrefetch: normalizeUrls(parsed.dnsPrefetch),
  };
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<HtmlOptSettings>): Promise<HtmlOptSettings> {
  const preconnect = normalizeUrls(data.preconnect);
  const dnsPrefetch = normalizeUrls(data.dnsPrefetch);
  const payload = JSON.stringify({ ...DEFAULT_SETTINGS, ...data, preconnect, dnsPrefetch });

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
  return { ...DEFAULT_SETTINGS, ...data, preconnect, dnsPrefetch } as HtmlOptSettings;
}
