/**
 * gist-sync 设置与同步历史的 wp_options 存取。
 *   - astropress_gist_sync_settings：token / gistId / filename / description
 *   - astropress_gist_sync_history：最近 20 条 { time, direction, ok, message }
 * Token 只在服务端使用；对页面回显时掩码为 ****，提交空值不覆盖。
 */
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_gist_sync_settings";
const HISTORY_KEY = "astropress_gist_sync_history";
const HISTORY_LIMIT = 20;

export interface GistSyncSettings {
  /** GitHub Personal Access Token（scope: gist），仅存库，不明文回显 */
  token: string;
  /** Gist ID；留空则首次推送时自动创建私密 Gist 并回写 */
  gistId: string;
  /** Gist 内的配置文件名 */
  filename: string;
  /** Gist 描述 */
  description: string;
}

export const DEFAULT_SETTINGS: GistSyncSettings = {
  token: "",
  gistId: "",
  filename: "astropress-config.json",
  description: "AstroPress 站点配置备份（gist-sync 插件自动同步）",
};

export interface HistoryEntry {
  /** ISO 时间 */
  time: string;
  direction: "push" | "pull";
  ok: boolean;
  message: string;
  gistId?: string;
}

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

/** 读取设置，缺失/损坏时回退默认值 */
export async function loadSettings(db: any): Promise<GistSyncSettings> {
  const raw = await readOption(db, SETTINGS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // 字段类型收敛，避免脏数据
    return {
      token: typeof merged.token === "string" ? merged.token : "",
      gistId: typeof merged.gistId === "string" ? merged.gistId : "",
      filename:
        typeof merged.filename === "string" && merged.filename.trim()
          ? merged.filename.trim()
          : DEFAULT_SETTINGS.filename,
      description:
        typeof merged.description === "string" ? merged.description : DEFAULT_SETTINGS.description,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 保存设置；token 传空字符串表示保持原值不覆盖 */
export async function saveSettings(db: any, data: Partial<GistSyncSettings>): Promise<GistSyncSettings> {
  const current = await loadSettings(db);
  const next: GistSyncSettings = {
    token: typeof data.token === "string" && data.token !== "" ? data.token : current.token,
    gistId: typeof data.gistId === "string" ? data.gistId.trim() : current.gistId,
    filename:
      typeof data.filename === "string" && data.filename.trim()
        ? data.filename.trim()
        : current.filename,
    description: typeof data.description === "string" ? data.description : current.description,
  };
  await writeOption(db, SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** 仅回写 gistId（首次推送创建 Gist 后调用） */
export async function saveGistId(db: any, gistId: string): Promise<void> {
  const current = await loadSettings(db);
  await writeOption(db, SETTINGS_KEY, JSON.stringify({ ...current, gistId }));
}

/** 读取同步历史（最新在前） */
export async function loadHistory(db: any): Promise<HistoryEntry[]> {
  const raw = await readOption(db, HISTORY_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is HistoryEntry =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as any).time === "string" &&
          ((e as any).direction === "push" || (e as any).direction === "pull") &&
          typeof (e as any).ok === "boolean" &&
          typeof (e as any).message === "string"
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** 追加一条历史，保留最近 HISTORY_LIMIT 条 */
export async function appendHistory(db: any, entry: HistoryEntry): Promise<void> {
  const list = await loadHistory(db);
  list.unshift(entry);
  await writeOption(db, HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}
