import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_rate_limit_settings";
const CACHE_TTL = 15_000;

export const MAX_RULES = 30;
export const NAME_MAX_LEN = 40;
export const PREFIX_MAX_LEN = 200;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 100_000;
export const MIN_WINDOW = 1;
export const MAX_WINDOW = 3_600;

export type RuleMethod = "ALL" | "GET" | "POST";

export interface RateLimitRule {
  /** 规则名：限流桶 key 的一部分，同插件内唯一 */
  name: string;
  /** 路径前缀（pathname.startsWith 命中） */
  prefix: string;
  /** 匹配方法：ALL / GET / POST */
  method: RuleMethod;
  /** 窗口内允许的最大请求数 */
  limit: number;
  /** 窗口长度（秒） */
  windowSec: number;
  enabled: boolean;
}

export interface RateLimitSettings {
  enabled: boolean;
  rules: RateLimitRule[];
}

export const DEFAULT_SETTINGS: RateLimitSettings = {
  enabled: true,
  rules: [
    // 兜底阈值须高于各插件自有精细限流，避免抢先拦截导致核心限流/锁定失效：
    //   登录锁定=10 次失败 → 兜底 20/分；forms 自有 10/60s → 兜底 30/分；
    //   评论自有 3/30s → 兜底 20/分；search/track 无自有阈值 → 全局限流生效
    { name: "login", prefix: "/api/auth/login", method: "POST", limit: 20, windowSec: 60, enabled: true },
    { name: "forms", prefix: "/api/forms/submit", method: "POST", limit: 30, windowSec: 60, enabled: true },
    { name: "search", prefix: "/search", method: "ALL", limit: 30, windowSec: 60, enabled: true },
    { name: "track", prefix: "/ap-related/track", method: "ALL", limit: 60, windowSec: 60, enabled: true },
    { name: "comments", prefix: "/ap-comments", method: "POST", limit: 20, windowSec: 60, enabled: true },
  ],
};

let cache: RateLimitSettings | null = null;
let cacheAt = 0;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function normalizeMethod(value: unknown): RuleMethod {
  const m = String(value ?? "").toUpperCase();
  return m === "GET" || m === "POST" ? m : "ALL";
}

function normalizeName(value: unknown, fallback: string): string {
  // 桶 key 用 "|" 分隔 IP，规则名需剔除 | 与空白，避免串 key
  const s = String(value ?? "")
    .replace(/[|\s]/g, "")
    .slice(0, NAME_MAX_LEN);
  return s || fallback;
}

function normalizePrefix(value: unknown): string {
  return String(value ?? "").trim().slice(0, PREFIX_MAX_LEN);
}

/** POST 入参归一化：数值边界 + 规则数量/字段截断 + 名称去重 */
export function normalizeSettings(data: any): RateLimitSettings {
  const rawRules = Array.isArray(data?.rules) ? data.rules.slice(0, MAX_RULES) : [];
  const seen = new Set<string>();
  const rules: RateLimitRule[] = [];
  for (let i = 0; i < rawRules.length; i++) {
    const r = rawRules[i];
    const prefix = normalizePrefix(r?.prefix);
    if (!prefix || !prefix.startsWith("/")) continue;
    let name = normalizeName(r?.name, `rule${i + 1}`);
    while (seen.has(name)) name = `${name}x`.slice(0, NAME_MAX_LEN);
    seen.add(name);
    rules.push({
      name,
      prefix,
      method: normalizeMethod(r?.method),
      limit: clampInt(r?.limit, MIN_LIMIT, MAX_LIMIT, 10),
      windowSec: clampInt(r?.windowSec, MIN_WINDOW, MAX_WINDOW, 60),
      enabled: r?.enabled !== false,
    });
  }
  return { enabled: !!data?.enabled, rules };
}

export async function loadSettings(db: any): Promise<RateLimitSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<RateLimitSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings: RateLimitSettings = {
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
    rules: Array.isArray(parsed.rules)
      ? normalizeSettings({ enabled: true, rules: parsed.rules }).rules
      : DEFAULT_SETTINGS.rules.map((r) => ({ ...r })),
  };
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<RateLimitSettings>): Promise<RateLimitSettings> {
  const settings = normalizeSettings(data);
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
