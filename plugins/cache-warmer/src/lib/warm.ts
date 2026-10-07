import { loadSettings, MAX_URL_COUNT, type CacheWarmerSettings } from "./settings";
import { isCloudflareRuntime } from "@astropress/core";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

/**
 * 预热执行器：URL 收集（首页 + sitemap 前 N 个）、串行抓取、运行互斥、
 * 批次记录（内存最近 10 批）与定时调度。
 *
 * 注意：SSR 下模块可能被多次加载（如 dev 热更新 / 多入口），
 * 运行状态与 interval 挂载到 globalThis 上防重复。
 */

export interface BatchRecord {
  at: number;
  trigger: "manual" | "schedule";
  total: number;
  ok: number;
  fail: number;
  durationMs: number;
}

interface WarmerState {
  running: boolean;
  records: BatchRecord[];
  timer: any;
  currentIntervalHours: number;
}

const G_KEY = "__astropress_cache_warmer__";

function state(): WarmerState {
  const g = globalThis as any;
  if (!g[G_KEY]) {
    g[G_KEY] = { running: false, records: [], timer: null, currentIntervalHours: -1 } as WarmerState;
  }
  return g[G_KEY] as WarmerState;
}

const FETCH_TIMEOUT = 10_000;
const FETCH_INTERVAL = 300;
const MAX_RECORDS = 10;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 单 URL 抓取：10s 超时，status<400 计成功；永不抛异常 */
async function fetchOne(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "AstroPress-CacheWarmer/0.1" },
    });
    // 消费响应体，释放连接供后续请求复用
    await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    return res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 收集预热 URL：基址首页 + /sitemap.xml 解析 <loc> 前 N 个，去重、封顶 */
async function collectUrls(settings: CacheWarmerSettings): Promise<string[]> {
  const base = settings.baseUrl.replace(/\/+$/, "");
  const limit = Math.min(settings.urlCount, MAX_URL_COUNT);
  const urls: string[] = [base + "/"];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(base + "/sitemap.xml", { signal: ctrl.signal });
    if (res.ok) {
      const xml = await res.text();
      const re = /<loc>([^<]+)<\/loc>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null && urls.length < limit) {
        const u = String(m[1] ?? "").trim();
        if (/^https?:\/\//i.test(u)) urls.push(u);
      }
    }
  } catch {
    /* sitemap 不可达则只预热首页 */
  } finally {
    clearTimeout(timer);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

const RUNS_KEY = "astropress_cache_warmer_runs";

/** 读取持久化的最近 10 批运行记录（wp_options） */
export async function loadRuns(db: any): Promise<BatchRecord[]> {
  try {
    const [row] = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, RUNS_KEY))
      .limit(1);
    const parsed = JSON.parse(row?.value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 持久化最近 10 批运行记录：CF Workers 上内存记录跨 isolate 不可见，必须落库 */
async function persistRuns(db: any, record: BatchRecord): Promise<void> {
  try {
    const existing = await loadRuns(db);
    const runs = [record, ...existing].slice(0, MAX_RECORDS);
    const payload = JSON.stringify(runs);
    const [row] = await db
      .select({ optionId: wpOptions.optionId })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, RUNS_KEY))
      .limit(1);
    if (row) {
      await db.update(wpOptions).set({ optionValue: payload }).where(eq(wpOptions.optionId, row.optionId));
    } else {
      await db.insert(wpOptions).values({ optionName: RUNS_KEY, optionValue: payload });
    }
  } catch {
    /* 持久化失败不影响预热本身 */
  }
}

/**
 * 触发一批预热。已在运行返回 false（调用方据此回 409）；
 * 否则置运行标志后异步执行，立即返回 true。
 *
 * CF Workers 上后台任务必须交给运行时 waitUntil 托管，否则 202 返回后
 * isolate 回收导致批次静默夭折——由调用方传入 schedule。
 */
export function startWarm(
  db: any,
  trigger: "manual" | "schedule",
  schedule?: (p: Promise<void>) => void
): boolean {
  const st = state();
  if (st.running) return false;
  st.running = true;

  const batch = (async () => {
    const startedAt = Date.now();
    let total = 0;
    let ok = 0;
    let fail = 0;
    try {
      const settings = await loadSettings(db);
      const urls = await collectUrls(settings);
      total = urls.length;
      for (const u of urls) {
        if (await fetchOne(u)) ok++;
        else fail++;
        await sleep(FETCH_INTERVAL);
      }
    } catch {
      /* 批次失败静默，记录照写 */
    } finally {
      const record: BatchRecord = {
        at: startedAt,
        trigger,
        total,
        ok,
        fail,
        durationMs: Date.now() - startedAt,
      };
      const cur = state();
      cur.records.unshift(record);
      if (cur.records.length > MAX_RECORDS) cur.records.length = MAX_RECORDS;
      cur.running = false;
      await persistRuns(db, record);
    }
  })();

  if (schedule) schedule(batch);
  else void batch.catch(() => {});
  return true;
}

export function getStatus(): { running: boolean; records: BatchRecord[] } {
  const st = state();
  return { running: st.running, records: st.records.slice() };
}

// ── 定时调度 ─────────────────────────────────────────────────────────

let lastCheck = 0;

/**
 * 按当前设置恢复/调整定时预热（幂等；15s 节流）。
 * 插件所在模块随 SSR 服务加载后即由后台中间件调用一次完成「加载即恢复调度」；
 * 设置保存后以 force=true 立即应用。
 */
export async function ensureScheduler(db: any, force = false): Promise<void> {
  // Cloudflare Workers 无常驻进程，定时预热无意义（Pages CDN 即缓存层），跳过
  if (isCloudflareRuntime()) return;
  const now = Date.now();
  if (!force && now - lastCheck < 15_000) return;
  lastCheck = now;

  let settings: CacheWarmerSettings;
  try {
    settings = await loadSettings(db);
  } catch {
    return;
  }

  const want = settings.enabled ? settings.intervalHours : 0;
  const st = state();
  if (want === st.currentIntervalHours && (want === 0 || st.timer)) return;

  if (st.timer) {
    clearInterval(st.timer);
    st.timer = null;
  }
  st.currentIntervalHours = want;

  if (want > 0) {
    st.timer = setInterval(() => {
      startWarm(db, "schedule");
    }, want * 3_600_000);
    // 不因定时器阻止进程退出
    if (st.timer && typeof st.timer === "object" && typeof st.timer.unref === "function") {
      st.timer.unref();
    }
  }
}
