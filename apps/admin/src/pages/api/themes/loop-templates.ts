import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { LoopTemplate } from "@astropress/core/types/theme";
import { DEFAULT_LOOP_TEMPLATES } from "../../../lib/loopTemplates";
import { readJsonBody } from "../../../lib/json-body";

function uid() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }

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

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const userTemplates = await loadUserTemplates(db);
  const all = [
    ...DEFAULT_LOOP_TEMPLATES.map(t => ({ id: t.id, name: t.name, isDefault: true, createdAt: t.createdAt, updatedAt: t.updatedAt })),
    ...userTemplates,
  ];

  return new Response(JSON.stringify(all), { headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const name = String(body.name || "未命名模板");
  const now = new Date().toISOString();
  const id = uid();
  const schemaSlug = `__loop-item_${id}__`;

  const template: LoopTemplate = { id, name, createdAt: now, updatedAt: now };

  const startBlocks = body.blocks ?? [];
  const schemaKey = `astropress_page_schema_${schemaSlug}`;
  await db.insert(wpOptions).values({
    optionName: schemaKey,
    optionValue: JSON.stringify({ version: 1, blocks: startBlocks }),
    autoload: "no",
  });

  const userTemplates = await loadUserTemplates(db);
  userTemplates.push(template);
  await saveUserTemplates(db, userTemplates);

  return new Response(JSON.stringify({ template, schemaSlug }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
