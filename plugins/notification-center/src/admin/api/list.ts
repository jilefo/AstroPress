import type { APIRoute } from "astro";
import { listNotifications } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ url, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  const page = Number(url.searchParams.get("page") || 1);
  const perPage = Math.min(Number(url.searchParams.get("perPage") || 20), 50);
  const filter = url.searchParams.get("filter") || undefined;
  try {
    const result = await listNotifications(db, { page, perPage, filter, userId: (locals as any).user.id });
    return json({ ...result, ok: true });
  } catch (err: any) {
    return json({ error: String(err?.message ?? err).slice(0, 200) }, 500);
  }
};
