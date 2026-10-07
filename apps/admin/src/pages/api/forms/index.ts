import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

export type { };

async function getStored(db: any): Promise<any[]> {
  const [row] = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_forms")).limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function save(db: any, forms: any[]) {
  await db.insert(wpOptions)
    .values({ optionName: "astropress_forms", optionValue: JSON.stringify(forms) })
    .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: JSON.stringify(forms) } });
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const forms = await getStored(db);
  return new Response(JSON.stringify(forms), { headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const form = await request.json() as any;
  if (!form.id) return new Response(JSON.stringify({ error: "缺少表单 ID" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const forms = await getStored(db);
  const idx = forms.findIndex(f => f.id === form.id);
  const updated = { ...form, updatedAt: new Date().toISOString() };
  if (idx >= 0) forms[idx] = updated; else forms.push(updated);
  await save(db, forms);
  return new Response(JSON.stringify({ ok: true, form: updated }), { headers: { "Content-Type": "application/json" } });
};
