import { eq, desc, and, sql } from "drizzle-orm";
import type { Database } from "@astropress/core";
import {
  wpPosts,
  wpOptions,
  wpTermRelationships,
  wpTermTaxonomy,
  wpTerms,
} from "@astropress/core/schema";

export interface PublicPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  date: string;
  type: string;
}

export interface NavMenuItem {
  id: number;
  title: string;
  url: string;
  order: number;
  parent: number;
}

export interface SiteOptions {
  blogname: string;
  blogdescription: string;
  siteurl: string;
}

export async function getOption(db: Database, name: string): Promise<string> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  return row?.value ?? "";
}

export async function getSiteOptions(db: Database): Promise<SiteOptions> {
  const rows = await db
    .select({ name: wpOptions.optionName, value: wpOptions.optionValue })
    .from(wpOptions)
    .where(
      sql`${wpOptions.optionName} IN ('blogname','blogdescription','siteurl')`
    );
  const map = Object.fromEntries(rows.map((r: any) => [r.name, r.value]));
  return {
    blogname: map.blogname ?? "AstroPress",
    blogdescription: map.blogdescription ?? "",
    siteurl: map.siteurl ?? "",
  };
}

export async function getPublishedPosts(
  db: Database,
  opts: { page?: number; perPage?: number; type?: string } = {}
): Promise<{ posts: PublicPost[]; total: number }> {
  const { page = 1, perPage = 10, type = "post" } = opts;
  const offset = (page - 1) * perPage;

  const rows = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      slug: wpPosts.postName,
      excerpt: wpPosts.postExcerpt,
      content: wpPosts.postContent,
      date: wpPosts.postDate,
      type: wpPosts.postType,
    })
    .from(wpPosts)
    .where(
      and(eq(wpPosts.postType, type), eq(wpPosts.postStatus, "publish"))
    )
    .orderBy(desc(wpPosts.postDate))
    .limit(perPage)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(wpPosts)
    .where(and(eq(wpPosts.postType, type), eq(wpPosts.postStatus, "publish")));

  return { posts: rows, total };
}

export async function getPostBySlug(
  db: Database,
  slug: string,
  type?: string
): Promise<PublicPost | null> {
  const conditions = [
    eq(wpPosts.postName, slug),
    eq(wpPosts.postStatus, "publish"),
  ];
  if (type) conditions.push(eq(wpPosts.postType, type));

  const [row] = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      slug: wpPosts.postName,
      excerpt: wpPosts.postExcerpt,
      content: wpPosts.postContent,
      date: wpPosts.postDate,
      type: wpPosts.postType,
    })
    .from(wpPosts)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function getNavMenu(
  db: Database,
  menuSlug: string
): Promise<NavMenuItem[]> {
  // Find the nav_menu term by slug
  const [term] = await db
    .select({ termId: wpTerms.termId })
    .from(wpTerms)
    .where(eq(wpTerms.slug, menuSlug))
    .limit(1);

  if (!term) return [];

  // Get taxonomy entry
  const [tt] = await db
    .select({ termTaxonomyId: wpTermTaxonomy.termTaxonomyId })
    .from(wpTermTaxonomy)
    .where(
      and(
        eq(wpTermTaxonomy.termId, term.termId),
        eq(wpTermTaxonomy.taxonomy, "nav_menu")
      )
    )
    .limit(1);

  if (!tt) return [];

  // Get nav_menu_item posts linked to this menu
  const items = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      order: wpPosts.menuOrder,
      parent: wpPosts.postParent,
    })
    .from(wpPosts)
    .innerJoin(
      wpTermRelationships,
      eq(wpTermRelationships.objectId, wpPosts.id)
    )
    .where(
      and(
        eq(wpPosts.postType, "nav_menu_item"),
        eq(wpPosts.postStatus, "publish"),
        eq(wpTermRelationships.termTaxonomyId, tt.termTaxonomyId)
      )
    )
    .orderBy(wpPosts.menuOrder);

  // Fetch URLs from postmeta
  const ids = items.map((i: any) => i.id);
  let urlMap: Record<number, string> = {};

  if (ids.length > 0) {
    const { wpPostmeta } = await import("@astropress/core/schema");
    const metas = await db
      .select({ postId: wpPostmeta.postId, metaValue: wpPostmeta.metaValue })
      .from(wpPostmeta)
      .where(eq(wpPostmeta.metaKey, "_menu_item_url"));
    for (const m of metas) {
      if (ids.includes(m.postId)) urlMap[m.postId] = m.metaValue ?? "#";
    }
  }

  return items.map((i: any) => ({
    id: i.id,
    title: i.title,
    url: urlMap[i.id] ?? "#",
    order: i.order,
    parent: i.parent,
  }));
}
