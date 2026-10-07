import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { isSafeOutputDir } from "./paths";

const SETTINGS_KEY = "astropress_static_html_settings";

export const DEFAULT_SETTINGS = {
  enabled: true,
  /** 输出目录（相对站点根） */
  outputDir: "static-html",
  /** manual | hourly | daily | weekly */
  schedule: "manual" as "manual" | "hourly" | "daily" | "weekly",
  /** daily/weekly 的触发时间 HH:MM */
  scheduleTime: "03:00",
  /** weekly 的星期几（0=周日 … 6=周六） */
  scheduleWeekday: 0,
  /** 是否导出独立页面（/{slug}） */
  includePages: true,
  /** 是否抓取页面引用的同源静态资源 */
  includeAssets: true,
  /** 单次导出文章数量上限（保护） */
  maxPosts: 2000,
  /** 输出模式：static=纯静态目录 | pages=Cloudflare Pages（含 _worker.js） */
  outputMode: "static" as "static" | "pages",
};

export type StaticHtmlSettings = typeof DEFAULT_SETTINGS;

export async function loadSettings(db: any): Promise<StaticHtmlSettings> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  try {
    const parsed = JSON.parse(row?.value ?? "{}");
    return normalize(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function normalize(input: any): StaticHtmlSettings {
  const sched = ["manual", "hourly", "daily", "weekly"].includes(input?.schedule)
    ? input.schedule
    : DEFAULT_SETTINGS.schedule;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input?.scheduleTime ?? ""))
    ? String(input.scheduleTime)
    : DEFAULT_SETTINGS.scheduleTime;
  const weekday = Number(input?.scheduleWeekday);
  const dir = String(input?.outputDir ?? DEFAULT_SETTINGS.outputDir).trim().replace(/[\\/]+$/, "");
  return {
    enabled: input?.enabled !== false,
    outputDir: isSafeOutputDir(dir) ? dir : DEFAULT_SETTINGS.outputDir,
    schedule: sched,
    scheduleTime: time,
    scheduleWeekday: weekday >= 0 && weekday <= 6 ? weekday : DEFAULT_SETTINGS.scheduleWeekday,
    includePages: input?.includePages !== false,
    includeAssets: input?.includeAssets !== false,
    maxPosts: Math.max(1, Math.min(10000, Number(input?.maxPosts) || DEFAULT_SETTINGS.maxPosts)),
    outputMode: ["static", "pages"].includes(input?.outputMode) ? input.outputMode : DEFAULT_SETTINGS.outputMode,
  };
}

export async function saveSettings(db: any, data: any): Promise<StaticHtmlSettings> {
  const merged = normalize({ ...(await loadSettings(db)), ...data });
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
  return merged;
}
