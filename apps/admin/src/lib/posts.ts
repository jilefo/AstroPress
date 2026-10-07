import { eq, desc, and, count, sql } from "drizzle-orm";
import type { Database } from "@astropress/core";
import { wpPosts, wpPostmeta, wpTermRelationships, wpTermTaxonomy, wpTerms } from "@astropress/core/schema";
import { slugify } from "./slugify";

export interface PostRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  type: string;
  date: string;
  modified: string;
  authorId: number;
}

export interface PostFull extends PostRow {
  content: string;
  excerpt: string;
}

export async function listPosts(
  db: Database,
  opts: { type?: string; status?: string; page?: number; perPage?: number } = {}
): Promise<{ posts: PostRow[]; total: number }> {
  const { type = "post", status, page = 1, perPage = 20 } = opts;
  const offset = (page - 1) * perPage;

  const conditions = [eq(wpPosts.postType, type)];
  if (status) conditions.push(eq(wpPosts.postStatus, status));
  // exclude auto-draft and trash unless explicitly requested
  if (!status) {
    conditions.push(sql`${wpPosts.postStatus} != 'auto-draft'`);
    conditions.push(sql`${wpPosts.postStatus} != 'trash'`);
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(wpPosts)
    .where(where);

  const rows = await db
    .select({
      id: wpPosts.id,
      title: wpPosts.postTitle,
      slug: wpPosts.postName,
      status: wpPosts.postStatus,
      type: wpPosts.postType,
      date: wpPosts.postDate,
      modified: wpPosts.postModified,
      authorId: wpPosts.postAuthor,
    })
    .from(wpPosts)
    .where(where)
    .orderBy(desc(wpPosts.postDate))
    .limit(perPage)
    .offset(offset);

  return { posts: rows, total };
}

export async function getPost(db: Database, id: number): Promise<PostFull | null> {
  const [row] = await db
    .select()
    .from(wpPosts)
    .where(eq(wpPosts.id, id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    title: row.postTitle,
    slug: row.postName,
    status: row.postStatus,
    type: row.postType,
    date: row.postDate,
    modified: row.postModified,
    authorId: row.postAuthor,
    content: row.postContent,
    excerpt: row.postExcerpt,
  };
}

export async function createPost(
  db: Database,
  data: {
    title: string;
    content?: string;
    excerpt?: string;
    status?: string;
    type?: string;
    authorId: number;
    slug?: string;
  }
): Promise<number> {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  // Leave slug empty if title is blank — it will be set when the user saves with a title
  const slug = data.slug || slugify(data.title) || "";

  const result = await db.insert(wpPosts).values({
    postTitle: data.title,
    postContent: data.content ?? "",
    postExcerpt: data.excerpt ?? "",
    postStatus: data.status ?? "draft",
    postType: data.type ?? "post",
    postName: slug,
    postAuthor: data.authorId,
    postDate: now,
    postDateGmt: now,
    postModified: now,
    postModifiedGmt: now,
    guid: "",
  }).returning({ id: wpPosts.id });

  return result[0].id;
}

export async function updatePost(
  db: Database,
  id: number,
  data: {
    title?: string;
    content?: string;
    excerpt?: string;
    status?: string;
    slug?: string;
  }
): Promise<void> {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  await db
    .update(wpPosts)
    .set({
      ...(data.title !== undefined && { postTitle: data.title }),
      ...(data.content !== undefined && { postContent: data.content }),
      ...(data.excerpt !== undefined && { postExcerpt: data.excerpt }),
      ...(data.status !== undefined && { postStatus: data.status }),
      ...(data.slug !== undefined && { postName: data.slug }),
      postModified: now,
      postModifiedGmt: now,
    })
    .where(eq(wpPosts.id, id));
}

export async function deletePost(db: Database, id: number): Promise<void> {
  await db.update(wpPosts).set({ postStatus: "trash" }).where(eq(wpPosts.id, id));
}
