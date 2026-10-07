import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpPosts, wpPostmeta } from "@astropress/core/schema";

export const DELETE: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const id = Number(params.id);
  if (!id) return new Response(JSON.stringify({ error: "无效的媒体 id" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const [post] = await db.select({ postName: wpPosts.postName })
    .from(wpPosts).where(eq(wpPosts.id, id)).limit(1);

  if (!post) return new Response(JSON.stringify({ error: "媒体不存在或已被删除" }), { status: 404, headers: { "Content-Type": "application/json" } });

  const r2 = (locals as any).runtime?.env?.R2 as R2Bucket | undefined;
  if (r2) {
    await r2.delete(post.postName);
  } else {
    try {
      const { unlink } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await unlink(join(process.cwd(), "public", "media", post.postName));
    } catch { /* ignore missing file */ }
  }

  await db.delete(wpPostmeta).where(eq(wpPostmeta.postId, id));
  await db.delete(wpPosts).where(eq(wpPosts.id, id));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
