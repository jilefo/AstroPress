import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { registerFieldGroup, unregisterFieldGroup } from "@astropress/core/registry";
import type { FieldGroup } from "@astropress/core/registry";
import { readJsonBody } from "../../../lib/json-body";

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

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const groups = await getStored(db);
  return new Response(JSON.stringify(groups), { headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<FieldGroup>(request);
  if (!parsed.ok) return parsed.response;
  const group = parsed.data;
  if (!group.id || !group.title) {
    return new Response(JSON.stringify({ error: "缺少 ID 或标题" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const groups = await getStored(db);
  const idx = groups.findIndex((g) => g.id === group.id);
  if (idx >= 0) groups[idx] = group;
  else groups.push(group);

  await save(db, groups);
  registerFieldGroup(group);

  return new Response(JSON.stringify({ ok: true, group }), { headers: { "Content-Type": "application/json" } });
};
