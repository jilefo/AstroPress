# Query API

`@astropress/core/query` provides WordPress-style data helpers for Astro frontmatter and server-side code. All functions are `async` and take a `db` instance as their first argument.

```astro
---
import { queryPosts, getField, getPostTerms } from "@astropress/core/query";
const db = Astro.locals.db;
---
```

---

## Posts

### `queryPosts(db, args?)` → `QueryResult`

The equivalent of `WP_Query`. Returns paginated posts with a total count.

```astro
---
const { posts, total, pages } = await queryPosts(db, {
  type: "book",
  perPage: 12,
  page: 1,
  orderBy: "title",
  order: "asc",
});
---
<p>Showing {posts.length} of {total} books across {pages} pages</p>
{posts.map(post => <h2>{post.title}</h2>)}
```

**`QueryArgs`**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `string \| string[]` | `"post"` | Post type(s) |
| `status` | `string \| string[]` | `"publish"` | Post status(es) |
| `perPage` | `number` | `10` | Posts per page. `-1` = all |
| `page` | `number` | `1` | Current page (1-based) |
| `orderBy` | `"date" \| "title" \| "menuOrder" \| "id"` | `"date"` | Sort field |
| `order` | `"asc" \| "desc"` | `"desc"` | Sort direction |
| `search` | `string` | — | Full-text search in title + content |
| `author` | `number` | — | Filter by author ID |
| `parent` | `number \| null` | — | Filter by parent post ID |
| `ids` | `number[]` | — | Filter to specific IDs |
| `excludeIds` | `number[]` | — | Exclude specific IDs |

**`QueryResult`**

```ts
{
  posts: Post[];
  total: number;    // total matching posts (before pagination)
  pages: number;    // total pages
}
```

---

### `getPost(db, idOrSlug, type?)` → `Post | null`

Get a single post by numeric ID or slug. Optionally constrain by post type.

```astro
---
// By slug
const page = await getPost(db, "about", "page");

// By ID
const post = await getPost(db, 42);

// Any published post with this slug
const item = await getPost(db, "my-article");
---
```

---

### `getPostById(db, id)` → `Post | null`

```ts
const post = await getPostById(db, 42);
```

---

### `getPostBySlug(db, slug, type?)` → `Post | null`

Only returns published posts.

```ts
const post = await getPostBySlug(db, "my-article", "post");
```

---

### `getChildren(db, parentId, type?)` → `Post[]`

Get direct child posts of a parent, ordered by `menu_order` then date.
Like `get_children()`.

```astro
---
const sections = await getChildren(db, page.id, "page");
---
```

---

### `getAncestors(db, postId)` → `Post[]`

Returns the ancestor chain from root down to the immediate parent (root first).
Useful for breadcrumbs.

```astro
---
const crumbs = await getAncestors(db, page.id);
// [Home, Products, Laptops] if page is nested 3 levels deep
---
<nav>
  {crumbs.map(a => <a href={`/${a.slug}`}>{a.title}</a>)}
  <span>{page.title}</span>
</nav>
```

---

## The `Post` type

```ts
interface Post {
  id:        number;
  title:     string;
  slug:      string;
  content:   string;   // raw Gutenberg HTML
  excerpt:   string;
  status:    string;   // "publish" | "draft" | "trash" …
  type:      string;   // "post" | "page" | "book" …
  date:      string;   // "2024-06-01 12:00:00"
  modified:  string;
  parent:    number;   // 0 = top-level
  menuOrder: number;
  author:    number;   // user ID
}
```

---

## Post meta / Custom fields

### `getField(db, postId, key)` → `string | null`

Get a single custom field value. Equivalent to ACF `get_field()` or `get_post_meta($id, $key, true)`.

```astro
---
const price    = await getField(db, post.id, "price");
const heroImg  = await getField(db, post.id, "hero_image");
const isbn     = await getField(db, post.id, "isbn");
---
{price && <p>Price: {price}</p>}
```

---

### `theField(db, postId, key)` → `string`

Like `getField` but returns `""` instead of `null`. Safe for direct template output without a null-check.

```astro
<p class="subtitle">{await theField(db, post.id, "subtitle")}</p>
```

---

### `getFields(db, postId, opts?)` → `Record<string, string>`

Get ALL meta fields for a post as a plain object.

```astro
---
const meta = await getFields(db, post.id);
// { price: "29.99", isbn: "978-...", _edit_lock: "..." }

// Skip private keys (prefixed _)
const publicMeta = await getFields(db, post.id, { publicOnly: true });
---
```

---

### `getPostMeta`

Alias for `getField`.

---

### `updatePostMeta(db, postId, key, value)` → `void`

Upsert a meta value. Like `update_post_meta()`.

```ts
await updatePostMeta(db, post.id, "views", String(views + 1));
```

---

### `deletePostMeta(db, postId, key)` → `void`

Delete a meta key. Like `delete_post_meta()`.

```ts
await deletePostMeta(db, post.id, "old_field");
```

---

## Terms / Taxonomy

### `getTerms(db, taxonomy, args?)` → `Term[]`

Get all terms in a taxonomy. Like `get_terms()`.

```astro
---
const categories = await getTerms(db, "category");
const topTags    = await getTerms(db, "post_tag", {
  orderBy: "count",
  order: "desc",
  limit: 10,
});
---
```

**`TermQueryArgs`**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `orderBy` | `"name" \| "count" \| "id"` | `"name"` | Sort field |
| `order` | `"asc" \| "desc"` | `"asc"` | Sort direction |
| `hideEmpty` | `boolean` | `true` | Skip terms with 0 posts |
| `parent` | `number \| null` | `null` | Filter by parent term (0 = top-level only) |
| `limit` | `number` | — | Max results |

---

### `getPostTerms(db, postId, taxonomy)` → `Term[]`

Get all terms attached to a specific post. Like `get_the_terms()`.

```astro
---
const cats = await getPostTerms(db, post.id, "category");
const tags = await getPostTerms(db, post.id, "post_tag");
---
{cats.map(cat => <a href={`/category/${cat.slug}`}>{cat.name}</a>)}
```

---

### `getPostsByTerm(db, termSlug, taxonomy, args?)` → `Post[]`

Get posts that have a specific term. Like `WP_Query` with `tax_query`.

```astro
---
const jsArticles  = await getPostsByTerm(db, "javascript", "post_tag");
const fictionBooks = await getPostsByTerm(db, "fiction", "genre", {
  type: "book",
  perPage: 6,
});
---
```

---

## The `Term` type

```ts
interface Term {
  id:          number;
  name:        string;
  slug:        string;
  taxonomy:    string;
  description: string;
  parent:      number;  // 0 = top-level
  count:       number;  // number of posts using this term
}
```

---

## Options

### `getOption(db, name, fallback?)` → `string`

Read a value from `wp_options`. Like `get_option()`.

```ts
const blogName = await getOption(db, "blogname", "My Site");
const perPage  = await getOption(db, "posts_per_page", "10");
```

---

### `updateOption(db, name, value)` → `void`

Write or update a value. Like `update_option()`.

```ts
await updateOption(db, "blogname", "New Site Name");
```

---

### `getSiteInfo(db)` → `SiteInfo`

Get the core site options in one call. Like `get_bloginfo()`.

```astro
---
const site = await getSiteInfo(db);
---
<title>{site.name}</title>
<meta name="description" content={site.description} />
```

```ts
interface SiteInfo {
  name:        string;  // blogname
  description: string;  // blogdescription
  url:         string;  // siteurl
  adminEmail:  string;  // admin_email
}
```

---

## Users / Authors

### `getAuthor(db, userId)` → `Author | null`

Get a user by ID. Like `get_userdata()`.

```astro
---
const author = await getAuthor(db, post.author);
---
{author && <p>Written by <strong>{author.displayName}</strong></p>}
```

```ts
interface Author {
  id:          number;
  login:       string;
  email:       string;
  displayName: string;
  url:         string;
  registered:  string;
}
```

---

## WordPress-cased aliases

For muscle memory, all core functions are also exported with WP naming:

```ts
import {
  wp_query,      // = queryPosts
  get_post,      // = getPost
  get_field,     // = getField
  the_field,     // = theField
  get_post_meta, // = getPostMeta
  get_terms,     // = getTerms
  get_the_terms, // = getPostTerms
  get_option,    // = getOption
  update_option, // = updateOption
  get_bloginfo,  // = getSiteInfo
  get_children,  // = getChildren
} from "@astropress/core/query";
```

---

## Usage patterns

### Paginated archive

```astro
---
const page = Number(Astro.url.searchParams.get("page") ?? "1");
const { posts, total, pages } = await queryPosts(db, { perPage: 10, page });
---
{posts.map(p => <article>...</article>)}

<nav class="pagination">
  {Array.from({ length: pages }, (_, i) => (
    <a href={`?page=${i + 1}`} class={page === i + 1 ? "current" : ""}>{i + 1}</a>
  ))}
</nav>
```

### Custom post type with fields

```astro
---
const { posts } = await queryPosts(db, { type: "event", orderBy: "date", order: "asc" });

// Fetch a field for every post in one go
const dates = await Promise.all(posts.map(p => getField(db, p.id, "event_date")));
---
{posts.map((event, i) => (
  <article>
    <h2>{event.title}</h2>
    <time>{dates[i]}</time>
  </article>
))}
```

### Taxonomy archive page

```astro
---
// apps/web/src/pages/category/[slug].astro
const { slug } = Astro.params;
const posts = await getPostsByTerm(db, slug!, "category");
const terms = await getTerms(db, "category");
---
```
