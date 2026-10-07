import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { registerTaxonomy } from "@astropress/core/registry";

async function getStored(db: any): Promise<any[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_custom_taxonomies"))
    .limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const body = await request.json() as any;
  const { key, ...config } = body;

  if (!key || !/^[a-z0-9_]+$/.test(key)) {
    return new Response(JSON.stringify({ error: "标识键无效（仅限小写字母、数字和下划线）" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const taxs = await getStored(db);
  const idx = taxs.findIndex((t: any) => t.key === key);
  const entry = { key, ...config, custom: true };

  if (idx >= 0) taxs[idx] = entry;
  else taxs.push(entry);

  await db
    .insert(wpOptions)
    .values({ optionName: "astropress_custom_taxonomies", optionValue: JSON.stringify(taxs) })
    .onConflictDoUpdate({
      target: wpOptions.optionName,
      set: { optionValue: JSON.stringify(taxs) },
    });

  registerTaxonomy(key, { ...config, custom: true });

  return new Response(JSON.stringify({ ok: true, entry }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const taxs = await getStored(db);
  return new Response(JSON.stringify(taxs), { headers: { "Content-Type": "application/json" } });
};
