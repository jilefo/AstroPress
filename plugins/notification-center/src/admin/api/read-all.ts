import type { APIRoute } from "astro";
import { markAllRead } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    await markAllRead(db, (locals as any).user.id);
    return json({ ok: true });
  } catch (err: any) { return json({ error: String(err?.message ?? err).slice(0, 200) }, 500); }
};
