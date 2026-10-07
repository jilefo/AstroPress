import { eq, and, sql, inArray } from "drizzle-orm";
import { wpPosts, wpTermRelationships, wpPostmeta } from "@astropress/core/schema";

export interface PostItem {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
}

/** 相关文章：按共享标签/分类数量打分 */
export async function fetchRelated(db: any, currentId: number, limit: number): Promise<PostItem[]> {
  const rels = await db
    .select({ termTaxonomyId: wpTermRelationships.termTaxonomyId })
    .from(wpTermRelationships)
    .where(eq(wpTermRelationships.objectId, currentId));
  const ttIds = rels.map((r: any) => r.termTaxonomyId).filter(Boolean);
  if (ttIds.length === 0) return [];

  const rows = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      slug: wpPosts.postName,
      excerpt: wpPosts.postExcerpt,
      date: wpPosts.postDate,
    })
    .from(wpPosts)
    .innerJoin(wpTermRelationships, eq(wpTermRelationships.objectId, wpPosts.id))
    .where(
      and(
        eq(wpPosts.postType, "post"),
        eq(wpPosts.postStatus, "publish"),
        sql`${wpPosts.id} != ${currentId}`,
        inArray(wpTermRelationships.termTaxonomyId, ttIds)
      )
    )
    .groupBy(wpPosts.id)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  return rows as PostItem[];
}

/** 随机文章 */
export async function fetchRandom(db: any, currentId: number, limit: number): Promise<PostItem[]> {
  const rows = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      slug: wpPosts.postName,
      excerpt: wpPosts.postExcerpt,
      date: wpPosts.postDate,
    })
    .from(wpPosts)
    .where(
      and(
        eq(wpPosts.postType, "post"),
        eq(wpPosts.postStatus, "publish"),
        sql`${wpPosts.id} != ${currentId}`
      )
    )
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  return rows as PostItem[];
}

/** 热门文章：按 _ap_view_count postmeta 排序 */
export async function fetchPopular(db: any, currentId: number, limit: number): Promise<PostItem[]> {
  const metaRows = await db
    .select({ postId: wpPostmeta.postId, metaValue: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(eq(wpPostmeta.metaKey, "_ap_view_count"))
    .orderBy(sql`CAST(${wpPostmeta.metaValue} AS INTEGER) DESC`)
    .limit(limit + 5);

  const ids: number[] = [...new Set<number>(
    metaRows
      .map((r: any) => ({ id: Number(r.postId), count: parseInt(r.metaValue || "0", 10) || 0 }))
      .filter((r: any) => r.id !== currentId && r.count > 0)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, limit)
      .map((r: any) => r.id)
  )];

  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      slug: wpPosts.postName,
      excerpt: wpPosts.postExcerpt,
      date: wpPosts.postDate,
    })
    .from(wpPosts)
    .where(
      and(
        eq(wpPosts.postType, "post"),
        eq(wpPosts.postStatus, "publish"),
        inArray(wpPosts.id, ids)
      )
    );

  const byId = new Map(rows.map((r: any) => [r.id, r]));
  return ids.map((id: number) => byId.get(id)).filter(Boolean) as PostItem[];
}
