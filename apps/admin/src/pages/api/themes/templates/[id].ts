import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { ThemeTemplate } from "@astropress/core/types/theme";
import { readJsonBody } from "../../../../lib/json-body";

async function loadTemplates(db: any): Promise<ThemeTemplate[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_theme_templates"))
    .limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveTemplates(db: any, templates: ThemeTemplate[]) {
  const existing = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_theme_templates"))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(wpOptions)
      .set({ optionValue: JSON.stringify(templates) })
      .where(eq(wpOptions.optionName, "astropress_theme_templates"));
  } else {
    await db.insert(wpOptions).values({
      optionName: "astropress_theme_templates",
      optionValue: JSON.stringify(templates),
      autoload: "yes",
    });
  }
}

// PUT: update template name / conditions
export const PUT: APIRoute = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const templates = await loadTemplates(db);
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) return new Response("模板不存在", { status: 404 });

  templates[idx] = {
    ...templates[idx],
    name: body.name ?? templates[idx].name,
    conditions: body.conditions ?? templates[idx].conditions,
    updatedAt: new Date().toISOString(),
  };

  await saveTemplates(db, templates);
  return new Response(JSON.stringify({ template: templates[idx] }), {
    headers: { "Content-Type": "application/json" },
  });
};

// POST: set this template as the active slot for its type
export const POST: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const templates = await loadTemplates(db);
  const template = templates.find(t => t.id === id);
  if (!template) return new Response("模板不存在", { status: 404 });

  // Load and update slots
  const [slotsRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_template_slots")).limit(1);
  const slots: Record<string, string> = slotsRow?.value ? JSON.parse(slotsRow.value) : {};
  slots[template.type] = template.schemaSlug;

  const existing = await db.select({ id: wpOptions.optionId }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_template_slots")).limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: JSON.stringify(slots) }).where(eq(wpOptions.optionName, "astropress_template_slots"));
  } else {
    await db.insert(wpOptions).values({ optionName: "astropress_template_slots", optionValue: JSON.stringify(slots), autoload: "yes" });
  }

  return new Response(JSON.stringify({ ok: true, slots }), { headers: { "Content-Type": "application/json" } });
};

// DELETE: remove template entry (and optionally its page schema)
export const DELETE: APIRoute = async ({ locals, params, url }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const templates = await loadTemplates(db);
  const template = templates.find(t => t.id === id);
  if (!template) return new Response("模板不存在", { status: 404 });

  const filtered = templates.filter(t => t.id !== id);
  await saveTemplates(db, filtered);

  // Remove from slot if this was the active template
  const [slotsRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_template_slots")).limit(1);
  if (slotsRow?.value) {
    const slots: Record<string, string> = JSON.parse(slotsRow.value);
    if (slots[template.type] === template.schemaSlug) {
      delete slots[template.type];
      await db.update(wpOptions).set({ optionValue: JSON.stringify(slots) }).where(eq(wpOptions.optionName, "astropress_template_slots"));
    }
  }

  // Optionally delete the page schema
  if (url.searchParams.get("deleteSchema") === "1") {
    const schemaKey = `astropress_page_schema_${template.schemaSlug}`;
    await db.delete(wpOptions).where(eq(wpOptions.optionName, schemaKey));
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
