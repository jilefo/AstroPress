import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { unregisterTaxonomy } from "@astropress/core/registry";

async function getStored(db: any): Promise<any[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_custom_taxonomies"))
    .limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const key = params.key!;
  const taxs = await getStored(db);
  const filtered = taxs.filter((t: any) => t.key !== key);

  await db
    .insert(wpOptions)
    .values({ optionName: "astropress_custom_taxonomies", optionValue: JSON.stringify(filtered) })
    .onConflictDoUpdate({
      target: wpOptions.optionName,
      set: { optionValue: JSON.stringify(filtered) },
    });

  unregisterTaxonomy(key);

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
