import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { apComments, ensureSchema } from "../../lib/schema";
import { getOption } from "../../lib/settings";
import { getClientIp, isSameOrigin, json } from "../../lib/http";

/** POST /admin-ext/api/comments/reply { id, content } —— 以站点名义回复，直接 approved */
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

  const id = parseInt(String(body?.id ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return json({ error: "缺少目标评论" }, 400);

  const content = String(body?.content ?? "").trim();
  if (content.length < 1 || content.length > 4000) {
    return json({ error: "回复内容长度需为 1-4000 个字符" }, 400);
  }

  const [parent] = await db
    .select({
      id: apComments.id,
      postId: apComments.postId,
      status: apComments.status,
    })
    .from(apComments)
    .where(eq(apComments.id, id))
    .limit(1);
  if (!parent) return json({ error: "目标评论不存在" }, 400);
  if (parent.status === "trash" || parent.status === "spam") {
    return json({ error: "不能回复垃圾或回收站中的评论" }, 400);
  }

  const [blogname, adminEmail] = await Promise.all([
    getOption(db, "blogname"),
    getOption(db, "admin_email"),
  ]);
  const author = (blogname || "站点管理员").slice(0, 50);
  const email = adminEmail || "comments@localhost";
  const ip = getClientIp(request);
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 255);

  let newId = 0;
  try {
    const result = await db
      .insert(apComments)
      .values({
        postId: parent.postId,
        parent: parent.id,
        author,
        email,
        website: "",
        content,
        status: "approved",
        ip,
        userAgent,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: apComments.id });
    newId = Number(result?.[0]?.id) || 0;
  } catch {
    return json({ error: "回复失败" }, 500);
  }

  return json({ ok: true, id: newId, status: "approved" });
};
