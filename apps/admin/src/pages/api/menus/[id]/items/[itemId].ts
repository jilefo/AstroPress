import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpPosts, wpPostmeta, wpTermRelationships } from "@astropress/core/schema";

// PATCH — rename label or change parent/order for a single item
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const itemId = Number(params.itemId);
  const body = await request.json() as { title?: string; url?: string; menuOrder?: number; postParent?: number };

  if (body.title !== undefined || body.menuOrder !== undefined || body.postParent !== undefined) {
    const set: Record<string, any> = {};
    if (body.title !== undefined) set.postTitle = body.title;
    if (body.menuOrder !== undefined) set.menuOrder = body.menuOrder;
    if (body.postParent !== undefined) set.postParent = body.postParent;
    await db.update(wpPosts).set(set).where(eq(wpPosts.id, itemId));
  }
  if (body.url !== undefined) {
    // upsert postmeta
    await db.insert(wpPostmeta)
      .values({ postId: itemId, metaKey: "_menu_item_url", metaValue: body.url })
      .onConflictDoUpdate({ target: [wpPostmeta.postId, wpPostmeta.metaKey], set: { metaValue: body.url } })
      .catch(async () => {
        // fallback: update existing
        await db.update(wpPostmeta).set({ metaValue: body.url }).where(eq(wpPostmeta.postId, itemId));
      });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};

// DELETE — remove item from menu
export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const itemId = Number(params.itemId);
  await db.delete(wpTermRelationships).where(eq(wpTermRelationships.objectId, itemId));
  await db.delete(wpPostmeta).where(eq(wpPostmeta.postId, itemId));
  await db.delete(wpPosts).where(eq(wpPosts.id, itemId));

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
