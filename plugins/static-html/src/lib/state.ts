import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const STATE_KEY = "astropress_static_html_state";
const RUNS_KEY = "astropress_static_html_runs";
const MAX_RUNS = 20;

export interface RunError {
  url: string;
  status?: number;
  error: string;
}

export interface RunState {
  running: boolean;
  trigger: "manual" | "schedule" | "";
  startedAt: string | null;
  finishedAt: string | null;
  status: "idle" | "running" | "ok" | "warn" | "error";
  /** 进度文案（如 正在抓取 12/80） */
  phase: string;
  pages: number;
  assets: number;
  bytes: number;
  outputDir: string;
  errors: RunError[];
  /** 调度器上次自动触发时间（ISO） */
  lastAutoAt: string | null;
  /** 调度器记忆的站点 origin（供定时自抓取使用） */
  origin: string;
}

const EMPTY_STATE: RunState = {
  running: false,
  trigger: "",
  startedAt: null,
  finishedAt: null,
  status: "idle",
  phase: "",
  pages: 0,
  assets: 0,
  bytes: 0,
  outputDir: "",
  errors: [],
  lastAutoAt: null,
  origin: "",
};

async function readOption(db: any, key: string): Promise<any> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, key))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function writeOption(db: any, key: string, value: unknown): Promise<void> {
  const payload = JSON.stringify(value);
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, key))
    .limit(1);
  if (row) {
    await db.update(wpOptions).set({ optionValue: payload }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: key, optionValue: payload });
  }
}

export async function loadState(db: any): Promise<RunState> {
  const s = await readOption(db, STATE_KEY);
  // 进程重启后 running 标志可能残留为 true（异常中断）——视为已结束
  if (s && s.running && !processRunning) {
    s.running = false;
    if (s.status === "running") s.status = "error";
    s.phase = "上次生成因服务重启中断";
  }
  return { ...EMPTY_STATE, ...(s ?? {}) };
}

export async function saveState(db: any, state: RunState): Promise<void> {
  await writeOption(db, STATE_KEY, state);
}

export interface RunRecord {
  startedAt: string;
  finishedAt: string | null;
  trigger: "manual" | "schedule";
  status: "ok" | "warn" | "error";
  pages: number;
  assets: number;
  bytes: number;
  outputDir: string;
  ms: number;
  errors: RunError[];
}

export async function loadRuns(db: any): Promise<RunRecord[]> {
  const list = await readOption(db, RUNS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function appendRun(db: any, rec: RunRecord): Promise<RunRecord[]> {
  const list = await loadRuns(db);
  list.unshift(rec);
  const trimmed = list.slice(0, MAX_RUNS);
  await writeOption(db, RUNS_KEY, trimmed);
  return trimmed;
}

/** 进程内互斥：同一进程同时只允许一个生成任务 */
let processRunning = false;
export function isProcessRunning(): boolean {
  return processRunning;
}
export function markProcessRunning(v: boolean): void {
  processRunning = v;
}
