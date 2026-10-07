import { wpOptions } from "@astropress/core/schema";
import { invalidatePluginStates } from "@astropress/core/plugin-state";
import { sqlRun } from "@astropress/core";
import { eq, sql } from "drizzle-orm";

const STATES_KEY = "astropress_plugin_states";
const CACHE_TTL = 10_000;

export type PluginStates = Record<string, boolean>; // slug → enabled（缺省 true）

let cache: { at: number; states: PluginStates } | null = null;

export async function loadStates(db: any): Promise<PluginStates> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.states;
  try {
    const [row] = await db
      .select({ v: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, STATES_KEY))
      .limit(1);
    const states: PluginStates = row?.v ? JSON.parse(row.v) : {};
    cache = { at: Date.now(), states };
    return states;
  } catch {
    return cache?.states ?? {};
  }
}

export async function isEnabled(db: any, slug: string): Promise<boolean> {
  const states = await loadStates(db);
  return states[slug] !== false;
}

/** 立即失效缓存（设置变更后调用） */
export function invalidateStates(): void {
  cache = null;
}

/**
 * 原子合并写入：在 DB 侧用 json_patch 把 patch 合并进现有状态后整体写回。
 *
 * 背景（真实 BUG）：saveStates 是「读-改-写」整个 option，读走 10s 进程缓存；
 * 进程内锁无法跨边缘 isolate，10s 内对不同 isolate 的连续启停会以后写的
 * 陈旧快照整份覆盖先写的改动（复现：批量 POST 后部分成员状态回退）。
 * json_patch 单语句原子合并只触碰本次变动的键，天然免疫该竞态。
 *
 * @param patch    本次要变更的 slug → enabled（未提及的键保持 DB 现值不变）
 * @param validSlugs 传入时先按白名单剔除历史脏键（基于最新 DB 值）
 */
export async function mergeStates(
  db: any,
  patch: PluginStates,
  validSlugs?: ReadonlySet<string>
): Promise<void> {
  if (validSlugs) {
    // 白名单自清洁：脏键属历史遗留、正常流程不再产生，清理失败不阻塞启停
    try {
      invalidateStates();
      const cur = await loadStates(db);
      const dirty = Object.keys(cur).filter((k) => !validSlugs.has(k));
      if (dirty.length) {
        // JSON 路径作为绑定参数传入，值必须是 $."slug" 原文——
        // 不能带 SQL 单引号（绑定参数不会被解释为 SQL 语法，多带引号会使
        // 路径变成 '\'$."slug"\'' 字面量，json_remove 静默失败，自清洁失效）
        const paths = dirty
          .map((k) => k.replace(/[^A-Za-z0-9_-]/g, ""))
          .filter(Boolean)
          .map((k) => `$."${k}"`);
        if (paths.length) {
          await sqlRun(
            db,
            sql`UPDATE wp_options SET option_value = json_remove(option_value, ${sql.join(
              paths.map((p) => sql`${p}`),
              sql`, `
            )}) WHERE option_name = ${STATES_KEY}`
          );
        }
      }
    } catch {
      /* 自清洁失败不影响主流程 */
    }
  }
  const patchJson = JSON.stringify(patch);
  const [row] = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, STATES_KEY))
    .limit(1);
  if (row) {
    await sqlRun(
      db,
      sql`UPDATE wp_options SET option_value = json_patch(option_value, ${patchJson}) WHERE option_name = ${STATES_KEY}`
    );
  } else {
    await db.insert(wpOptions).values({ optionName: STATES_KEY, optionValue: patchJson });
  }
  invalidateStates();
  // 联动失效前台中间件共享状态缓存，本进程零延迟生效；跨进程最坏 15s TTL
  invalidatePluginStates();
}

/** 禁用的插件 slug 集合（含 meta 信息时由调用方过滤） */
export function disabledSlugs(states: PluginStates): string[] {
  return Object.keys(states).filter((k) => states[k] === false);
}
