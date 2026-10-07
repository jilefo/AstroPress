import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";
import { ensureScheduler } from "../../lib/warm";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** GET /admin-ext/api/cache-warmer/settings */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  return json(settings);
};

/** POST /admin-ext/api/cache-warmer/settings */
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
    baseUrl: body?.baseUrl,
    urlCount: body?.urlCount,
    intervalHours: body?.intervalHours,
    enabled: !!body?.enabled,
  });

  // 立即应用新的定时配置
  await ensureScheduler(db, true).catch(() => {});

  return json({ ok: true, settings });
};
