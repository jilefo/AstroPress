import type { APIRoute } from "astro";
import { inArray } from "drizzle-orm";
import { wpPosts, wpPostmeta } from "@astropress/core/schema";
import { readJsonBody } from "../../../lib/json-body";

const ALLOWED_ACTIONS = new Set(["trash", "restore", "delete", "publish", "draft"]);

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<{ action: string; ids: number[] }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { action, ids } = body;
  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: "缺少操作类型或文章 id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    return new Response(JSON.stringify({ error: `不支持的操作类型：${action}` }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const numIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (numIds.length === 0) {
    return new Response(JSON.stringify({ error: "没有有效的文章 id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  if (action === "trash") {
    await db.update(wpPosts).set({ postStatus: "trash", postModified: now, postModifiedGmt: now }).where(inArray(wpPosts.id, numIds));
  } else if (action === "restore") {
    await db.update(wpPosts).set({ postStatus: "draft", postModified: now, postModifiedGmt: now }).where(inArray(wpPosts.id, numIds));
  } else if (action === "delete") {
    // 附件需级联删除存储对象（R2/本地文件）与 postmeta，避免存储泄漏与孤儿数据
    const atts = await db.select({ id: wpPosts.id, postName: wpPosts.postName })
      .from(wpPosts)
      .where(inArray(wpPosts.id, numIds));
    const attNames = atts.filter((a: { id: number; postName: string | null }) => a.postName).map((a: { postName: string }) => a.postName);
    if (attNames.length) {
      const r2 = (locals as any).runtime?.env?.R2 as R2Bucket | undefined;
      if (r2) {
        await Promise.all(attNames.map((k: string) => r2.delete(k).catch(() => {})));
      } else {
        const { unlink } = await import("node:fs/promises");
        const { join } = await import("node:path");
        await Promise.all(attNames.map((k: string) =>
          unlink(join(process.cwd(), "public", "media", k)).catch(() => {})));
      }
    }
    await db.delete(wpPostmeta).where(inArray(wpPostmeta.postId, numIds));
    await db.delete(wpPosts).where(inArray(wpPosts.id, numIds));
  } else if (action === "publish") {
    await db.update(wpPosts).set({ postStatus: "publish", postModified: now, postModifiedGmt: now }).where(inArray(wpPosts.id, numIds));
  } else if (action === "draft") {
    await db.update(wpPosts).set({ postStatus: "draft", postModified: now, postModifiedGmt: now }).where(inArray(wpPosts.id, numIds));
  }

  return new Response(JSON.stringify({ ok: true, count: numIds.length }), { headers: { "Content-Type": "application/json" } });
};
