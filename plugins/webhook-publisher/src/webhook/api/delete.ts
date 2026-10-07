import type { APIRoute } from "astro";
import { requireApiKey } from "./_auth";
import { appendLog } from "../../lib/logs";
import { wpPosts, wpPostmeta } from "@astropress/core/schema";
import { and, eq } from "drizzle-orm";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (ctx) => {
  const auth = await requireApiKey(ctx);
  if (auth instanceof Response) return auth;
  const { keyData } = auth;
  const db = (ctx.locals as any).db;

  if (!keyData.permissions.includes("delete")) {
    await appendLog(db, { action: "delete", keyId: keyData.id, keyName: keyData.name, status: "error", message: "权限不足：缺少 delete 权限" });
    return json({ error: "权限不足：当前 API 密钥没有删除权限" }, 403);
  }

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }

  const { id, slug, type } = body;
  if (!id && !slug) return json({ error: "必须提供 id 或 slug" }, 400);

  try {
    let postId: number;
    if (id) {
      postId = Number(id);
      if (!Number.isFinite(postId) || postId <= 0) return json({ error: "id 格式不正确" }, 400);
    } else {
      // 提供 type 时限定范围，避免页面 slug 误匹配文章
      const cond = type
        ? and(eq(wpPosts.postName, String(slug)), eq(wpPosts.postType, String(type)))
        : eq(wpPosts.postName, String(slug));
      const [post] = await db.select({ id: wpPosts.id }).from(wpPosts).where(cond).limit(1);
      if (!post) return json({ error: "内容不存在" }, 404);
      postId = post.id;
    }

    const [deleted] = await db.delete(wpPosts).where(eq(wpPosts.id, postId)).returning({ id: wpPosts.id });
    if (!deleted) return json({ error: "内容不存在" }, 404);

    // 清理孤立的 postmeta
    await db.delete(wpPostmeta).where(eq(wpPostmeta.postId, postId));

    await appendLog(db, {
      action: "delete",
      keyId: keyData.id,
      keyName: keyData.name,
      status: "success",
      message: `已删除内容 ID ${postId}`,
    });

    return json({ ok: true, deletedId: postId });
  } catch (err: any) {
    await appendLog(db, {
      action: "delete",
      keyId: keyData.id,
      keyName: keyData.name,
      status: "error",
      message: err?.message ?? String(err),
    });
    console.error("[webhook-publisher] delete failed:", err);
    return json({ error: "删除失败，请检查服务端日志" }, 500);
  }
};
