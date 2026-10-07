import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { ensureSchema } from "../../lib/schema";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /admin-ext/api/404/actions
 *   { confirm: true, action: "clear" }                 清空全部记录
 *   { confirm: true, action: "delete", path: string }  删除单条
 */
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

  if (body?.confirm !== true) return json({ error: "请确认操作" }, 400);

  const db = (locals as any).db;
  try {
    await ensureSchema(db);

    if (body.action === "clear") {
      await db.run(sql`DELETE FROM ap_404_log`);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      if (typeof body.path !== "string") return json({ error: "缺少路径" }, 400);
      const path = body.path.slice(0, 500);
      await db.run(sql`DELETE FROM ap_404_log WHERE path = ${path}`);
      return json({ ok: true });
    }

    return json({ error: "未知操作" }, 400);
  } catch {
    return json({ error: "操作失败" }, 500);
  }
};
