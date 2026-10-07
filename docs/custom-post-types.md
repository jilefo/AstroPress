# Custom Post Types

Custom post types (CPTs) work exactly like WordPress. You can create them via the admin UI or register them programmatically via a plugin.

---

## Creating via admin UI

1. Go to **Structure → Post Types** in the admin sidebar
2. Click **+ Add New**
3. Fill in the form and click **Create Post Type**

The type is saved to `wp_options` (`astropress_custom_post_types`) and loaded into the registry on every request.

### Fields

| Field | Description |
|-------|-------------|
| Singular Label | e.g. `Book` |
| Plural Label | e.g. `Books` — shown in the sidebar |
| Post Type Key | e.g. `book` — lowercase, no spaces, max 20 chars |
| Icon | Chosen from the icon picker — stored as an icon name string |
| Description | Optional |
| Public | Whether the type is publicly queryable |
| Show in REST API | Enables block editor support |
| Hierarchical | Like pages (parent/child) |
| Has Archive | Enables an archive page |
| Exclude from Search | Hide from search results |
| Supports | `title`, `editor`, `excerpt`, `thumbnail`, `custom-fields`, etc. |

---

## Registering via plugin (programmatic)

Use `registerPostType()` from `@astropress/core` inside a plugin's `register()` function:

```ts
// plugins/my-plugin/src/index.ts
import { definePlugin, registerPostType } from "@astropress/core";

export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",
  register() {
    registerPostType("book", {
      label: "Book",
      pluralLabel: "Books",
      icon: "book",            // icon name from the icon pack
      public: true,
      showInMenu: true,
      supports: ["title", "editor", "thumbnail", "excerpt", "custom-fields"],
      hasArchive: true,
    });
  },
});
```

Then load it in `apps/admin/src/plugins.ts`:

```ts
import myPlugin from "@astropress/my-plugin";
loadPlugin(myPlugin);
```

### `PostTypeConfig` reference

```ts
interface PostTypeConfig {
  label:              string;   // singular
  pluralLabel:        string;   // plural — shown in sidebar
  description?:       string;
  icon?:              string;   // icon name (see icons.md)
  public?:            boolean;  // default: true
  showInMenu?:        boolean;  // show in admin sidebar
  hierarchical?:      boolean;  // parent/child like pages
  hasArchive?:        boolean;
  showInRest?:        boolean;  // enable REST API + block editor
  excludeFromSearch?: boolean;
  menuPosition?:      number;
  supports?:          Array<"title"|"editor"|"thumbnail"|"excerpt"|"custom-fields"|"author"|"comments"|"revisions">;
  custom?:            boolean;  // true for DB-stored types
}
```

---

## Accessing the registry

```ts
import {
  getPostTypes,       // all registered types
  getPostType,        // single type by slug
  getCustomPostTypes, // only custom (DB-stored) types
} from "@astropress/core/registry";

const types = getPostTypes();
const bookType = getPostType("book");
```

---

## Querying CPT content

Use `@astropress/core/query` — same API as for posts and pages:

```astro
---
import { queryPosts, getField } from "@astropress/core/query";
const db = Astro.locals.db;

const { posts: books } = await queryPosts(db, {
  type: "book",
  orderBy: "title",
  order: "asc",
  perPage: -1,   // all
});
---
<ul>
  {books.map(async book => {
    const author = await getField(db, book.id, "author_name");
    return <li>{book.title} — {author}</li>;
  })}
</ul>
```

---

## Admin routes

Each registered CPT with `showInMenu: true` automatically gets these admin pages:

| URL | Description |
|-----|-------------|
| `/admin/cpt/{slug}` | List view |
| `/admin/cpt/{slug}/new` | Create new |
| `/admin/cpt/{slug}/{id}` | Edit existing |

---

## Built-in post types

These are registered in `packages/core/src/registry/index.ts` and cannot be deleted:

| Slug | Label | Notes |
|------|-------|-------|
| `post` | Post | The default blog post type |
| `page` | Page | Hierarchical, no archive |
| `attachment` | Media | Managed by the media library |
| `nav_menu_item` | Menu Item | Internal use only |
