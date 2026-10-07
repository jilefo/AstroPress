import type { APIRoute } from "astro";
import { eq, desc, asc } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { and, sql } from "drizzle-orm";

export const GET: APIRoute = async ({ url, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const postType = url.searchParams.get("postType") || "post";
  const perPage = Math.min(Number(url.searchParams.get("perPage") || "6"), 12);
  const orderBy = url.searchParams.get("orderBy") || "date";
  const order = (url.searchParams.get("order") || "DESC").toUpperCase();

  const orderCol = orderBy === "title" ? wpPosts.postTitle
    : orderBy === "modified" ? wpPosts.postModified
    : wpPosts.postDate;

  const where = and(
    eq(wpPosts.postType, postType),
    sql`${wpPosts.postStatus} NOT IN ('auto-draft', 'trash')`
  );

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: wpPosts.id,
        title: wpPosts.postTitle,
        slug: wpPosts.postName,
        excerpt: wpPosts.postExcerpt,
        content: wpPosts.postContent,
        type: wpPosts.postType,
        date: wpPosts.postDate,
      })
      .from(wpPosts)
      .where(where)
      .orderBy(order === "ASC" ? asc(orderCol) : desc(orderCol))
      .limit(perPage),
    db
      .select({ total: sql<number>`count(*)` })
      .from(wpPosts)
      .where(where),
  ]);

  return new Response(JSON.stringify({ posts: rows, total: Number(countRow?.total ?? 0) }), {
    headers: { "Content-Type": "application/json" },
  });
};
