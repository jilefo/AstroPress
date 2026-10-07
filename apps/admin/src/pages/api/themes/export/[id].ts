import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { Theme, ThemeTemplate } from "@astropress/core/types/theme";

export const GET: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;

  // Load theme
  const [themesRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_themes"))
    .limit(1);

  const themes: Theme[] = themesRow?.value ? JSON.parse(themesRow.value) : [];
  const theme = themes.find(t => t.id === id);
  if (!theme) {
    return new Response(JSON.stringify({ error: "主题不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Load all theme templates
  const [templatesRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_theme_templates"))
    .limit(1);
  const themeTemplates: ThemeTemplate[] = templatesRow?.value
    ? JSON.parse(templatesRow.value)
    : [];

  // Load all page schemas that belong to templates (including legacy header/footer)
  const allSchemaRows: Array<{ name: string; value: string }> = await db
    .select({ name: wpOptions.optionName, value: wpOptions.optionValue })
    .from(wpOptions);

  const schemaEntries: Record<string, unknown> = {};
  for (const row of allSchemaRows) {
    if (row.name?.startsWith("astropress_page_schema_")) {
      const slug = row.name.replace("astropress_page_schema_", "");
      // Only export template schemas (slugs starting with __)
      if (slug.startsWith("__")) {
        try {
          schemaEntries[slug] = row.value ? JSON.parse(row.value) : null;
        } catch {
          schemaEntries[slug] = null;
        }
      }
    }
  }

  const exportData = {
    format: "astropress-theme",
    version: "1.0",
    name: theme.name,
    description: theme.description,
    author: (theme as any).author ?? "",
    tokens: theme.tokens,
    templates: themeTemplates,
    schemas: schemaEntries,
    exportedAt: new Date().toISOString(),
  };

  const filename = theme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
