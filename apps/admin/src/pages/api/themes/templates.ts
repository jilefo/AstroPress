import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { ThemeTemplate, TemplateType, DisplayCondition } from "@astropress/core/types/theme";

const VALID_TYPES: TemplateType[] = [
  "header", "footer", "single-post", "single-page", "archive", "404", "search",
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

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

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const templates = await loadTemplates(db);

  const schemaRows = await db
    .select({ name: wpOptions.optionName })
    .from(wpOptions);

  const existingSchemaSlugs = new Set(
    schemaRows
      .filter((r: any) => r.name?.startsWith("astropress_page_schema_"))
      .map((r: any) => r.name.replace("astropress_page_schema_", ""))
  );

  return new Response(
    JSON.stringify({ templates, existingSchemaSlugs: [...existingSchemaSlugs] }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const body = await request.json() as any;
  const type = body.type as TemplateType;

  if (!type || !VALID_TYPES.includes(type)) {
    return new Response(JSON.stringify({ error: "无效的模板类型" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = uid();
  // Unique slug per template instance: __<type>_<id>__
  // Legacy single-instance slugs (__header__, __footer__, etc.) are still supported for existing data.
  const schemaSlug = `__${type}_${id}__`;
  const now = new Date().toISOString();
  const conditions: DisplayCondition[] = body.conditions ?? [];

  const templates = await loadTemplates(db);

  // Count existing templates of this type for auto-naming
  const sameType = templates.filter(t => t.type === type).length;
  const defaultName = body.name || `${type.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} ${sameType + 1}`;

  const template: ThemeTemplate = {
    id,
    name: defaultName,
    type,
    conditions,
    schemaSlug,
    createdAt: now,
    updatedAt: now,
  };

  templates.push(template);
  await saveTemplates(db, templates);

  // Seed schema with provided blocks (from library) or empty
  const seedBlocks = Array.isArray(body.blocks) ? body.blocks.map((b: any) => ({ ...b, id: uid() })) : [];
  await db.insert(wpOptions).values({
    optionName: `astropress_page_schema_${schemaSlug}`,
    optionValue: JSON.stringify({ version: 1, blocks: seedBlocks }),
    autoload: "no",
  });

  // Optionally set as active slot
  if (body.setActive) {
    const [slotsRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_template_slots")).limit(1);
    const slots: Record<string, string> = slotsRow?.value ? JSON.parse(slotsRow.value) : {};
    slots[type] = schemaSlug;
    const existing2 = await db.select({ id: wpOptions.optionId }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_template_slots")).limit(1);
    if (existing2.length > 0) {
      await db.update(wpOptions).set({ optionValue: JSON.stringify(slots) }).where(eq(wpOptions.optionName, "astropress_template_slots"));
    } else {
      await db.insert(wpOptions).values({ optionName: "astropress_template_slots", optionValue: JSON.stringify(slots), autoload: "yes" });
    }
  }

  return new Response(JSON.stringify({ template }), {
    headers: { "Content-Type": "application/json" },
  });
};
