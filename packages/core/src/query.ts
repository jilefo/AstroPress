/**
 * @astropress/core/query
 *
 * WordPress-style data helpers for Astro frontmatter and server-side code.
 * All functions are async and accept a `db` instance from `Astro.locals.db`.
 *
 * Quick reference
 * ───────────────
 * Posts
 *   queryPosts(db, args?)        → { posts, total, pages }   like WP_Query
 *   getPost(db, idOrSlug, type?) → Post | null               like get_post / get_page_by_path
 *   getPostById(db, id)          → Post | null
 *   getPostBySlug(db, slug,type?)→ Post | null
 *   getChildren(db, parentId)    → Post[]                    like get_children
 *   getAncestors(db, postId)     → Post[]                    parent chain, root-first
 *
 * Post meta / Custom fields
 *   getField(db, postId, key)    → string | null             like ACF get_field
 *   getFields(db, postId)        → Record<string,string>     all meta as object
 *   getPostMeta(db, postId, key) → string | null             like get_post_meta
 *   updatePostMeta(db, postId, key, value) → void            like update_post_meta
 *   deletePostMeta(db, postId, key)        → void            like delete_post_meta
 *
 * Terms / Taxonomy
 *   getTerms(db, taxonomy, args?)          → Term[]          like get_terms
 *   getPostTerms(db, postId, taxonomy)     → Term[]          like get_the_terms
 *   getPostsByTerm(db, termSlug, taxonomy, args?) → Post[]   like WP_Query tax_query
 *
 * Options
 *   getOption(db, name, fallback?)  → string                 like get_option
 *   updateOption(db, name, value)   → void                   like update_option
 *   getSiteInfo(db)                 → SiteInfo               like get_bloginfo
 *
 * Users
 *   getAuthor(db, userId)           → Author | null          like get_userdata
 */

import { eq, and, desc, asc, like, inArray, sql } from "drizzle-orm";
import type { AnyDatabase } from "./db/index";
import { likeNeedle } from "./db/index";
import {
  wpPosts,
  wpPostmeta,
  wpTerms,
  wpTermTaxonomy,
  wpTermRelationships,
  wpOptions,
  wpUsers,
} from "./schema/index";

// ─── Return types ─────────────────────────────────────────────────────────────

export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: string;
  type: string;
  date: string;
  modified: string;
  parent: number;
  menuOrder: number;
  author: number;
}

export interface Term {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
  description: string;
  parent: number;
  count: number;
}

export interface Author {
  id: number;
  login: string;
  email: string;
  displayName: string;
  url: string;
  registered: string;
}

export interface SiteInfo {
  name: string;
  description: string;
  url: string;
  adminEmail: string;
}

export interface QueryResult {
  posts: Post[];
  total: number;
  pages: number;
}

// ─── Query args ───────────────────────────────────────────────────────────────

export interface QueryArgs {
  /** Post type(s). Default: "post" */
  type?: string | string[];
  /** Post status(es). Default: "publish" */
  status?: string | string[];
  /** Number of posts per page. Use -1 for all. Default: 10 */
  perPage?: number;
  /** Page number (1-based). Default: 1 */
  page?: number;
  /** Order field: "date" | "title" | "menuOrder" | "id" | "modified". Default: "date" */
  orderBy?: "date" | "title" | "menuOrder" | "id" | "modified";
  /** Sort direction. Default: "desc" */
  order?: "asc" | "desc";
  /** Full-text search in title and content */
  search?: string;
  /** Filter by author ID */
  author?: number;
  /** Filter by parent post ID (0 = top-level only) */
  parent?: number | null;
  /** Filter by specific post IDs */
  ids?: number[];
  /** Exclude specific post IDs */
  excludeIds?: number[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function rowToPost(row: {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: string;
  type: string;
  date: string;
  modified: string;
  parent: number;
  menuOrder: number;
  author: number;
}): Post {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    excerpt: row.excerpt,
    status: row.status,
    type: row.type,
    date: row.date,
    modified: row.modified,
    parent: row.parent,
    menuOrder: row.menuOrder,
    author: row.author,
  };
}

const POST_SELECT = {
  id: wpPosts.id,
  title: wpPosts.postTitle,
  slug: wpPosts.postName,
  content: wpPosts.postContent,
  excerpt: wpPosts.postExcerpt,
  status: wpPosts.postStatus,
  type: wpPosts.postType,
  date: wpPosts.postDate,
  modified: wpPosts.postModified,
  parent: wpPosts.postParent,
  menuOrder: wpPosts.menuOrder,
  author: wpPosts.postAuthor,
} as const;

/** Map a raw wpPosts Drizzle row to the Post interface. */
function mapPost(row: typeof wpPosts.$inferSelect): Post {
  return {
    id: row.id,
    title: row.postTitle,
    slug: row.postName,
    content: row.postContent,
    excerpt: row.postExcerpt,
    status: row.postStatus,
    type: row.postType,
    date: row.postDate,
    modified: row.postModified,
    parent: row.postParent,
    menuOrder: row.menuOrder,
    author: row.postAuthor,
  };
}

// ─── Posts ────────────────────────────────────────────────────────────────────

/**
 * Flexible post query — the Astro equivalent of `WP_Query`.
 *
 * @example
 * const { posts, total, pages } = await queryPosts(db, {
 *   type: "book",
 *   perPage: 12,
 *   orderBy: "title",
 *   order: "asc",
 * });
 */
export async function queryPosts(
  db: AnyDatabase,
  args: QueryArgs = {}
): Promise<QueryResult> {
  const {
    type = "post",
    status = "publish",
    perPage = 10,
    page = 1,
    orderBy = "date",
    order = "desc",
    search,
    author,
    parent,
    ids,
    excludeIds,
  } = args;

  const types = Array.isArray(type) ? type : [type];
  const statuses = Array.isArray(status) ? status : [status];

  const conditions: ReturnType<typeof eq>[] = [
    sql`${wpPosts.postType} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`,
    sql`${wpPosts.postStatus} IN (${sql.join(statuses.map(s => sql`${s}`), sql`, `)})`,
  ] as any;

  if (search) {
    // D1 的 LIKE 模式有 50 字符上限，needle 需截断（likeNeedle，见 db/raw.ts）
    const needle = likeNeedle(search);
    conditions.push(
      sql`(${wpPosts.postTitle} LIKE ${"%" + needle + "%"} OR ${wpPosts.postContent} LIKE ${"%" + needle + "%"})` as any
    );
  }
  if (author !== undefined) conditions.push(eq(wpPosts.postAuthor, author) as any);
  if (parent !== undefined && parent !== null) conditions.push(eq(wpPosts.postParent, parent) as any);
  if (ids && ids.length > 0) conditions.push(inArray(wpPosts.id, ids) as any);
  if (excludeIds && excludeIds.length > 0) {
    conditions.push(sql`${wpPosts.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})` as any);
  }

  const where = conditions.length === 1 ? conditions[0] : and(...(conditions as any));

  const orderCol =
    orderBy === "title"     ? wpPosts.postTitle    :
    orderBy === "menuOrder" ? wpPosts.menuOrder    :
    orderBy === "id"        ? wpPosts.id           :
    orderBy === "modified"  ? wpPosts.postModified :
                              wpPosts.postDate;

  const orderFn = order === "asc" ? asc : desc;

  let query = db.select(POST_SELECT).from(wpPosts).where(where as any).orderBy(orderFn(orderCol));

  if (perPage !== -1) {
    query = query.limit(perPage).offset((page - 1) * perPage) as any;
  }

  const rows = await query;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(wpPosts)
    .where(where as any);

  return {
    posts: rows.map(rowToPost),
    total,
    pages: perPage === -1 ? 1 : Math.ceil(total / perPage),
  };
}

/**
 * Get a single post by numeric ID or string slug.
 * Optionally filter by post type.
 *
 * @example
 * const post = await getPost(db, "my-article");
 * const page = await getPost(db, "about", "page");
 * const post = await getPost(db, 42);
 */
export async function getPost(
  db: AnyDatabase,
  idOrSlug: number | string,
  type?: string
): Promise<Post | null> {
  if (typeof idOrSlug === "number") return getPostById(db, idOrSlug);
  return getPostBySlug(db, idOrSlug, type);
}

/**
 * Get a post by its database ID.
 */
export async function getPostById(db: AnyDatabase, id: number): Promise<Post | null> {
  const [row] = await db.select(POST_SELECT).from(wpPosts).where(eq(wpPosts.id, id)).limit(1);
  return row ? rowToPost(row) : null;
}

/**
 * Get a published post by its slug (post_name).
 * Optionally filter by post type.
 */
export async function getPostBySlug(
  db: AnyDatabase,
  slug: string,
  type?: string
): Promise<Post | null> {
  const conditions: any[] = [
    eq(wpPosts.postName, slug),
    eq(wpPosts.postStatus, "publish"),
  ];
  if (type) conditions.push(eq(wpPosts.postType, type));

  const [row] = await db
    .select(POST_SELECT)
    .from(wpPosts)
    .where(and(...conditions))
    .limit(1);

  return row ? rowToPost(row) : null;
}

/**
 * Get direct child posts of a parent post.
 * Like `get_children()`.
 *
 * @example
 * const children = await getChildren(db, post.id, "page");
 */
export async function getChildren(
  db: AnyDatabase,
  parentId: number,
  type?: string
): Promise<Post[]> {
  const conditions: any[] = [
    eq(wpPosts.postParent, parentId),
    eq(wpPosts.postStatus, "publish"),
  ];
  if (type) conditions.push(eq(wpPosts.postType, type));

  const rows = await db
    .select(POST_SELECT)
    .from(wpPosts)
    .where(and(...conditions))
    .orderBy(asc(wpPosts.menuOrder), asc(wpPosts.postDate));

  return rows.map(rowToPost);
}

/**
 * Get the ancestor chain for a post, from root down to the immediate parent.
 * Like calling `get_post(get_post($id)->post_parent)` recursively.
 *
 * @example
 * const crumbs = await getAncestors(db, page.id);
 * // [grandparent, parent]
 */
export async function getAncestors(db: AnyDatabase, postId: number): Promise<Post[]> {
  const ancestors: Post[] = [];
  let currentId = postId;

  for (let depth = 0; depth < 10; depth++) {
    const [row] = await db
      .select({ ...POST_SELECT, parent: wpPosts.postParent })
      .from(wpPosts)
      .where(eq(wpPosts.id, currentId))
      .limit(1);
    if (!row || row.parent === 0) break;
    const parent = await getPostById(db, row.parent);
    if (!parent) break;
    ancestors.unshift(parent);
    currentId = parent.id;
  }

  return ancestors;
}

// ─── Post meta / Custom fields ────────────────────────────────────────────────

/**
 * Get a single custom field value for a post.
 * Like ACF's `get_field()` or WordPress `get_post_meta($id, $key, true)`.
 *
 * @example
 * const price = await getField(db, post.id, "price");
 * const img   = await getField(db, post.id, "hero_image");
 */
export async function getField(
  db: AnyDatabase,
  postId: number,
  key: string
): Promise<string | null> {
  const [row] = await db
    .select({ value: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)))
    .limit(1);
  return row?.value ?? null;
}

/**
 * Alias for `getField` — matches ACF's `the_field()` naming.
 * Returns empty string instead of null for direct template output.
 *
 * @example
 * <p>{await theField(db, post.id, "subtitle")}</p>
 */
export async function theField(
  db: AnyDatabase,
  postId: number,
  key: string
): Promise<string> {
  return (await getField(db, postId, key)) ?? "";
}

/**
 * Get ALL meta fields for a post as a plain object.
 * Private meta keys (prefixed `_`) are included unless `publicOnly` is true.
 *
 * @example
 * const meta = await getFields(db, post.id);
 * console.log(meta.price, meta.color);
 */
export async function getFields(
  db: AnyDatabase,
  postId: number,
  opts: { publicOnly?: boolean } = {}
): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: wpPostmeta.metaKey, value: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(eq(wpPostmeta.postId, postId));

  const result: Record<string, string> = {};
  for (const row of rows) {
    if (!row.key) continue;
    if (opts.publicOnly && row.key.startsWith("_")) continue;
    result[row.key] = row.value ?? "";
  }
  return result;
}

/** Alias for `getField` with WP naming convention. */
export const getPostMeta = getField;

/**
 * Upsert (insert or update) a post meta value.
 * Like `update_post_meta()`.
 *
 * @example
 * await updatePostMeta(db, post.id, "views", "42");
 */
export async function updatePostMeta(
  db: AnyDatabase,
  postId: number,
  key: string,
  value: string
): Promise<void> {
  const existing = await getField(db, postId, key);
  if (existing !== null) {
    await db
      .update(wpPostmeta)
      .set({ metaValue: value })
      .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)));
  } else {
    await db.insert(wpPostmeta).values({ postId, metaKey: key, metaValue: value });
  }
}

/**
 * Delete a post meta key.
 * Like `delete_post_meta()`.
 */
export async function deletePostMeta(
  db: AnyDatabase,
  postId: number,
  key: string
): Promise<void> {
  await db
    .delete(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)));
}

// ─── Terms / Taxonomy ─────────────────────────────────────────────────────────

export interface TermQueryArgs {
  /** Order: "name" | "count" | "id". Default: "name" */
  orderBy?: "name" | "count" | "id";
  order?: "asc" | "desc";
  /** Minimum post count to include. Default: 0 */
  minCount?: number;
  /** Parent term ID (0 = top-level). Pass null to skip filter. */
  parent?: number | null;
  /** Limit results. Default: all */
  limit?: number;
  /** Hide empty terms (count = 0). Default: true */
  hideEmpty?: boolean;
}

/**
 * Get all terms for a taxonomy.
 * Like `get_terms()`.
 *
 * @example
 * const categories = await getTerms(db, "category");
 * const tags       = await getTerms(db, "post_tag", { orderBy: "count", order: "desc" });
 */
export async function getTerms(
  db: AnyDatabase,
  taxonomy: string,
  args: TermQueryArgs = {}
): Promise<Term[]> {
  const {
    orderBy = "name",
    order = "asc",
    hideEmpty = true,
    parent = null,
    limit,
  } = args;

  const conditions: any[] = [eq(wpTermTaxonomy.taxonomy, taxonomy)];
  if (hideEmpty) conditions.push(sql`${wpTermTaxonomy.count} > 0` as any);
  if (parent !== null) conditions.push(eq(wpTermTaxonomy.parent, parent) as any);

  const orderCol =
    orderBy === "count" ? wpTermTaxonomy.count :
    orderBy === "id"    ? wpTerms.termId       :
                          wpTerms.name;

  const orderFn = order === "asc" ? asc : desc;

  let query = db
    .select({
      id: wpTerms.termId,
      name: wpTerms.name,
      slug: wpTerms.slug,
      taxonomy: wpTermTaxonomy.taxonomy,
      description: wpTermTaxonomy.description,
      parent: wpTermTaxonomy.parent,
      count: wpTermTaxonomy.count,
    })
    .from(wpTerms)
    .innerJoin(wpTermTaxonomy, eq(wpTermTaxonomy.termId, wpTerms.termId))
    .where(and(...conditions))
    .orderBy(orderFn(orderCol));

  if (limit) query = query.limit(limit) as any;

  return await query;
}

/**
 * Get all terms attached to a specific post within a taxonomy.
 * Like `get_the_terms()`.
 *
 * @example
 * const cats = await getPostTerms(db, post.id, "category");
 * const tags = await getPostTerms(db, post.id, "post_tag");
 */
export async function getPostTerms(
  db: AnyDatabase,
  postId: number,
  taxonomy: string
): Promise<Term[]> {
  return db
    .select({
      id: wpTerms.termId,
      name: wpTerms.name,
      slug: wpTerms.slug,
      taxonomy: wpTermTaxonomy.taxonomy,
      description: wpTermTaxonomy.description,
      parent: wpTermTaxonomy.parent,
      count: wpTermTaxonomy.count,
    })
    .from(wpTerms)
    .innerJoin(wpTermTaxonomy, eq(wpTermTaxonomy.termId, wpTerms.termId))
    .innerJoin(
      wpTermRelationships,
      eq(wpTermRelationships.termTaxonomyId, wpTermTaxonomy.termTaxonomyId)
    )
    .where(
      and(
        eq(wpTermRelationships.objectId, postId),
        eq(wpTermTaxonomy.taxonomy, taxonomy)
      )
    )
    .orderBy(asc(wpTerms.name));
}

/**
 * Get all published posts that have a specific term.
 * Like `WP_Query` with `tax_query`.
 *
 * @example
 * const posts = await getPostsByTerm(db, "javascript", "post_tag");
 * const books = await getPostsByTerm(db, "fiction", "genre", { type: "book" });
 */
export async function getPostsByTerm(
  db: AnyDatabase,
  termSlug: string,
  taxonomy: string,
  args: Pick<QueryArgs, "type" | "perPage" | "page" | "orderBy" | "order"> = {}
): Promise<Post[]> {
  const { type = "post", perPage = 10, page = 1, orderBy = "date", order = "desc" } = args;

  const orderCol =
    orderBy === "title"     ? wpPosts.postTitle :
    orderBy === "menuOrder" ? wpPosts.menuOrder  :
    orderBy === "id"        ? wpPosts.id         :
                              wpPosts.postDate;

  const orderFn = order === "asc" ? asc : desc;
  const types = Array.isArray(type) ? type : [type];

  const rows = await db
    .select(POST_SELECT)
    .from(wpPosts)
    .innerJoin(wpTermRelationships, eq(wpTermRelationships.objectId, wpPosts.id))
    .innerJoin(
      wpTermTaxonomy,
      eq(wpTermTaxonomy.termTaxonomyId, wpTermRelationships.termTaxonomyId)
    )
    .innerJoin(wpTerms, eq(wpTerms.termId, wpTermTaxonomy.termId))
    .where(
      and(
        eq(wpTerms.slug, termSlug),
        eq(wpTermTaxonomy.taxonomy, taxonomy),
        sql`${wpPosts.postType} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`,
        eq(wpPosts.postStatus, "publish")
      ) as any
    )
    .orderBy(orderFn(orderCol))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return rows.map(rowToPost);
}

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * Read a value from `wp_options`.
 * Like `get_option()`.
 *
 * @example
 * const name  = await getOption(db, "blogname");
 * const email = await getOption(db, "admin_email", "noreply@example.com");
 */
export async function getOption(
  db: AnyDatabase,
  name: string,
  fallback = ""
): Promise<string> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  return row?.value ?? fallback;
}

/**
 * Write or update a value in `wp_options`.
 * Like `update_option()`.
 *
 * @example
 * await updateOption(db, "blogname", "My Site");
 */
export async function updateOption(
  db: AnyDatabase,
  name: string,
  value: string
): Promise<void> {
  const existing = await getOption(db, name, "\0");
  if (existing === "\0") {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value });
  } else {
    await db
      .update(wpOptions)
      .set({ optionValue: value })
      .where(eq(wpOptions.optionName, name));
  }
}

/**
 * Get core site information.
 * Like `get_bloginfo()`.
 *
 * @example
 * const site = await getSiteInfo(db);
 * // { name, description, url, adminEmail }
 */
export async function getSiteInfo(db: AnyDatabase): Promise<SiteInfo> {
  const rows = await db
    .select({ name: wpOptions.optionName, value: wpOptions.optionValue })
    .from(wpOptions)
    .where(
      sql`${wpOptions.optionName} IN ('blogname','blogdescription','siteurl','admin_email')`
    );

  const m = Object.fromEntries(rows.map((r: { name: string | null; value: string }) => [r.name, r.value]));
  return {
    name:        m.blogname         ?? "AstroPress",
    description: m.blogdescription  ?? "",
    url:         m.siteurl          ?? "",
    adminEmail:  m.admin_email      ?? "",
  };
}

// ─── Users / Authors ──────────────────────────────────────────────────────────

/**
 * Get a user by ID.
 * Like `get_userdata()` / `get_the_author_meta()`.
 *
 * @example
 * const author = await getAuthor(db, post.author);
 * <p>By {author?.displayName}</p>
 */
export async function getAuthor(
  db: AnyDatabase,
  userId: number
): Promise<Author | null> {
  const [row] = await db
    .select({
      id:          wpUsers.id,
      login:       wpUsers.userLogin,
      email:       wpUsers.userEmail,
      displayName: wpUsers.displayName,
      url:         wpUsers.userUrl,
      registered:  wpUsers.userRegistered,
    })
    .from(wpUsers)
    .where(eq(wpUsers.id, userId))
    .limit(1);

  return row ?? null;
}

// ─── Full-text search ─────────────────────────────────────────────────────────

/**
 * Full-text search across published posts.
 *
 * On SQLite (D1 / LibSQL): uses FTS5 virtual table (requires 0002_fts migration).
 * On PostgreSQL: uses tsvector GIN index (requires 0002_fts migration).
 * Falls back to LIKE search if FTS is not set up.
 *
 * @example
 * const { posts } = await searchPosts(db, "astro cloudflare", { type: "post" });
 */
export async function searchPosts(
  db: AnyDatabase,
  query: string,
  opts: { type?: string; perPage?: number; page?: number } = {}
): Promise<QueryResult> {
  const { type, perPage = 10, page = 1 } = opts;
  const offset = (page - 1) * perPage;
  const safeTerm = query.trim();
  if (!safeTerm) return { posts: [], total: 0, pages: 0 };

  try {
    // SQLite FTS5 path
    const ftsRows: Array<{ post_id: number }> = await db
      .select({ post_id: sql<number>`post_id` })
      .from(sql`wp_fts('${sql.raw(safeTerm.replace(/'/g, "''"))}')`)
      .where(type ? sql`type = ${type}` : sql`1=1`)
      .orderBy(sql`rank`)
      .limit(perPage)
      .offset(offset);

    const ids = ftsRows.map((r) => r.post_id).filter(Boolean);
    if (ids.length === 0) return { posts: [], total: 0, pages: 0 };

    const posts = await db
      .select()
      .from(wpPosts)
      .where(inArray(wpPosts.id, ids));

    const total = ids.length;
    return { posts: posts.map(mapPost), total, pages: Math.ceil(total / perPage) };
  } catch {
    // Fallback: LIKE search (PostgreSQL or FTS not yet set up)
    const term = `%${safeTerm}%`;
    const rows = await db
      .select()
      .from(wpPosts)
      .where(
        and(
          eq(wpPosts.postStatus, "publish"),
          type ? eq(wpPosts.postType, type) : undefined,
          sql`(${wpPosts.postTitle} ILIKE ${term} OR ${wpPosts.postContent} ILIKE ${term} OR ${wpPosts.postExcerpt} ILIKE ${term})`
        )
      )
      .orderBy(desc(wpPosts.postDate))
      .limit(perPage)
      .offset(offset);

    return {
      posts: rows.map(mapPost),
      total: rows.length,
      pages: Math.ceil(rows.length / perPage),
    };
  }
}

// ─── Convenience re-exports ───────────────────────────────────────────────────

/** Alias matching WordPress naming exactly. */
export const wp_query      = queryPosts;
export const get_post      = getPost;
export const get_field     = getField;
export const the_field     = theField;
export const get_post_meta = getPostMeta;
export const get_terms     = getTerms;
export const get_the_terms = getPostTerms;
export const get_option    = getOption;
export const update_option = updateOption;
export const get_bloginfo  = getSiteInfo;
export const get_children  = getChildren;
