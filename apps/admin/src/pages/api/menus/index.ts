import type { APIRoute } from "astro";
import { wpTerms, wpTermTaxonomy } from "@astropress/core/schema";
import { slugify } from "../../../lib/slugify";

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { name } = await request.json() as { name: string };
  if (!name?.trim()) return new Response("名称不能为空", { status: 400 });

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
