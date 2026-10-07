import type { APIRoute } from "astro";
import { wpTerms, wpTermTaxonomy } from "@astropress/core/schema";
import { eq, and, asc } from "drizzle-orm";
import { slugify } from "../../../../lib/slugify";
import { readJsonBody } from "../../../../lib/json-body";

// GET /api/terms/:taxonomy  — list all terms for a taxonomy
export const GET: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const taxonomy = params.taxonomy!;

  const terms = await db
    .select({
      id: wpTerms.termId,
      termTaxonomyId: wpTermTaxonomy.termTaxonomyId,
      name: wpTerms.name,
      slug: wpTerms.slug,
      parent: wpTermTaxonomy.parent,
      count: wpTermTaxonomy.count,
    })
    .from(wpTerms)
    .innerJoin(wpTermTaxonomy, eq(wpTermTaxonomy.termId, wpTerms.termId))
    .where(eq(wpTermTaxonomy.taxonomy, taxonomy))
    .orderBy(asc(wpTerms.name));

  return new Response(JSON.stringify(terms), {
    headers: { "Content-Type": "application/json" },
  });
};

// POST /api/terms/:taxonomy  — create a new term
export const POST: APIRoute = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const taxonomy = params.taxonomy!;
  const parsed = await readJsonBody<{ name: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { name } = parsed.data;
  if (!name?.trim()) {
    return new Response(JSON.stringify({ error: "名称不能为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const trimmedName = name.trim();
  let slug = slugify(trimmedName);
  if (!slug) slug = `term-${Date.now().toString(36)}`;

  // Find or create the wp_terms row
  const existingTerm = await db
    .select({ id: wpTerms.termId })
    .from(wpTerms)
    .where(eq(wpTerms.slug, slug))
    .limit(1);

  let termId: number;
  if (existingTerm.length > 0) {
    termId = existingTerm[0].id;
  } else {
    const inserted = await db
      .insert(wpTerms)
      .values({ name: trimmedName, slug })
      .returning({ id: wpTerms.termId });
    termId = inserted[0].id;
  }

  // Find or create the wp_term_taxonomy row
  const existingTT = await db
    .select({ id: wpTermTaxonomy.termTaxonomyId })
    .from(wpTermTaxonomy)
    .where(and(eq(wpTermTaxonomy.termId, termId), eq(wpTermTaxonomy.taxonomy, taxonomy)))
    .limit(1);

  let termTaxonomyId: number;
  if (existingTT.length > 0) {
    termTaxonomyId = existingTT[0].id;
  } else {
    const inserted = await db
      .insert(wpTermTaxonomy)
      .values({ termId, taxonomy, description: "", parent: 0, count: 0 })
      .returning({ id: wpTermTaxonomy.termTaxonomyId });
    termTaxonomyId = inserted[0].id;
  }

  return new Response(
    JSON.stringify({ id: termId, termTaxonomyId, name: trimmedName, slug, parent: 0, count: 0 }),
    { headers: { "Content-Type": "application/json" } }
  );
};
