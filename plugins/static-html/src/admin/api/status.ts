import type { APIRoute } from "astro";
import { loadRuns, loadState } from "../../lib/state";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  const [state, runs] = await Promise.all([loadState(db), loadRuns(db)]);
  return json({ state, runs });
};
