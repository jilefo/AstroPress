import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpTerms, wpTermTaxonomy } from "@astropress/core/schema";
import { slugify } from "../../../lib/slugify";
import { readJsonBody, jsonError } from "../../../lib/json-body";

// GET — 菜单列表
export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const rows = await db
    .select({
      id: wpTerms.termId,
      name: wpTerms.name,
      slug: wpTerms.slug,
    })
    .from(wpTerms)
    .innerJoin(
      wpTermTaxonomy,
      eq(wpTermTaxonomy.termId, wpTerms.termId)
    )
    .where(eq(wpTermTaxonomy.taxonomy, "nav_menu"));

  return new Response(JSON.stringify({ items: rows }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<{ name: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { name } = parsed.data;
  if (!name?.trim()) return jsonError(400, "名称不能为空");

  const slug = slugify(name) || `menu-${Date.now().toString(36)}`;

  const [{ termId }] = await db
    .insert(wpTerms)
    .values({ name, slug, termGroup: 0 })
    .returning({ termId: wpTerms.termId });

  await db.insert(wpTermTaxonomy).values({
    termId,
    taxonomy: "nav_menu",
    description: "",
    parent: 0,
    count: 0,
  });

  return new Response(JSON.stringify({ id: termId, slug }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
