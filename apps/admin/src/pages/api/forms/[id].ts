import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

async function getForms(db: any): Promise<any[]> {
  const [row] = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_forms")).limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveForms(db: any, forms: any[]) {
  await db.insert(wpOptions)
    .values({ optionName: "astropress_forms", optionValue: JSON.stringify(forms) })
    .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: JSON.stringify(forms) } });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  // Public GET — no auth required (needed for public form rendering)
  if (!db) return new Response("数据库不可用", { status: 500 });
  const forms = await getForms(db);
  const form = forms.find(f => f.id === params.id);
  if (!form) return new Response("表单不存在", { status: 404 });
  return new Response(JSON.stringify(form), { headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const forms = await getForms(db);
  await saveForms(db, forms.filter(f => f.id !== params.id));
  // Delete entries too
  try {
    await db.delete(wpOptions).where(eq(wpOptions.optionName, `astropress_form_entries_${params.id}`));
  } catch {}
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
