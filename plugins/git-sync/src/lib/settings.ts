/**
 * 插件设置与同步历史的 wp_options 存取。
 *   - astropress_git_sync_settings：平台/仓库/分支/token/远端路径/同步范围
 *   - astropress_git_sync_history：最近 20 条同步记录
 */
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { PRESETS } from "./drivers";

const SETTINGS_KEY = "astropress_git_sync_settings";
const HISTORY_KEY = "astropress_git_sync_history";
const HISTORY_LIMIT = 20;

export interface SyncScopes {
  dbDump: boolean;
  media: boolean;
  configJson: boolean;
  site: boolean;
}

export interface GitSyncSettings {
  preset: string;
  baseUrl: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** 远端目录前缀（可为空，posix 风格，无首尾斜杠） */
  prefix: string;
  /** dump.sql 远端路径（相对 prefix） */
  dumpPath: string;
  scopes: SyncScopes;
}

export const DEFAULT_SETTINGS: GitSyncSettings = {
  preset: "github",
  baseUrl: "",
  owner: "",
  repo: "",
  branch: "main",
  token: "",
  prefix: "",
  dumpPath: "backups/astropress-dump.sql",
  scopes: { dbDump: true, media: false, configJson: true, site: false },
};

// ─── 读 ──────────────────────────────────────────────────────────────────────

async function readOption(db: any, name: string): Promise<string | null> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  return row ? String(row.value) : null;
}

async function writeOption(db: any, name: string, value: string): Promise<void> {
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  if (row) {
    await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value });
  }
}

export async function loadSettings(db: any): Promise<GitSyncSettings> {
  const raw = await readOption(db, SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS, scopes: { ...DEFAULT_SETTINGS.scopes } };
  try {
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    merged.scopes = { ...DEFAULT_SETTINGS.scopes, ...(parsed.scopes ?? {}) };
    if (!PRESETS[merged.preset]) merged.preset = DEFAULT_SETTINGS.preset;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS, scopes: { ...DEFAULT_SETTINGS.scopes } };
  }
}

export async function saveSettings(db: any, data: GitSyncSettings): Promise<void> {
  await writeOption(db, SETTINGS_KEY, JSON.stringify(data));
}

/** token 掩码回显：只保留末 4 位 */
export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 4) return "••••";
  return "••••" + token.slice(-4);
}

// ─── 历史 ────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  time: string;
  platform: string;
  files: number;
  ok: boolean;
  message: string;
}

export async function loadHistory(db: any): Promise<HistoryEntry[]> {
  const raw = await readOption(db, HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === "object" && typeof e.time === "string")
      .slice(0, HISTORY_LIMIT) as HistoryEntry[];
  } catch {
    return [];
  }
}

export async function pushHistory(db: any, entry: HistoryEntry): Promise<void> {
  const list = await loadHistory(db);
  list.unshift(entry);
  await writeOption(db, HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}

// ─── 路径清洗 ────────────────────────────────────────────────────────────────

/**
 * 远端相对路径清洗：反斜杠→/，去首尾斜杠，拒绝 .. 段与空段折叠。
 * 返回 null 表示不合法。
 */
export function sanitizeRemotePath(input: string, allowEmpty: boolean): string | null {
  let p = String(input ?? "").trim().replace(/\\/g, "/");
  p = p.replace(/^\/+|\/+$/g, "");
  if (!p) return allowEmpty ? "" : null;
  const segs = p.split("/").filter((s) => s.length > 0);
  if (segs.some((s) => s === "." || s === "..")) return null;
  return segs.join("/");
}

/** 拼接远端路径：prefix + rel（两者均已清洗） */
export function joinRemote(prefix: string, rel: string): string {
  return prefix ? `${prefix}/${rel}` : rel;
}
