import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  return json(settings);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    related: Math.max(0, Math.min(12, parseInt(body.related ?? "4", 10) || 4)),
    random: Math.max(0, Math.min(12, parseInt(body.random ?? "4", 10) || 4)),
    popular: Math.max(0, Math.min(12, parseInt(body.popular ?? "4", 10) || 4)),
    heading: String(body.heading ?? "更多阅读").slice(0, 80),
    css: String(body.css ?? "").slice(0, 4000),
  });
  return json({ ok: true, settings });
};
