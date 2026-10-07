import type { APIRoute } from "astro";
import { wpTermRelationships, wpTermTaxonomy, wpTerms } from "@astropress/core/schema";
import { eq, and, inArray } from "drizzle-orm";

// GET /api/posts/:id/terms/:taxonomy — get term IDs assigned to this post
export const GET: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const postId = Number(params.id);
  const taxonomy = params.taxonomy!;

  const rows = await db
    .select({ termTaxonomyId: wpTermRelationships.termTaxonomyId })
    .from(wpTermRelationships)
    .innerJoin(wpTermTaxonomy, eq(wpTermTaxonomy.termTaxonomyId, wpTermRelationships.termTaxonomyId))
    .where(
      and(
        eq(wpTermRelationships.objectId, postId),
        eq(wpTermTaxonomy.taxonomy, taxonomy)
      )
    );

  return new Response(JSON.stringify(rows.map((r: any) => r.termTaxonomyId)), {
    headers: { "Content-Type": "application/json" },
  });
};

// PUT /api/posts/:id/terms/:taxonomy — replace all terms for this post+taxonomy
export const PUT: APIRoute = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const postId = Number(params.id);
  const taxonomy = params.taxonomy!;

  const { termTaxonomyIds } = await request.json() as { termTaxonomyIds: number[] };

  // Get all termTaxonomyIds for this taxonomy so we can delete only this taxonomy's relationships
  const allTTIds = await db
    .select({ id: wpTermTaxonomy.termTaxonomyId })
    .from(wpTermTaxonomy)
    .where(eq(wpTermTaxonomy.taxonomy, taxonomy));

  const ttIdSet = allTTIds.map((r: any) => r.id);

  if (ttIdSet.length > 0) {
    await db
      .delete(wpTermRelationships)
      .where(
        and(
          eq(wpTermRelationships.objectId, postId),
          inArray(wpTermRelationships.termTaxonomyId, ttIdSet)
        )
      );
  }

  if (termTaxonomyIds.length > 0) {
    await db.insert(wpTermRelationships).values(
      termTaxonomyIds.map((ttId, i) => ({
        objectId: postId,
        termTaxonomyId: ttId,
        termOrder: i,
      }))
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
