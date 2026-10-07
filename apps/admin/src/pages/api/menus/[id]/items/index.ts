import type { APIRoute } from "astro";
import { eq, and, count } from "drizzle-orm";
import { wpPosts, wpPostmeta, wpTermRelationships, wpTermTaxonomy } from "@astropress/core/schema";

export const POST: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  const user = locals.user;
  if (!db || !user) return new Response("未登录或登录已过期", { status: 401 });

  const menuId = Number(params.id);
  const { url, title } = await request.json() as { url: string; title: string };

  // Find nav_menu term_taxonomy_id
  const [tt] = await db
    .select({ id: wpTermTaxonomy.termTaxonomyId })
    .from(wpTermTaxonomy)
    .where(and(eq(wpTermTaxonomy.termId, menuId), eq(wpTermTaxonomy.taxonomy, "nav_menu")))
    .limit(1);

  if (!tt) return new Response("菜单不存在", { status: 404 });

  // Get current item count for menu_order
  const [{ total }] = await db
    .select({ total: count() })
    .from(wpTermRelationships)
    .where(eq(wpTermRelationships.termTaxonomyId, tt.id));

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const [{ id }] = await db.insert(wpPosts).values({
    postTitle: title,
    postContent: "",
    postExcerpt: "",
    postStatus: "publish",
    postType: "nav_menu_item",
    postName: `menu-item-${Date.now()}`,
    postAuthor: user.id,
    postDate: now,
    postDateGmt: now,
    postModified: now,
    postModifiedGmt: now,
    menuOrder: total + 1,
    guid: "",
  }).returning({ id: wpPosts.id });

  await db.insert(wpPostmeta).values({ postId: id, metaKey: "_menu_item_url", metaValue: url });
  await db.insert(wpTermRelationships).values({ objectId: id, termTaxonomyId: tt.id, termOrder: total + 1 });

  // Update taxonomy count
  await db
    .update(wpTermTaxonomy)
    .set({ count: total + 1 })
    .where(eq(wpTermTaxonomy.termTaxonomyId, tt.id));

  return new Response(JSON.stringify({ id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

// PATCH — bulk reorder: [{ id, menuOrder, postParent }]
export const PATCH: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const items = await request.json() as Array<{ id: number; menuOrder: number; postParent: number }>;
  for (const item of items) {
    await db.update(wpPosts)
      .set({ menuOrder: item.menuOrder, postParent: item.postParent })
      .where(eq(wpPosts.id, item.id));
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
