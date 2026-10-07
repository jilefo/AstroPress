import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface TranslationGroup {
  baseId: number;
  baseSlug: string;
  groupId: string;
  /** lang code -> member post id */
  members: Record<string, number>;
}

/**
 * Find the translation group for a public path ("/about" or "/blog/hello").
 * Content model: each language is a standalone post; members share a
 * `_ml_group` UUID and carry `_ml_lang`.
 */
export async function findTranslationsByPath(db: any, path: string): Promise<TranslationGroup | null> {
  if (!db) return null;
  const clean = path.replace(/\/+$/, "");
  const slug = clean.split("/").pop() ?? "";
  if (!slug) return null;

  const rows = await db
    .select({ id: wpPosts.id, name: wpPosts.postName, type: wpPosts.postType })
    .from(wpPosts)
    .where(and(eq(wpPosts.postName, slug), eq(wpPosts.postStatus, "publish")));
  if (rows.length === 0) return null;

  for (const row of rows) {
    const group = await findGroupByPostId(db, row.id);
    if (group) return group;
  }
  return null;
}

export async function findGroupByPostId(db: any, postId: number): Promise<TranslationGroup | null> {
  const meta = await db
    .select({ key: wpPostmeta.metaKey, val: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), inArray(wpPostmeta.metaKey, ["_ml_group", "_ml_lang"])));
  const groupId = meta.find((m: any) => m.key === "_ml_group")?.val;
  const selfLang = meta.find((m: any) => m.key === "_ml_lang")?.val;

  if (!groupId && !selfLang) return null;

  if (!groupId) {
    const [post] = await db
      .select({ name: wpPosts.postName })
      .from(wpPosts)
      .where(eq(wpPosts.id, postId))
      .limit(1);
    const members: Record<string, number> = {};
    if (selfLang) members[selfLang] = postId;
    return { baseId: postId, baseSlug: post?.name ?? "", groupId: "", members };
  }

  const links = await db
    .select({ postId: wpPostmeta.postId })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.metaKey, "_ml_group"), eq(wpPostmeta.metaValue, groupId)));
  const ids = links.map((l: any) => l.postId);
  const members: Record<string, number> = {};
  if (ids.length > 0) {
    const langRows = await db
      .select({ postId: wpPostmeta.postId, val: wpPostmeta.metaValue })
      .from(wpPostmeta)
      .where(and(inArray(wpPostmeta.postId, ids), eq(wpPostmeta.metaKey, "_ml_lang")));
    for (const l of langRows) if (l.val) members[l.val] = l.postId;
  }
  const baseId = Object.values(members).find((id) => id === postId) ?? ids[0] ?? postId;
  const [base] = await db.select({ name: wpPosts.postName }).from(wpPosts).where(eq(wpPosts.id, baseId)).limit(1);
  return { baseId, baseSlug: base?.name ?? "", groupId, members };
}

/** SEO meta (written by the bundled SEO plugin) for Open Graph tags. */
export async function getSeoMeta(db: any, postId: number): Promise<{ title: string; description: string }> {
  const rows = await db
    .select({ key: wpPostmeta.metaKey, val: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), inArray(wpPostmeta.metaKey, ["_yoast_wpseo_title", "_yoast_wpseo_metadesc"])));
  return {
    title: rows.find((r: any) => r.key === "_yoast_wpseo_title")?.val ?? "",
    description: rows.find((r: any) => r.key === "_yoast_wpseo_metadesc")?.val ?? "",
  };
}