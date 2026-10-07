import type { APIRoute } from "astro";
import { getStatus, loadRuns } from "../../lib/warm";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** GET /admin-ext/api/cache-warmer/status — 运行状态 + 最近 10 批记录 */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const status = getStatus();
  // CF Workers：当前 isolate 无内存记录时回退读 DB 持久化记录
  if (status.records.length === 0) {
    status.records = await loadRuns((locals as any).db);
  }
  return json(status);
};
