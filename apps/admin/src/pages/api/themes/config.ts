import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { DEFAULT_THEME_TOKENS } from "@astropress/core/types/theme";
import type { Theme } from "@astropress/core/types/theme";

async function upsertOption(db: any, name: string, value: string) {
  const existing = await db.select({ id: wpOptions.optionId }).from(wpOptions).where(eq(wpOptions.optionName, name)).limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionName, name));
  } else {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value, autoload: "yes" });
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_theme_config"))
    .limit(1);

  const tokens = row?.value ? JSON.parse(row.value) : DEFAULT_THEME_TOKENS;
  return new Response(JSON.stringify(tokens), { headers: { "Content-Type": "application/json" } });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const tokens = await request.json() as any;

  // Save global config
  await upsertOption(db, "astropress_theme_config", JSON.stringify(tokens));

  // Sync tokens back to the active theme entry in astropress_themes
  const [activeRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_active_theme")).limit(1);
  const [themesRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_themes")).limit(1);

  if (activeRow?.value && themesRow?.value) {
    const themes: Theme[] = JSON.parse(themesRow.value);
    const idx = themes.findIndex(t => t.id === activeRow.value);
    if (idx !== -1) {
      themes[idx] = { ...themes[idx], tokens, updatedAt: new Date().toISOString() };
      await upsertOption(db, "astropress_themes", JSON.stringify(themes));
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
