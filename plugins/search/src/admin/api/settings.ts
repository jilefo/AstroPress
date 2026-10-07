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
  // POST 同源校验，防 CSRF
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
    placeholder: String(body.placeholder ?? "搜索文章…").slice(0, 80),
    perPage: Math.max(1, Math.min(100, parseInt(body.perPage ?? "20", 10) || 20)),
    minChars: Math.max(1, Math.min(10, parseInt(body.minChars ?? "2", 10) || 2)),
    injectButton: !!body.injectButton,
  });
  return json({ ok: true, settings });
};
