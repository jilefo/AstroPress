import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions, wpPosts } from "@astropress/core/schema";
import type { ThemePackage, TemplateSlots } from "@astropress/core/types/theme";

function uid() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }

async function upsertOption(db: any, name: string, value: string, autoload = "yes") {
  const existing = await db.select({ id: wpOptions.optionId }).from(wpOptions).where(eq(wpOptions.optionName, name)).limit(1);
  if (existing.length > 0) {
    await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionName, name));
  } else {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value, autoload });
  }
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  let pkg: ThemePackage & { css?: string };
  let createPages = true;
  try {
    const body = await request.json() as any;
    pkg = body.package ?? body;
    if (typeof body.createPages === "boolean") createPages = body.createPages;
  } catch {
    return new Response(JSON.stringify({ error: "请求数据不是有效的 JSON 格式" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!pkg?.name || !pkg?.tokens) {
    return new Response(JSON.stringify({ error: "无效的主题包：缺少 name 或 tokens" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();
  const themeId = uid();
  const slots: TemplateSlots = {};

  // 1. Create a new Theme entry and add it to the themes list
  const [themesRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_themes")).limit(1);
  const themesList: any[] = themesRow?.value ? JSON.parse(themesRow.value) : [];
  const newTheme = {
    id: themeId,
    name: pkg.name,
    description: (pkg as any).description || "",
    author: (pkg as any).author || "",
    version: (pkg as any).version || "1.0.0",
    tokens: pkg.tokens,
    source: "upload",
    createdAt: now,
    updatedAt: now,
  };
  themesList.push(newTheme);
  await upsertOption(db, "astropress_themes", JSON.stringify(themesList));

  // 2. Store custom CSS keyed by theme ID
  if (pkg.css) {
    await upsertOption(db, `astropress_theme_css_${themeId}`, pkg.css, "no");
  }

  // 3. Create templates from the package
  const [tmplRow] = await db.select({ value: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_theme_templates")).limit(1);
  const templates: any[] = tmplRow?.value ? JSON.parse(tmplRow.value) : [];

  for (const tmplDef of pkg.templates ?? []) {
    const id = uid();
    const schemaSlug = `__${tmplDef.type}_${id}__`;
    templates.push({
      id,
      name: tmplDef.name || tmplDef.type,
      type: tmplDef.type,
      conditions: [{ rule: "entire_site" }],
      schemaSlug,
      createdAt: now,
      updatedAt: now,
    });
    const blocks = (tmplDef.blocks ?? []).map((b: any) => ({ ...b, id: uid() }));
    await upsertOption(db, `astropress_page_schema_${schemaSlug}`, JSON.stringify({ version: 1, blocks }), "no");
    (slots as any)[tmplDef.type] = schemaSlug;
  }

  if (Object.keys(slots).length > 0) {
    await upsertOption(db, "astropress_theme_templates", JSON.stringify(templates));
    await upsertOption(db, "astropress_template_slots", JSON.stringify(slots));
  }

  // 4. Create pages
  const createdPages: string[] = [];
  let frontPageId: number | null = null;
  for (const pageDef of (createPages ? (pkg.pages ?? []) : [])) {
    const rawSlug = String(pageDef.slug || "").trim();
    // "/" maps to the front page — use slug "home" and mark as front page
    const isHomePage = rawSlug === "/" || rawSlug === "";
    const slug = isHomePage ? "home" : rawSlug.replace(/^\//, "");
    if (!slug) continue;

    const existing = await db.select({ id: wpPosts.id }).from(wpPosts).where(eq(wpPosts.postName, slug)).limit(1);
    let postId: number;
    if (existing.length > 0) {
      postId = existing[0].id;
      await db.update(wpPosts).set({ postTitle: pageDef.title, postStatus: "publish", postModified: now, postModifiedGmt: now })
        .where(eq(wpPosts.postName, slug));
    } else {
      const result = await db.insert(wpPosts).values({
        postTitle: pageDef.title, postName: slug, postStatus: "publish", postType: "page",
        postContent: "", postExcerpt: "", postAuthor: locals.user.id,
        postDate: now, postDateGmt: now, postModified: now, postModifiedGmt: now,
        commentStatus: "closed", pingStatus: "closed", postParent: 0, menuOrder: 0,
        postMimeType: "", guid: `/${slug}`, commentCount: 0,
        toPing: "", pinged: "", postContentFiltered: "", postPassword: "",
      }).returning({ id: wpPosts.id });
      postId = result[0]?.id;
    }
    if (postId) {
      const blocks = (pageDef.blocks ?? []).map((b: any) => ({ ...b, id: uid() }));
      await upsertOption(db, `astropress_page_schema_${slug}`, JSON.stringify({ version: 1, blocks }), "no");
      createdPages.push(slug);
      if (isHomePage) frontPageId = postId;
    }
  }

  // Set front page if a home page was created
  if (frontPageId) {
    await upsertOption(db, "show_on_front", "page");
    await upsertOption(db, "page_on_front", String(frontPageId));
  }

  return new Response(JSON.stringify({
    ok: true,
    themeId,
    themeName: pkg.name,
    slotsSet: Object.keys(slots),
    templatesCreated: (pkg.templates ?? []).length,
    pagesCreated: createdPages,
  }), { headers: { "Content-Type": "application/json" } });
};
