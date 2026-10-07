import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_security_headers_settings";
const CACHE_TTL = 15_000;

const FRAME_OPTIONS = ["off", "SAMEORIGIN", "DENY"] as const;
export type FrameOption = (typeof FRAME_OPTIONS)[number];

const HSTS_MAX = 63_072_000; // 两年（秒）

export const DEFAULT_SETTINGS = {
  enabled: true,
  nosniff: true,
  frameOptions: "SAMEORIGIN" as FrameOption,
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "",
  hstsMaxAge: 0,
  csp: "",
  cspReportOnly: false,
};

export interface SecurityHeadersSettings {
  enabled: boolean;
  nosniff: boolean;
  /** "off" 时不发送 X-Frame-Options */
  frameOptions: FrameOption;
  /** 空串等价 off，不发送 Referrer-Policy；允许任意合法取值 */
  referrerPolicy: string;
  /** 空串=不发送 Permissions-Policy；禁止 CR/LF（响应头注入防护） */
  permissionsPolicy: string;
  /** 0=关闭 HSTS；否则发送 max-age=<n>; includeSubDomains */
  hstsMaxAge: number;
  /** 空串=不发送 CSP；禁止 CR/LF（响应头注入防护） */
  csp: string;
  /** true 时改用 Content-Security-Policy-Report-Only */
  cspReportOnly: boolean;
}

/** 去除响应头值里的 CR/LF，防止响应头注入/拆分 */
function stripCrlf(s: string): string {
  return s.replace(/[\r\n]/g, "");
}

/** 规范化任意输入，保证落库与运行时取值始终合法 */
export function normalizeSettings(data: any): SecurityHeadersSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(data && typeof data === "object" ? data : {}) };

  const frameOptions: FrameOption = FRAME_OPTIONS.includes(merged.frameOptions)
    ? merged.frameOptions
    : DEFAULT_SETTINGS.frameOptions;

  // 0~63072000 整数；非数字/负数归零（关闭）
  let hstsMaxAge = Math.floor(Number(merged.hstsMaxAge));
  if (!Number.isFinite(hstsMaxAge) || hstsMaxAge < 0) hstsMaxAge = 0;
  if (hstsMaxAge > HSTS_MAX) hstsMaxAge = HSTS_MAX;

  return {
    enabled: !!merged.enabled,
    nosniff: !!merged.nosniff,
    frameOptions,
    referrerPolicy: stripCrlf(String(merged.referrerPolicy ?? "")).slice(0, 100),
    permissionsPolicy: stripCrlf(String(merged.permissionsPolicy ?? "")).slice(0, 300),
    hstsMaxAge,
    csp: stripCrlf(String(merged.csp ?? "")).slice(0, 1000),
    cspReportOnly: !!merged.cspReportOnly,
  };
}

let cache: SecurityHeadersSettings | null = null;
let cacheAt = 0;

export async function loadSettings(db: any): Promise<SecurityHeadersSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<SecurityHeadersSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const settings = normalizeSettings(parsed);
  cache = settings;
  cacheAt = now;
  return settings;
}

export async function saveSettings(db: any, data: Partial<SecurityHeadersSettings>): Promise<SecurityHeadersSettings> {
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
