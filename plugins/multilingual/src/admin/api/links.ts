import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { findGroupByPostId } from "../../lib/links";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function upsertMeta(db: any, postId: number, key: string, value: string) {
  const [existing] = await db
    .select({ id: wpPostmeta.metaId })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)))
    .limit(1);
  if (existing) {
    await db.update(wpPostmeta).set({ metaValue: value }).where(eq(wpPostmeta.metaId, existing.id));
  } else {
    await db.insert(wpPostmeta).values({ postId, metaKey: key, metaValue: value });
  }
}

async function deleteMeta(db: any, postId: number, key: string) {
  await db.delete(wpPostmeta).where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)));
}

async function postExists(db: any, id: number): Promise<boolean> {
  const [row] = await db.select({ id: wpPosts.id }).from(wpPosts).where(eq(wpPosts.id, id)).limit(1);
  return !!row;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const postId = Number(url.searchParams.get("postId"));
  if (!Number.isFinite(postId) || postId <= 0) return json({ error: "缺少 postId 参数" }, 400);
  const group = await findGroupByPostId(db, postId);
  return json({ group });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: {
    action: "link" | "unlink";
    baseId?: number;
    lang?: string;
    targetId?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  if (body.action === "unlink") {
    const targetId = Number(body.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) return json({ error: "缺少 targetId 参数" }, 400);
    await deleteMeta(db, targetId, "_ml_group");
    await deleteMeta(db, targetId, "_ml_lang");
    return json({ ok: true });
  }

  if (body.action === "link") {
    const baseId = Number(body.baseId);
    const targetId = Number(body.targetId);
    const lang = typeof body.lang === "string" ? body.lang.trim().toLowerCase() : "";
    if (!Number.isInteger(baseId) || baseId <= 0 || !Number.isInteger(targetId) || targetId <= 0)
      return json({ error: "baseId 和 targetId 必须为正整数" }, 400);
    if (!lang) return json({ error: "缺少语言代码 lang" }, 400);
    if (baseId === targetId) return json({ error: "不能将文章与自身关联" }, 400);
    if (!(await postExists(db, baseId)) || !(await postExists(db, targetId)))
      return json({ error: "文章不存在" }, 404);

    const baseGroup = await findGroupByPostId(db, baseId);
    const groupId = baseGroup?.groupId || crypto.randomUUID();
    await upsertMeta(db, baseId, "_ml_group", groupId);
    await upsertMeta(db, targetId, "_ml_group", groupId);
    await upsertMeta(db, targetId, "_ml_lang", lang);
    return json({ ok: true, groupId });
  }

  return json({ error: "未知操作" }, 400);
};
