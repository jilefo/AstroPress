import type { APIRoute } from "astro";
import { sqlAll } from "@astropress/core";
import { errMsg, json } from "../../lib/http";
import { getDbFileLabel, isValidName } from "../../lib/sql-util";

interface TableMeta {
  name: string;
  type: string;
  rows: number | null;
}

/** Cloudflare D1 内部支撑表（如 _cf_KV），任何读写都会触发 SQLITE_AUTH，列表中隐藏 */
function isInternalTable(name: string): boolean {
  return name.startsWith("_cf_");
}

/** 单次 UNION ALL 查询取所有表的行数（避免 N+1）；视图不计数。
 * 注意：Cloudflare D1 限制单条复合 SELECT 最多 5 个分支，必须分批。 */
async function loadCounts(db: any, tables: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const names = tables.filter((n) => isValidName(n) && !isInternalTable(n)).slice(0, 200);
  if (!names.length) return counts;
  const CHUNK = 5;
  for (let i = 0; i < names.length; i += CHUNK) {
    const group = names.slice(i, i + CHUNK);
    const union = group
      .map((n) => `SELECT '${n.replace(/'/g, "''")}' AS n, COUNT(*) AS c FROM "${n.replace(/"/g, '""')}"`)
      .join(" UNION ALL ");
    try {
      for (const row of await sqlAll(db, union)) {
        counts.set(String(row.n), Number(row.c) || 0);
      }
    } catch {
      /* 单批计数失败不阻塞列表展示 */
    }
  }
  return counts;
}

/** GET /admin-ext/api/db-console/tables — 列出全部表与视图（含表行数） */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  try {
    const items = ((await sqlAll(
      db,
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
    )) as unknown as { name: string; type: string }[])
      .filter((t) => !isInternalTable(t.name));
    const counts = await loadCounts(db, items.filter((t) => t.type === "table").map((t) => t.name));
    const tables: TableMeta[] = items.map((t) => ({
      name: t.name,
      type: t.type,
      rows: t.type === "table" ? counts.get(t.name) ?? null : null,
    }));
    const dbPath = await getDbFileLabel();
    return json({ tables, dbPath });
  } catch (e) {
    return json({ error: errMsg(e) }, 400);
  }
};
