import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_gitalk_settings";
const CACHE_TTL_MS = 15_000; // 15 秒缓存，避免每个请求都查库

export interface GitalkSettings {
  /** 前台注入开关（需 clientID/repo/owner 齐备才真正注入） */
  enabled: boolean;
  /** GitHub OAuth App Client ID */
  clientID: string;
  /** GitHub OAuth App Client Secret */
  clientSecret: string;
  /** 存放评论的 GitHub 仓库名 */
  repo: string;
  /** 仓库所有者 */
  owner: string;
  /** 仓库管理员（可初始化 Issue），逗号分隔多个 */
  admin: string;
  /** Issue ID 策略：pathname=location.pathname，slug=文章 slug */
  idMode: "pathname" | "slug";
  /** 语言（gitalk 支持 en / zh-CN / zh-TW 等） */
  language: string;
  /** 每页评论数 */
  perPage: number;
  /** 无干扰模式（Facebook 风格全屏评论框） */
  distractionFreeMode: boolean;
  /** GitHub OAuth 反向代理（解决 CORS），留空用 Gitalk 默认 */
  proxy: string;
  /** 是否由评论组件创建 Issue 时带上文章标题作为 Issue 标题前缀 */
  titleFromPage: boolean;
}

export const DEFAULT_SETTINGS: GitalkSettings = {
  enabled: false,
  clientID: "",
  clientSecret: "",
  repo: "",
  owner: "",
  admin: "",
  idMode: "pathname",
  language: "zh-CN",
  perPage: 10,
  distractionFreeMode: false,
  proxy: "",
  titleFromPage: true,
};

let cache: { data: GitalkSettings; expires: number } | null = null;

function normalize(parsed: any): GitalkSettings {
  const perPageRaw = parseInt(parsed?.perPage, 10);
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    enabled: !!parsed?.enabled,
    idMode: parsed?.idMode === "slug" ? "slug" : "pathname",
    perPage: Number.isFinite(perPageRaw) ? Math.max(5, Math.min(50, perPageRaw)) : DEFAULT_SETTINGS.perPage,
    distractionFreeMode: !!parsed?.distractionFreeMode,
    titleFromPage: parsed?.titleFromPage !== false,
  };
}

/** 配置是否足以在前台注入（缺关键字段时静默不注入） */
export function isConfigured(s: GitalkSettings): boolean {
  return !!(s.enabled && s.clientID && s.repo && s.owner);
}

export async function loadSettings(db: any): Promise<GitalkSettings> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  let data: GitalkSettings = DEFAULT_SETTINGS;
  try {
    data = normalize(JSON.parse(row?.value ?? "{}"));
  } catch {
    data = DEFAULT_SETTINGS;
  }
  cache = { data, expires: now + CACHE_TTL_MS };
  return data;
}

export async function saveSettings(db: any, data: Partial<GitalkSettings>): Promise<GitalkSettings> {
  const merged = normalize(data);
  const payload = JSON.stringify(merged);
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
  cache = { data: merged, expires: Date.now() + CACHE_TTL_MS };
  return merged;
}
