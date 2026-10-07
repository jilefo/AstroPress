import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { UserTemplate } from "../../../lib/templateLibrary";
import { readJsonBody } from "../../../lib/json-body";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

async function loadLibrary(db: any): Promise<UserTemplate[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_template_library"))
    .limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveLibrary(db: any, templates: UserTemplate[]) {
  const existing = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_template_library"))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(wpOptions)
      .set({ optionValue: JSON.stringify(templates) })
      .where(eq(wpOptions.optionName, "astropress_template_library"));
  } else {
    await db.insert(wpOptions).values({
      optionName: "astropress_template_library",
      optionValue: JSON.stringify(templates),
      autoload: "no",
    });
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const templates = await loadLibrary(db);
  return new Response(JSON.stringify({ templates }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body.name || !Array.isArray(body.blocks)) {
    return new Response(JSON.stringify({ error: "名称和区块内容均为必填项" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const templates = await loadLibrary(db);
  const template: UserTemplate = {
    id: uid(),
    name: body.name,
    blocks: body.blocks,
    createdAt: new Date().toISOString(),
  };
  templates.push(template);
  await saveLibrary(db, templates);

  return new Response(JSON.stringify({ template }), {
    headers: { "Content-Type": "application/json" },
  });
};
