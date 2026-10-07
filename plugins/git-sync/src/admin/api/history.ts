import type { APIRoute } from "astro";
import { json } from "../../lib/http";
import { loadHistory } from "../../lib/settings";

/**
 * GET /admin-ext/api/git-sync/history
 * 返回最近 20 条同步记录（时间/平台/文件数/结果/错误）。
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  const history = await loadHistory(db);
  return json({ ok: true, history });
};
