import { loadSettings } from "./settings";
import { loadState, saveState, isProcessRunning } from "./state";
import { startGeneration } from "./generator";
import { hasFileSystem } from "@astropress/core";

/**
 * WP-Cron 风格调度器：
 *   - 不依赖独立进程；站点有访问时由 post 中间件调用 ensureScheduler()
 *   - 首次调用启动 60 秒精度的 setInterval 定时器（unref，不阻止进程退出）
 *   - 支持每小时 / 每天定点 / 每周定点；手动模式不调度
 *   - 触发时刻记忆存 wp_options（astropress_static_html_state.lastAutoAt），重启不重复
 *   - Cloudflare Workers 环境不启动（无文件系统，且 Pages 构建产物即静态站）
 */

let timer: ReturnType<typeof setInterval> | null = null;
let dbRef: any = null;
let originRef = "";
let ticking = false;

export function ensureScheduler(db: any, origin: string): void {
  if (!hasFileSystem()) return; // CF Workers：无文件系统，不启动调度
  if (db) dbRef = db;
  if (origin) originRef = origin;
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  // 不保持事件循环存活（CLI/构建场景）
  if (typeof (timer as any).unref === "function") (timer as any).unref();
  // 启动后稍等再首次检查，避开服务启动高峰
  setTimeout(() => void tick(), 5_000);
}

function isDue(schedule: string, time: string, weekday: number, lastAutoAt: string | null): boolean {
  const now = new Date();
  const last = lastAutoAt ? new Date(lastAutoAt) : null;

  if (schedule === "hourly") {
    if (!last) return true;
    return now.getTime() - last.getTime() >= 3_600_000 - 60_000;
  }

  const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
  const fireAt = new Date(now);
  fireAt.setHours(hh || 3, mm || 0, 0, 0);

  if (schedule === "daily") {
    if (now < fireAt) return false;
    // 今天的触发点之后还没触发过
    return !last || last < fireAt;
  }

  if (schedule === "weekly") {
    if (now.getDay() !== weekday) return false;
    if (now < fireAt) return false;
    return !last || last < fireAt;
  }

  return false;
}

async function tick(): Promise<void> {
  if (ticking || !dbRef || isProcessRunning()) return;
  ticking = true;
  try {
    const settings = await loadSettings(dbRef);
    if (!settings.enabled || settings.schedule === "manual") return;
    const state = await loadState(dbRef);
    if (state.running) return;
    const origin = originRef || state.origin || "";
    if (!isDue(settings.schedule, settings.scheduleTime, settings.scheduleWeekday, state.lastAutoAt)) return;
    // 先落库触发时间，防止下一 tick 重复触发
    state.lastAutoAt = new Date().toISOString();
    state.origin = origin || state.origin;
    await saveState(dbRef, state);
    const res = await startGeneration(dbRef, origin, "schedule");
    if (!res.ok) {
      // 启动失败（如已有任务），忽略，下个 tick 再试
    }
  } catch {
    /* 调度失败静默，不影响站点请求 */
  } finally {
    ticking = false;
  }
}
