import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { unregisterFieldGroup } from "@astropress/core/registry";
import type { FieldGroup } from "@astropress/core/registry";

async function getStored(db: any): Promise<FieldGroup[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_field_groups"))
    .limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function save(db: any, groups: FieldGroup[]) {
  await db
    .insert(wpOptions)
    .values({ optionName: "astropress_field_groups", optionValue: JSON.stringify(groups) })
    .onConflictDoUpdate({
      target: wpOptions.optionName,
      set: { optionValue: JSON.stringify(groups) },
    });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const groups = await getStored(db);
  const group = groups.find((g) => g.id === params.id);
  if (!group) return new Response("字段组不存在", { status: 404 });
  return new Response(JSON.stringify(group), { headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const groups = await getStored(db);
  const filtered = groups.filter((g) => g.id !== params.id);
  await save(db, filtered);
  unregisterFieldGroup(params.id!);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
