import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions, wpPosts } from "@astropress/core/schema";

async function upsertOption(db: any, name: string, value: string) {
  const existing = await db.select({ id: wpOptions.optionId }).from(wpOptions).where(eq(wpOptions.optionName, name)).limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionName, name));
  } else {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value, autoload: "yes" });
  }
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  let pageId: number;
  try {
    const body = (await request.json()) as { pageId?: number | string };
    pageId = Number(body.pageId);
    if (!pageId) throw new Error("invalid");
  } catch {
    return new Response(JSON.stringify({ error: "缺少页面 id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const [page] = await db.select({ id: wpPosts.id, slug: wpPosts.postName }).from(wpPosts).where(eq(wpPosts.id, pageId)).limit(1);
  if (!page) {
    return new Response(JSON.stringify({ error: "页面不存在" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  await upsertOption(db, "show_on_front", "page");
  await upsertOption(db, "page_on_front", String(pageId));

  return new Response(JSON.stringify({ ok: true, pageId, slug: page.slug }), { headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  await upsertOption(db, "show_on_front", "posts");
  await upsertOption(db, "page_on_front", "0");

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
