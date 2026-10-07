# Navigation Menus

AstroPress uses the WordPress `wp_terms` / `wp_term_taxonomy` / `wp_term_relationships` table structure to store navigation menus.

---

## Creating a menu

1. Go to **Site → Menus** in the admin sidebar
2. Click **+ New Menu**
3. Enter a name (e.g. `Primary Navigation`) and click **Create**
4. You are taken to the menu editor

---

## Menu editor

The menu editor lets you:

- **Add items** — paste a URL + label, or pick from quick-add panels (Pages, Posts)
- **Reorder items** — drag rows up/down using the ⠿ drag handle
- **Nest items** — click ↳ to indent an item (creates a submenu), ← to outdent
- **Rename labels** — click the item's label text to edit inline, then blur to save
- **Delete items** — click the × button on any row
- **Save order** — click **Save Menu** to persist the drag-and-drop order
- **Rename the menu** — click the menu name at the top to edit it inline

---

## Menu locations

The web app theme reads a menu by its **slug**. By convention:

| Slug | Location |
|------|---------|
| `primary` | Main header navigation |
| `footer` | Footer navigation (if theme supports it) |

Name your menu anything — as long as its slug matches, it will appear in the right location. The slug is auto-generated from the menu name (e.g. `Primary Navigation` → `primary-navigation`). You can also create a menu named exactly `Primary` to get the slug `primary`.

---

## Reading menus in themes/pages

Use `getNavMenu` from `apps/web/src/lib/query.ts` (re-exported from `@astropress/core/query`):

```astro
---
import { getNavMenu } from "../lib/query";
const navItems = await getNavMenu(db, "primary");
---
<nav>
  <ul>
    {navItems.map(item => (
      <li>
        <a href={item.url}>{item.title}</a>
        {/* sub-items: items where item.parent === parentItem.id */}
      </li>
    ))}
  </ul>
</nav>
```

**`NavMenuItem`**

```ts
interface NavMenuItem {
  id:     number;
  title:  string;
  url:    string;
  order:  number;
  parent: number;  // 0 = top-level; parent id for sub-items
}
```

### Building a nested menu

Items with `parent > 0` are sub-items. To render a nested structure:

```astro
---
const allItems = await getNavMenu(db, "primary");
const topLevel = allItems.filter(i => i.parent === 0);
---
<ul class="site-nav">
  {topLevel.map(item => {
    const children = allItems.filter(c => c.parent === item.id);
    return (
      <li>
        <a href={item.url}>{item.title}</a>
        {children.length > 0 && (
          <ul class="sub-menu">
            {children.map(child => (
              <li><a href={child.url}>{child.title}</a></li>
            ))}
          </ul>
        )}
      </li>
    );
  })}
</ul>
```

---

## REST API

| Method | Endpoint | Description |
|--------|---------|-------------|
| `GET` | `/api/menus` | List all menus |
| `POST` | `/api/menus` | Create a menu `{ name }` |
| `PATCH` | `/api/menus/:id` | Rename menu `{ name }` |
| `DELETE` | `/api/menus/:id` | Delete menu + all items |
| `POST` | `/api/menus/:id/items` | Add item `{ url, title }` |
| `PATCH` | `/api/menus/:id/items` | Bulk reorder `[{ id, menuOrder, postParent }]` |
| `PATCH` | `/api/menus/:id/items/:itemId` | Update single item `{ title?, url?, menuOrder?, postParent? }` |
| `DELETE` | `/api/menus/:id/items/:itemId` | Delete single item |

---

## Database structure

```
wp_terms         name="Primary", slug="primary"
  ↓ termId
wp_term_taxonomy taxonomy="nav_menu", termId=...
  ↓ termTaxonomyId
wp_term_relationships  objectId=<nav_menu_item post ID>
  ↓
wp_posts         postType="nav_menu_item", postTitle=<label>, menuOrder=<position>
  ↓ id
wp_postmeta      metaKey="_menu_item_url", metaValue=<url>
```
