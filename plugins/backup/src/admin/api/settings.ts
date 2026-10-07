import type { APIRoute } from "astro";
import { json, sameOrigin } from "../../lib/http";
import { loadSettings, saveSettings, sanitize } from "../../lib/settings";

/** GET /admin-ext/api/backup/settings — 读取自动备份设置 */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  return json({ ok: true, settings });
};

/** POST /admin-ext/api/backup/settings — 保存自动备份设置 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);
  const db = (locals as any).db;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const settings = await saveSettings(db, sanitize(body ?? {}));
  return json({ ok: true, settings });
};
