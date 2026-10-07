import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { TemplateSlots, TemplateType } from "@astropress/core/types/theme";

async function loadSlots(db: any): Promise<TemplateSlots> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_template_slots"))
    .limit(1);
  if (row?.value) return JSON.parse(row.value);

  // Migrate from old conditions-based system on first access
  const [tmplRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_theme_templates"))
    .limit(1);
  const slots: TemplateSlots = {};
  if (tmplRow?.value) {
    const templates: any[] = JSON.parse(tmplRow.value);
    for (const tmpl of templates) {
      const key = tmpl.type as TemplateType;
      if (!slots[key] && (tmpl.conditions?.length ?? 0) > 0) {
        slots[key] = tmpl.schemaSlug;
      }
    }
  }
  await saveSlots(db, slots);
  return slots;
}

async function saveSlots(db: any, slots: TemplateSlots) {
  const existing = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_template_slots"))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: JSON.stringify(slots) }).where(eq(wpOptions.optionName, "astropress_template_slots"));
  } else {
    await db.insert(wpOptions).values({ optionName: "astropress_template_slots", optionValue: JSON.stringify(slots), autoload: "yes" });
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const slots = await loadSlots(db);
  return new Response(JSON.stringify(slots), { headers: { "Content-Type": "application/json" } });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const { type, schemaSlug } = await request.json() as any;
  const slots = await loadSlots(db);
  if (schemaSlug === null || schemaSlug === undefined) {
    delete slots[type as TemplateType];
  } else {
    (slots as any)[type] = schemaSlug;
  }
  await saveSlots(db, slots);
  return new Response(JSON.stringify({ ok: true, slots }), { headers: { "Content-Type": "application/json" } });
};
