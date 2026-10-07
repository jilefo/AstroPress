# Forms

AstroPress includes a full form builder (WPForms-style) with entries management, conditional logic, multi-page support, and server-side rendering.

---

## Creating a form

1. Go to **Forms** in the admin sidebar
2. Click **+ New Form**
3. You are taken to the form builder for the new form
4. Drag field types from the left panel into the canvas
5. Click a field to configure it in the right panel
6. Click **Save Form**

---

## Field types

| Type | Description |
|------|-------------|
| `text` | Single-line text |
| `textarea` | Multi-line text |
| `email` | Email address (validated) |
| `phone` | Phone number |
| `number` | Numeric input |
| `select` | Dropdown |
| `multiselect` | Multi-option dropdown |
| `checkbox` | Checkboxes |
| `radio` | Radio buttons |
| `date` | Date picker |
| `time` | Time picker |
| `rating` | Star rating (1–5) |
| `nps` | Net Promoter Score (0–10) |
| `file` | File upload |
| `hidden` | Hidden field with a default value |
| `html` | Static HTML content |
| `section` | Section divider with title/description |
| `page_break` | Multi-page separator |
| `captcha` | Basic honeypot anti-spam |
| `name` | Name (first + last) |
| `address` | Address (street, city, state, zip, country) |
| `signature` | Canvas signature pad |
| `likert` | Matrix/Likert scale |
| `slider` | Range slider |

---

## Embedding a form in a post or page

1. Open any post or page in the block editor
2. Click **+** → search for **Form** (the `astropress/form` block)
3. Select your form from the dropdown
4. Publish/Update the post

The form block is saved as:
```html
<div class="wp-block-astropress-form" data-form-id="abc123"></div>
```

The web app replaces this server-side with full HTML before sending the page response — no iframe, no client-side JavaScript required for basic form rendering.

---

## How forms render on the public site

When `apps/web/src/pages/[slug].astro` or `blog/[slug].astro` serves a page that contains a form block:

1. A regex extracts all `data-form-id` values from the post content
2. Form configs are loaded from `wp_options` (`astropress_forms`)
3. `buildFormHtml(form)` from `apps/web/src/lib/formRenderer.ts` generates the full form HTML
4. The placeholder `<div>` is replaced with the rendered HTML
5. `APF_STYLES` (CSS) and `APF_SCRIPT` (vanilla JS IIFE) are injected once per page

This means forms work with JavaScript disabled for display, but interactivity (validation, multi-page, conditional logic) uses the injected vanilla JS.

---

## Form submissions

Submissions go to:
- `POST /api/forms/submit` on the **web app** (for public-facing pages)
- `POST /api/forms/submit` on the **admin app** (for preview/testing)

Both endpoints validate fields, apply honeypot protection, check schedule windows, enforce entry limits, and store the entry in `wp_options` keyed `astropress_form_entries_{formId}`.

---

## Viewing entries

1. Go to **Forms** in the admin
2. Click **Entries** next to a form

The entries table shows:
- Date/time of submission
- Status: Unread / Read / Starred / Spam / Trash
- All field values
- Bulk status actions and CSV export

---

## Form config shape

Forms are stored as JSON in `wp_options` key `astropress_forms`:

```ts
interface Form {
  id:          string;
  title:       string;
  fields:      FormField[];
  settings: {
    submitText:        string;
    successMessage:    string;
    redirectUrl?:      string;
    notifyEmail?:      string;
    honeypot:          boolean;
    scheduleEnabled:   boolean;
    scheduleStart?:    string;
    scheduleEnd?:      string;
    limitEntries:      boolean;
    entryLimit?:       number;
  };
  createdAt:   string;
  updatedAt:   string;
}
```

---

## Programmatic form access

```ts
import { getOption } from "@astropress/core/query";

const db = Astro.locals.db;
const raw = await getOption(db, "astropress_forms", "[]");
const forms = JSON.parse(raw) as Form[];

const form = forms.find(f => f.id === "abc123");
```

---

## Form shortcode reference

Each form shows a shortcode in the Forms list:

```
[astropress_form id="abc123"]
```

This is informational only — embedding is done via the Gutenberg block. Shortcode rendering in content is not yet implemented.
