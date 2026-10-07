/**
 * 重定向规则存取。
 * 规则以 JSON 数组形式存放在 wp_options（key: astropress_redirects）。
 *
 * 跨 isolate 并发安全（V7 混沌测试修复）：
 * 旧实现为「读全量数组 → push/splice → 整份写回」+ 进程内锁。
 * 进程锁不跨 Cloudflare edge isolate，并发请求落到不同 isolate 时：
 *   - 各自读到旧数组后整份覆盖 → 规则丢失（实测 10 条并发只落库 5 条）
 *   - 去重预检查（TOCTOU）双双通过 → 同 from 重复规则（实测落库 2 条）
 * 现所有写操作改为 SQLite 单语句原子 JSON 改写（json_insert / json_group_array
 * 聚合重建 / json_set），由 D1 写锁串行化，跨 isolate 无丢更新；from 去重下推
 * 到 UPDATE 的 NOT EXISTS 条件，竞争失败者 changes=0。
 * 保存时的环检测仍为预检查——极小并发窗口绕过有运行时中间件 5 跳 visited 兜底。
 */
import { wpOptions } from "@astropress/core/schema";
import { sqlRun } from "@astropress/core";
import { eq, sql } from "drizzle-orm";

export interface RedirectRule {
  id: string;
  from: string;
  to: string;
  type: 301 | 302;
  enabled: boolean;
  hits: number;
  createdAt: string; // ISO 时间字符串
}

const OPTION_KEY = "astropress_redirects";

// 进程内互斥锁：单 isolate 内仍串行化「预检查→写」，配合 DB 原子写双保险。
let queue: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export async function loadRedirects(db: any): Promise<RedirectRule[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, OPTION_KEY))
    .limit(1);
  try {
    const parsed = JSON.parse(row?.value ?? "[]");
    return Array.isArray(parsed) ? (parsed as RedirectRule[]) : [];
  } catch {
    return [];
  }
}

/** 幂等确保规则选项行存在（'[]'）。 */
async function ensureOption(db: any): Promise<void> {
  await sqlRun(
    db,
    sql`INSERT INTO wp_options (option_name, option_value, autoload)
        VALUES (${OPTION_KEY}, '[]', 'yes')
        ON CONFLICT(option_name) DO NOTHING`
  );
}

/** 将整个数组 JSON.stringify 后 upsert（仅保留给初始化/修复场景） */
export async function saveRedirects(db: any, list: RedirectRule[]): Promise<void> {
  const payload = JSON.stringify(list);
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, OPTION_KEY))
    .limit(1);
  if (row) {
    await db.update(wpOptions).set({ optionValue: payload }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: OPTION_KEY, optionValue: payload });
  }
}

/** 原子追加结果："duplicate" 表示跨 isolate 竞争中同 from 已被其他请求抢先写入 */
export type AddResult = RedirectRule | "duplicate";

export function addRedirect(db: any, data: { from: string; to: string; type: 301 | 302 }): Promise<AddResult> {
  return withLock(async () => {
    await ensureOption(db);
    const rule: RedirectRule = {
      id: crypto.randomUUID(),
      from: data.from,
      to: data.to,
      type: data.type,
      enabled: true,
      hits: 0,
      createdAt: new Date().toISOString(),
    };
    // 原子 append + 去重合一：json_insert '$[#]' 在数组尾追加；
    // NOT EXISTS 保证忽略大小写的同 from 唯一性；json_valid 防损坏选项被写成 NULL。
    const meta = await sqlRun(
      db,
      sql`
        UPDATE wp_options
        SET option_value = json_insert(option_value, '$[#]', json(${JSON.stringify(rule)}))
        WHERE option_name = ${OPTION_KEY}
          AND json_valid(option_value)
          AND NOT EXISTS (
            SELECT 1 FROM json_each(option_value)
            WHERE lower(json_extract(value, '$.from')) = lower(${data.from})
          )`
    );
    if (meta.changes === 0) return "duplicate";
    return rule;
  });
}

export function updateRedirect(
  db: any,
  id: string,
  patch: Partial<Pick<RedirectRule, "from" | "to" | "type" | "enabled">>
): Promise<RedirectRule | null> {
  return withLock(async () => {
    // 先确认规则存在
    const list0 = await loadRedirects(db);
    if (!list0.some((r) => r.id === id)) return null;

    // 用 json_set 只更新提供的字段；未提供的键不出现在 setParts 中即保持原值
    const setParts: any[] = [];
    if (patch.from !== undefined) setParts.push(sql`'$.from', ${patch.from}`);
    if (patch.to !== undefined) setParts.push(sql`'$.to', ${patch.to}`);
    if (patch.type !== undefined) setParts.push(sql`'$.type', ${patch.type}`);
    if (patch.enabled !== undefined) {
      // 必须写 JSON 布尔（json('true')），直接绑 1/0 会落成数字
      setParts.push(sql`'$.enabled', json(${patch.enabled ? "true" : "false"})`);
    }
    const rebuild = setParts.length
      ? sql`json_set(value, ${sql.join(setParts, sql`, `)})`
      : sql`value`;

    await sqlRun(
      db,
      sql`
        UPDATE wp_options
        SET option_value = (
          SELECT COALESCE(json_group_array(
            CASE WHEN json_extract(value, '$.id') = ${id} THEN ${rebuild} ELSE json(value) END
          ), '[]')
          FROM json_each(option_value)
        )
        WHERE option_name = ${OPTION_KEY} AND json_valid(option_value)`
    );

    const list = await loadRedirects(db);
    return list.find((r) => r.id === id) ?? null;
  });
}

export function removeRedirect(db: any, id: string): Promise<boolean> {
  return withLock(async () => {
    // 聚合重建排除目标；EXISTS 保证不存在时 changes=0
    const meta = await sqlRun(
      db,
      sql`
        UPDATE wp_options
        SET option_value = (
          SELECT COALESCE(json_group_array(json(value)), '[]')
          FROM json_each(option_value)
          WHERE json_extract(value, '$.id') != ${id}
        )
        WHERE option_name = ${OPTION_KEY}
          AND json_valid(option_value)
          AND EXISTS (
            SELECT 1 FROM json_each(option_value)
            WHERE json_extract(value, '$.id') = ${id}
          )`
    );
    return meta.changes > 0;
  });
}

/** 命中计数 +1：单语句原子 json_set，跨 isolate 并发零丢失（旧实现整份读改写会丢计数） */
export function bumpHits(db: any, id: string): Promise<void> {
  return withLock(async () => {
    await sqlRun(
      db,
      sql`
        UPDATE wp_options
        SET option_value = (
          SELECT COALESCE(json_group_array(
            CASE WHEN json_extract(value, '$.id') = ${id}
              THEN json_set(value, '$.hits', COALESCE(json_extract(value, '$.hits'), 0) + 1)
              ELSE json(value) END
          ), '[]')
          FROM json_each(option_value)
        )
        WHERE option_name = ${OPTION_KEY}
          AND json_valid(option_value)
          AND EXISTS (
            SELECT 1 FROM json_each(option_value)
            WHERE json_extract(value, '$.id') = ${id}
          )`
    );
  });
}
