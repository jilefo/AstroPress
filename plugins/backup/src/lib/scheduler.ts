import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { hasFileSystem } from "@astropress/core";
import { loadSettings } from "./settings";
// 注意：fs 与 backup-core 均为动态 import——本模块被 middleware-admin 静态引用，
// CF Workers 启动时会加载中间件，顶层静态 import node:fs 会污染启动链路。

/**
 * WP-Cron 风格自动备份调度器：
 *   - 不依赖独立进程；后台有访问时由 middleware-admin 调用 ensureScheduler()
 *   - 60 秒精度 setInterval（unref，不阻止进程退出）
 *   - 支持每天定点 / 每周定点；触发时刻记忆存 wp_options（astropress_backup_state.lastAutoAt），重启不重复
 *   - 备份成功后按 keepLast 裁剪旧备份
 *   - Cloudflare Workers 环境不启动（无文件系统）
 *   - 全部异常静默，调度绝不影响站点请求
 */

const STATE_KEY = "astropress_backup_state";

let timer: ReturnType<typeof setInterval> | null = null;
let dbRef: any = null;
let ticking = false;

export function ensureScheduler(db: any): void {
  if (!hasFileSystem()) return; // CF Workers：无文件系统，不启动调度
  if (db) dbRef = db;
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  if (typeof (timer as any).unref === "function") (timer as any).unref();
  // 启动后稍等再首次检查，避开服务启动高峰
  setTimeout(() => void tick(), 8_000);
}

async function loadState(db: any): Promise<{ lastAutoAt: string | null }> {
  try {
    const [row] = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, STATE_KEY))
      .limit(1);
    const parsed = JSON.parse(row?.value ?? "{}");
    return { lastAutoAt: typeof parsed.lastAutoAt === "string" ? parsed.lastAutoAt : null };
  } catch {
    return { lastAutoAt: null };
  }
}

async function saveState(db: any, lastAutoAt: string): Promise<void> {
  const payload = JSON.stringify({ lastAutoAt });
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, STATE_KEY))
    .limit(1);
  if (row) {
    await db.update(wpOptions).set({ optionValue: payload }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: STATE_KEY, optionValue: payload });
  }
}

function isDue(schedule: string, time: string, weekday: number, lastAutoAt: string | null): boolean {
  const now = new Date();
  const last = lastAutoAt ? new Date(lastAutoAt) : null;
  const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
  const fireAt = new Date(now);
  fireAt.setHours(hh || 3, mm || 30, 0, 0);

  if (schedule === "daily") {
    if (now < fireAt) return false;
    return !last || last < fireAt;
  }
  if (schedule === "weekly") {
    if (now.getDay() !== weekday) return false;
    if (now < fireAt) return false;
    return !last || last < fireAt;
  }
  return false;
}

/** 裁剪旧备份：按文件名倒序（时间戳命名天然有序），保留最近 keepLast 份 */
async function pruneOldBackups(keepLast: number): Promise<number> {
  const fs = await import("node:fs/promises");
  const { listBackupEntries, backupPath } = await import("./backup-core");
  const entries = await listBackupEntries();
  if (entries.length <= keepLast) return 0;
  const toDelete = entries.slice(keepLast);
  let removed = 0;
  for (const e of toDelete) {
    try {
      await fs.unlink(backupPath(e.file));
      removed++;
    } catch {
      /* 单个删除失败不阻断其余裁剪 */
    }
  }
  return removed;
}

async function tick(): Promise<void> {
  if (ticking || !dbRef) return;
  ticking = true;
  try {
    const settings = await loadSettings(dbRef);
    if (!settings.autoEnabled) return;
    const state = await loadState(dbRef);
    if (!isDue(settings.schedule, settings.time, settings.weekday, state.lastAutoAt)) return;
    // 先落库触发时间，防止下一 tick 重复触发
    await saveState(dbRef, new Date().toISOString());
    const { createBackup } = await import("./backup-core");
    await createBackup(dbRef, settings.includeMedia);
    await pruneOldBackups(settings.keepLast);
  } catch {
    /* 调度失败静默，不影响站点请求 */
  } finally {
    ticking = false;
  }
}
