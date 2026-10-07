import type { APIRoute } from "astro";
import { markRead } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const body = await request.json() as { ids?: number[] };
    await markRead(db, body.ids || [], (locals as any).user.id);
    return json({ ok: true });
  } catch { return json({ error: "无效的请求" }, 400); }
};
