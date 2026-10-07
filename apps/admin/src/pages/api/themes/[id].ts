import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { Theme } from "@astropress/core/types/theme";
import { readJsonBody } from "../../../lib/json-body";

async function loadThemes(db: any): Promise<Theme[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_themes"))
    .limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveThemes(db: any, themes: Theme[]) {
  const existing = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_themes"))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: JSON.stringify(themes) }).where(eq(wpOptions.optionName, "astropress_themes"));
  } else {
    await db.insert(wpOptions).values({ optionName: "astropress_themes", optionValue: JSON.stringify(themes), autoload: "yes" });
  }
}

async function upsertOption(db: any, name: string, value: string) {
  const existing = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionName, name));
  } else {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value, autoload: "yes" });
  }
}

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const themes = await loadThemes(db);
  const idx = themes.findIndex(t => t.id === id);
  if (idx === -1) return new Response("主题不存在", { status: 404 });

  themes[idx] = { ...themes[idx], ...(body as object), id: themes[idx].id, updatedAt: new Date().toISOString() };
  await saveThemes(db, themes);

  // If this is the active theme, sync tokens to astropress_theme_config
  const [activeRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_active_theme")).limit(1);
  if (activeRow?.value === id && themes[idx].tokens) {
    await upsertOption(db, "astropress_theme_config", JSON.stringify(themes[idx].tokens));
  }

  return new Response(JSON.stringify({ theme: themes[idx] }), { headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const [activeRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_active_theme")).limit(1);
  if (activeRow?.value === id) {
    return new Response(JSON.stringify({ error: "正在使用的主题不能删除" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const themes = await loadThemes(db);
  const filtered = themes.filter(t => t.id !== id);
  await saveThemes(db, filtered);

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};

// POST = activate theme
export const POST: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const themes = await loadThemes(db);
  const theme = themes.find(t => t.id === id);
  if (!theme) return new Response("主题不存在", { status: 404 });

  // Set active theme id
  await upsertOption(db, "astropress_active_theme", id!);
  // Apply tokens to the global config so all pages pick it up immediately
  await upsertOption(db, "astropress_theme_config", JSON.stringify(theme.tokens));

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
