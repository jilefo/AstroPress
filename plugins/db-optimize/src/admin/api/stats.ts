import type { APIRoute } from "astro";
import { getStats } from "../../lib/stats";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

/**
 * GET /admin-ext/api/db-opt/stats
 * 返回数据库体积、各表行数、autoload 选项与修订版本统计。
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  return json(await getStats(db));
};
