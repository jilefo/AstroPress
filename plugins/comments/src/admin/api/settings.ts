import type { APIRoute } from "astro";
import { loadSettings, sanitizeSettings, saveSettings } from "../../lib/settings";
import { isSameOrigin, json } from "../../lib/http";

/** GET /admin-ext/api/comments/settings */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const settings = await loadSettings((locals as any).db);
  return json(settings);
};

/** POST /admin-ext/api/comments/settings —— 白名单清洗与截断 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!isSameOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const settings = sanitizeSettings(body);
  const saved = await saveSettings((locals as any).db, settings);
  return json({ ok: true, settings: saved });
};
