import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_maintenance_settings";

export const TITLE_MAX_LEN = 100;
export const MESSAGE_MAX_LEN = 500;
export const ETA_MAX_LEN = 100;
export const MAX_ALLOWED_IPS = 50;
export const IP_MAX_LEN = 45;

/** 常见静态扩展名（维护模式下放行，保证 503 页与后台资源可用） */
export const STATIC_EXTS = [
  "css", "js", "woff", "woff2", "ttf", "otf",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif",
  "mp4", "mp3",
];

export interface MaintenanceSettings {
  enabled: boolean;
  /** 维护页标题 */
  title: string;
  /** 维护页正文（换行会转为 br） */
  message: string;
  /** 预计恢复时间（纯文本，空 = 不显示） */
  eta: string;
  /** IP 白名单（精确匹配，命中即放行） */
  allowedIps: string[];
}

export const DEFAULT_SETTINGS: MaintenanceSettings = {
  enabled: false,
  title: "网站维护中",
  message: "我们正在进行系统维护与升级，请稍后再来访问。",
  eta: "",
  allowedIps: [],
};

// 不做进程内 TTL 缓存：CF 多 isolate 下，saveSettings 只能失效写操作所在
// isolate 的缓存，其他边缘节点最长 15s 内仍读到旧 enabled=false，维护闸门
// （安全/应急开关）会被短暂绕过。闸门每次读共享 D1（单行索引查询），
// 保证开启/关闭在所有 isolate 即时生效。

function clampText(value: unknown, maxLen: number, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  return String(value).slice(0, maxLen);
}

function normalizeIps(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const ips: string[] = [];
  for (const item of data) {
    if (ips.length >= MAX_ALLOWED_IPS) break;
    const ip = String(item ?? "").trim().slice(0, IP_MAX_LEN);
    if (!ip || seen.has(ip)) continue;
    seen.add(ip);
    ips.push(ip);
  }
  return ips;
}

/** POST 入参归一化：文本截断 + IP 白名单去重/限项 */
export function normalizeSettings(data: any): MaintenanceSettings {
  return {
    enabled: !!data?.enabled,
    title: clampText(data?.title, TITLE_MAX_LEN, DEFAULT_SETTINGS.title) || DEFAULT_SETTINGS.title,
    message: clampText(data?.message, MESSAGE_MAX_LEN, DEFAULT_SETTINGS.message),
    eta: clampText(data?.eta, ETA_MAX_LEN, ""),
    allowedIps: normalizeIps(data?.allowedIps),
  };
}

export async function loadSettings(db: any): Promise<MaintenanceSettings> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);

  let parsed: Partial<MaintenanceSettings> = {};
  try {
    parsed = JSON.parse(row?.value ?? "{}");
  } catch {
    /* ignore */
  }

  const merged = { ...DEFAULT_SETTINGS, ...parsed };
  const settings: MaintenanceSettings = {
    ...merged,
    title: String(merged.title ?? "").slice(0, TITLE_MAX_LEN) || DEFAULT_SETTINGS.title,
    message: String(merged.message ?? "").slice(0, MESSAGE_MAX_LEN),
    eta: String(merged.eta ?? "").slice(0, ETA_MAX_LEN),
    allowedIps: normalizeIps(parsed.allowedIps),
  };
  return settings;
}

export async function saveSettings(db: any, data: Partial<MaintenanceSettings>): Promise<MaintenanceSettings> {
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

  return settings;
}
