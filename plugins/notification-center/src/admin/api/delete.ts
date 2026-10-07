import type { APIRoute } from "astro";
import { deleteNotifications } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const body = await request.json() as { ids?: number[]; confirm?: boolean };
    if (!body.confirm) return json({ error: "请勾选确认后再执行此操作" }, 400);
    await deleteNotifications(db, body.ids || []);
    return json({ ok: true });
  } catch { return json({ error: "无效的请求" }, 400); }
};
