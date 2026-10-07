import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import type { UserTemplate } from "../../../../lib/templateLibrary";

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

export const DELETE: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const { id } = params;
  const templates = await loadLibrary(db);
  const filtered = templates.filter(t => t.id !== id);
  await saveLibrary(db, filtered);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
