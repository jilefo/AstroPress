import type { APIRoute } from "astro";
import { loadHistory } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

/** GET /admin-ext/api/gist-sync/history — 最近 20 条同步历史（最新在前） */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  const history = await loadHistory(db);
  return json({ ok: true, history });
};
