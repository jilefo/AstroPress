import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { wpTerms, wpTermTaxonomy, wpTermRelationships, wpPosts, wpPostmeta } from "@astropress/core/schema";
import { slugify } from "../../../lib/slugify";
import { readJsonBody, jsonError } from "../../../lib/json-body";

// PATCH — rename menu
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const menuId = Number(params.id);
  const parsed = await readJsonBody<{ name: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { name } = parsed.data;
  if (!name?.trim()) return jsonError(400, "名称不能为空");

  const slug = slugify(name) || `menu-${Date.now().toString(36)}`;
  await db.update(wpTerms).set({ name, slug }).where(eq(wpTerms.termId, menuId));

  return new Response(JSON.stringify({ ok: true, slug }), { headers: { "Content-Type": "application/json" } });
};

// DELETE — delete menu and all its items
export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const menuId = Number(params.id);

  // Find term_taxonomy_id
  const [tt] = await db
    .select({ id: wpTermTaxonomy.termTaxonomyId })
    .from(wpTermTaxonomy)
    .where(and(eq(wpTermTaxonomy.termId, menuId), eq(wpTermTaxonomy.taxonomy, "nav_menu")))
    .limit(1);

  if (tt) {
    // Get all item IDs
    const rels = await db
      .select({ objectId: wpTermRelationships.objectId })
      .from(wpTermRelationships)
      .where(eq(wpTermRelationships.termTaxonomyId, tt.id));
    const ids = rels.map((r: any) => r.objectId);

    // Delete relationships
    await db.delete(wpTermRelationships).where(eq(wpTermRelationships.termTaxonomyId, tt.id));

    // Delete postmeta and posts for each item
    for (const id of ids) {
      await db.delete(wpPostmeta).where(eq(wpPostmeta.postId, id));
      await db.delete(wpPosts).where(eq(wpPosts.id, id));
    }

    await db.delete(wpTermTaxonomy).where(eq(wpTermTaxonomy.termTaxonomyId, tt.id));
  }

  await db.delete(wpTerms).where(eq(wpTerms.termId, menuId));

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
