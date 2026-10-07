import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { apComments, type CommentStatus, COMMENT_STATUSES } from "./schema";

export interface AdminComment {
  id: number;
  postId: number;
  parent: number;
  author: string;
  email: string;
  website: string;
  content: string;
  status: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  postTitle: string;
  postName: string;
  postType: string;
}

export interface StatusCounts {
  pending: number;
  approved: number;
  spam: number;
  trash: number;
}

export function isCommentStatus(v: unknown): v is CommentStatus {
  return typeof v === "string" && (COMMENT_STATUSES as string[]).includes(v);
}

/** 各状态计数（不受筛选条件影响） */
export async function getStatusCounts(db: any): Promise<StatusCounts> {
  const rows: Array<{ status: string; c: number }> = await db
    .select({ status: apComments.status, c: count() })
    .from(apComments)
    .groupBy(apComments.status);

  const result: StatusCounts = { pending: 0, approved: 0, spam: 0, trash: 0 };
  for (const r of rows) {
    if (r.status === "pending" || r.status === "approved" || r.status === "spam" || r.status === "trash") {
      result[r.status] = Number(r.c) || 0;
    }
  }
  return result;
}

export interface ListOptions {
  status: CommentStatus;
  postId?: number;
  q?: string;
  page: number;
  perPage: number;
}

/** 后台评论列表：联表 wp_posts 取 post_title/post_name/post_type */
export async function listComments(
  db: any,
  opts: ListOptions
): Promise<{ items: AdminComment[]; total: number }> {
  const conditions = [eq(apComments.status, opts.status)];
  if (opts.postId && Number.isFinite(opts.postId) && opts.postId > 0) {
    conditions.push(eq(apComments.postId, opts.postId));
  }
  const kw = opts.q?.trim();
  if (kw) {
    const pat = `%${kw.slice(0, 100)}%`;
    conditions.push(
      or(like(apComments.author, pat), like(apComments.email, pat), like(apComments.content, pat)) ??
        sql`1=1`
    );
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  const page = Math.max(1, Math.floor(opts.page) || 1);
  const perPage = Math.max(5, Math.min(100, opts.perPage));

  const rows = await db
    .select({
      id: apComments.id,
      postId: apComments.postId,
      parent: apComments.parent,
      author: apComments.author,
      email: apComments.email,
      website: apComments.website,
      content: apComments.content,
      status: apComments.status,
      ip: apComments.ip,
      userAgent: apComments.userAgent,
      createdAt: apComments.createdAt,
      postTitle: wpPosts.postTitle,
      postName: wpPosts.postName,
      postType: wpPosts.postType,
    })
    .from(apComments)
    .leftJoin(wpPosts, eq(apComments.postId, wpPosts.id))
    .where(where)
    .orderBy(desc(apComments.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const totalRows = await db
    .select({ c: count() })
    .from(apComments)
    .where(where);
  const total = Number(totalRows[0]?.c) || 0;

  return { items: rows as AdminComment[], total };
}

export interface WebComment {
  id: number;
  parent: number;
  author: string;
  email: string;
  website: string;
  content: string;
  createdAt: string;
}

/** 前台：取某文已批准评论（最多 200 条），按设置排序 */
export async function fetchApprovedComments(
  db: any,
  postId: number,
  order: "asc" | "desc"
): Promise<WebComment[]> {
  const rows = await db
    .select({
      id: apComments.id,
      parent: apComments.parent,
      author: apComments.author,
      email: apComments.email,
      website: apComments.website,
      content: apComments.content,
      createdAt: apComments.createdAt,
    })
    .from(apComments)
    .where(and(eq(apComments.postId, postId), eq(apComments.status, "approved")))
    .orderBy(order === "desc" ? desc(apComments.createdAt) : asc(apComments.createdAt))
    .limit(200);
  return rows as WebComment[];
}
