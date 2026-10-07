import type { APIRoute } from "astro";
import { inArray } from "drizzle-orm";
import { ensureSchema, apComments, type CommentStatus } from "../../lib/schema";
import { isSameOrigin, json } from "../../lib/http";

const STATUS_ACTIONS: Record<string, CommentStatus> = {
  approve: "approved",
  spam: "spam",
  trash: "trash",
};

/** POST /admin-ext/api/comments/action { ids:number[], action } */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!isSameOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const db = (locals as any).db;
  try {
    await ensureSchema(db);
  } catch {
    return json({ error: "数据表初始化失败" }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const rawIds = Array.isArray(body?.ids) ? body.ids : [];
  const ids = rawIds
    .map((v: unknown) => parseInt(String(v), 10))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .slice(0, 500);
  if (ids.length === 0) return json({ error: "未选择评论" }, 400);

  const action = String(body?.action ?? "");
  try {
    if (action === "delete") {
      await db.delete(apComments).where(inArray(apComments.id, ids));
    } else if (STATUS_ACTIONS[action]) {
      await db.update(apComments).set({ status: STATUS_ACTIONS[action] }).where(inArray(apComments.id, ids));
    } else {
      return json({ error: "未知操作" }, 400);
    }
  } catch {
    return json({ error: "操作失败" }, 500);
  }

  return json({ ok: true });
};
