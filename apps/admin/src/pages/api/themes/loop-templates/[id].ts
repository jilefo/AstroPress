import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { LoopTemplate } from "@astropress/core/types/theme";
import { readJsonBody } from "../../../../lib/json-body";

async function loadUserTemplates(db: any): Promise<LoopTemplate[]> {
  const [row] = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_loop_templates")).limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveUserTemplates(db: any, templates: LoopTemplate[]) {
  const existing = await db.select({ id: wpOptions.optionId }).from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_loop_templates")).limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: JSON.stringify(templates) })
      .where(eq(wpOptions.optionName, "astropress_loop_templates"));
  } else {
    await db.insert(wpOptions).values({ optionName: "astropress_loop_templates", optionValue: JSON.stringify(templates), autoload: "yes" });
  }
}

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const { id } = params;
  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const templates = await loadUserTemplates(db);
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) return new Response("列表模板不存在", { status: 404 });
  templates[idx] = { ...templates[idx], name: body.name ?? templates[idx].name, updatedAt: new Date().toISOString() };
  await saveUserTemplates(db, templates);
  return new Response(JSON.stringify({ template: templates[idx] }), { headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const { id } = params;
  const templates = await loadUserTemplates(db);
  const template = templates.find(t => t.id === id);
  if (!template) return new Response("列表模板不存在", { status: 404 });
  const filtered = templates.filter(t => t.id !== id);
  await saveUserTemplates(db, filtered);
  const schemaKey = `astropress_page_schema___loop-item_${id}__`;
  await db.delete(wpOptions).where(eq(wpOptions.optionName, schemaKey));
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
