# Custom Fields

AstroPress has an ACF-style custom fields system. Field groups are created in the admin and automatically appear in the post editor sidebar.

---

## Creating a field group

1. Go to **Structure → Custom Fields**
2. Click **+ New Field Group**
3. Give it a title and add fields
4. Set **Location Rules** to attach it to one or more post types
5. Save — it appears immediately in the editor

---

## Field types

| Type | Description |
|------|-------------|
| `text` | Single-line text |
| `textarea` | Multi-line text |
| `number` | Numeric input |
| `range` | Slider |
| `email` | Email address |
| `url` | URL |
| `password` | Password (stored plain — use for display keys, not sensitive data) |
| `image` | Image attachment ID |
| `file` | File attachment ID |
| `wysiwyg` | Rich text editor |
| `oembed` | oEmbed URL |
| `gallery` | Multiple attachment IDs |
| `select` | Dropdown |
| `checkbox` | Multiple checkboxes |
| `radio` | Radio buttons |
| `button_group` | Pill-style choice buttons |
| `true_false` | Boolean toggle |
| `link` | URL + label object |
| `post_object` | Post ID picker |
| `page_link` | Post permalink picker |
| `relationship` | Multi-post picker |
| `taxonomy` | Term picker |
| `user` | User picker |
| `date_picker` | Date |
| `date_time_picker` | Date + time |
| `time_picker` | Time only |
| `color_picker` | Hex color |
| `google_map` | Lat/lng picker |
| `message` | Display-only text |
| `accordion` | Collapsible section |
| `tab` | Tab divider |
| `group` | Nested group of fields |
| `repeater` | Repeatable row of sub-fields |
| `flexible_content` | Multiple layout types, each with sub-fields |
| `clone` | Clone another field or group |

---

## Location rules

Field groups are attached to post types via location rules:

```
Rule: post_type == book        → appears on all Book posts
Rule: post_type == book
  AND post_type != page        → example of AND logic
OR
Rule: post_type == event       → OR group — also appears on Events
```

Rules are evaluated server-side in `getFieldGroupsForPost(postType)` from `@astropress/core/registry`.

---

## Reading field values

In any Astro page, use `@astropress/core/query`:

```astro
---
import { getField, getFields, theField } from "@astropress/core/query";
const db = Astro.locals.db;

// Single field — returns string | null
const price = await getField(db, post.id, "price");

// All fields as a plain object
const meta = await getFields(db, post.id);

// For direct template output (returns "" if null)
const subtitle = await theField(db, post.id, "subtitle");
---

<h2>{post.title}</h2>
{subtitle && <p class="subtitle">{subtitle}</p>}
{price && <p class="price">${price}</p>}
```

All values are stored as strings in `wp_postmeta`. For complex types (image, relationship, etc.) the value is a serialized ID or JSON string.

---

## Writing field values

Use `updatePostMeta` for single values:

```ts
import { updatePostMeta } from "@astropress/core/query";

await updatePostMeta(db, post.id, "price", "29.99");
await updatePostMeta(db, post.id, "featured_image", String(attachmentId));
```

Or write directly via the REST API:

```
PATCH /api/posts/{id}/meta
{ "price": "29.99", "featured_image": "42" }
```

---

## Field group config shape

Field groups are stored as JSON in `wp_options`:

```ts
interface FieldGroup {
  id:                  string;          // unique ID
  key:                 string;          // "group_xxxxxxxx"
  title:               string;
  fields:              ACFField[];
  location:            FieldGroupLocation[][];  // OR of AND rules
  menuOrder:           number;
  position:            "normal" | "side" | "acf_after_title";
  labelPlacement:      "top" | "left";
  instructionPlacement:"label" | "field";
  hideOnScreen:        string[];
  active:              boolean;
}
```

---

## Reading groups from the registry

```ts
import {
  getFieldGroups,
  getFieldGroup,
  getFieldGroupsForPost,
} from "@astropress/core/registry";

// All active groups
const groups = getFieldGroups();

// Groups that apply to a specific post type
const bookGroups = getFieldGroupsForPost("book");
```

---

## Conditional logic

Each field can have conditional logic to show/hide based on the value of another field in the same group:

```ts
{
  conditionalLogic: [
    [
      // AND group
      { field: "has_discount", operator: "==", value: "1" }
    ]
  ]
}
```

The outer array is OR, the inner array is AND. Set `conditionalLogic: false` to always show.
