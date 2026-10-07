import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_comments_settings";

export interface CommentSettings {
  /** 全站评论开关 */
  enabled: boolean;
  /** 新评论自动批准（默认进入待审核） */
  autoApprove: boolean;
  /** 前台评论排序 */
  order: "asc" | "desc";
  /** 后台每页条数 */
  perPage: number;
  /** 关闭评论的文章类型；空数组 = 全部开放 */
  closedTypes: string[];
}

export const DEFAULT_SETTINGS: CommentSettings = {
  enabled: true,
  autoApprove: false,
  order: "asc",
  perPage: 20,
  closedTypes: [],
};

const ALLOWED_CLOSED_TYPES = ["post", "page"];

/** POST 白名单清洗与截断 */
export function sanitizeSettings(body: any): CommentSettings {
  const order = body?.order === "desc" ? "desc" : "asc";
  const perPageRaw = parseInt(body?.perPage, 10);
  const perPage = Number.isFinite(perPageRaw)
    ? Math.max(5, Math.min(100, perPageRaw))
    : DEFAULT_SETTINGS.perPage;
  const rawTypes: unknown[] = Array.isArray(body?.closedTypes) ? (body.closedTypes as unknown[]) : [];
  const closedTypes: string[] = [...new Set(
    rawTypes
      .map((t: unknown): string => String(t ?? "").slice(0, 32))
      .filter((t: string): boolean => ALLOWED_CLOSED_TYPES.includes(t))
  )];
  return {
    enabled: !!body?.enabled,
    autoApprove: !!body?.autoApprove,
    order,
    perPage,
    closedTypes,
  };
}

export async function loadSettings(db: any): Promise<CommentSettings> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  try {
    const parsed = JSON.parse(row?.value ?? "{}");
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(db: any, data: CommentSettings): Promise<CommentSettings> {
  const payload = JSON.stringify(data);
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
  return data;
}

/** 读取单个 wp_options 值（用于站点 blogname / admin_email） */
export async function getOption(db: any, name: string): Promise<string> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  return row?.value ?? "";
}
