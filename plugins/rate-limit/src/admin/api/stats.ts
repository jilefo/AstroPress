import type { APIRoute } from "astro";
import { loadSettings } from "../../lib/settings";
import * as limiter from "../../lib/limiter";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  return json({ ...limiter.stats(settings.rules.map((r) => r.name)), settings });
};
