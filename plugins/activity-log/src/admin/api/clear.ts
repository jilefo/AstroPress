import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { ensureSchema } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** POST /admin-ext/api/activity-log/clear — 清空全部审计日志（需 confirm:true） */
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
  if (body?.confirm !== true) return json({ error: "请勾选确认后再执行此操作" }, 400);

  const db = (locals as any).db;
  try {
    await ensureSchema(db);
    await db.run(sql`DELETE FROM ap_activity_log`);
    return json({ ok: true });
  } catch {
    return json({ error: "清空失败" }, 500);
  }
};
