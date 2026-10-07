import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { DEFAULT_THEME_TOKENS } from "@astropress/core/types/theme";
import type { Theme } from "@astropress/core/types/theme";
import { readJsonBody } from "../../../lib/json-body";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

async function getThemes(db: any): Promise<{ themes: Theme[]; activeThemeId: string }> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_themes"))
    .limit(1);

  const [activeRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_active_theme"))
    .limit(1);

  let themes: Theme[] = row?.value ? JSON.parse(row.value) : [];

  // Bootstrap default theme if none exist
  if (themes.length === 0) {
    const [tokenRow] = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_theme_config"))
      .limit(1);

    const defaultTheme: Theme = {
      id: "default",
      name: "Default",
      description: "AstroPress 默认主题",
      tokens: tokenRow?.value ? JSON.parse(tokenRow.value) : DEFAULT_THEME_TOKENS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    themes = [defaultTheme];
    await db.insert(wpOptions).values({
      optionName: "astropress_themes",
      optionValue: JSON.stringify(themes),
      autoload: "yes",
    });
  }

  const activeThemeId = activeRow?.value ?? themes[0]?.id ?? "default";
  return { themes, activeThemeId };
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const data = await getThemes(db);
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const now = new Date().toISOString();

  const newTheme: Theme = {
    id: uid(),
    name: body.name || "新主题",
    description: body.description || "",
    tokens: body.cloneFrom ? body.cloneFrom : { ...DEFAULT_THEME_TOKENS },
    createdAt: now,
    updatedAt: now,
  };

  const { themes } = await getThemes(db);
  themes.push(newTheme);

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

  return new Response(JSON.stringify({ theme: newTheme }), { headers: { "Content-Type": "application/json" } });
};
