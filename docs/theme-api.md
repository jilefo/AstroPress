# Theme API

Themes control the visual appearance of `apps/web`. The active theme is imported directly in `apps/web/src/layouts/BaseLayout.astro`.

---

## Default theme

The default theme (`themes/default`) exports a single `themeStyles` CSS string injected into every page via `<style set:html={themeStyles} />`.

It uses CSS custom properties throughout so values can be overridden by child themes or page-level styles.

---

## CSS variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--font-sans` | `system-ui, -apple-system, 'Segoe UI', sans-serif` | Body font stack |
| `--font-serif` | `Georgia, 'Times New Roman', serif` | Serif stack |
| `--font-mono` | `'Fira Code', Consolas, monospace` | Code font |
| `--color-bg` | `#ffffff` | Page background |
| `--color-surface` | `#f8f9fa` | Card/code block background |
| `--color-border` | `#e9ecef` | Dividers, card borders |
| `--color-text` | `#212529` | Body text |
| `--color-muted` | `#6c757d` | Secondary text, meta |
| `--color-primary` | `#2271b1` | Links, buttons |
| `--color-primary-hover` | `#135e96` | Link/button hover |
| `--max-width` | `740px` | Content column width |
| `--header-height` | `60px` | Site header height |
| `--radius-sm` | `3px` | Small border radius |
| `--radius-md` | `6px` | Medium border radius |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.08)` | Subtle shadow |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,.12)` | Card shadow |

---

## Built-in CSS classes

### Layout

| Class | Description |
|-------|-------------|
| `.site-wrapper` | Max-width centered container |
| `.site-header` | Fixed-height header bar |
| `.site-branding` | Site name + description |
| `.site-nav` | Horizontal navigation list |
| `.site-main` | Main content area with vertical padding |
| `.site-footer` | Footer bar |

### Post list

| Class | Description |
|-------|-------------|
| `.post-list` | `<ul>` containing post items |
| `.post-list-item` | Single post row with bottom border |
| `.post-meta` | Date/author line |
| `.post-excerpt` | Excerpt paragraph |
| `.read-more` | "Read more" link |

### Single post

| Class | Description |
|-------|-------------|
| `.post-header` | Title + meta block |
| `.post-content` | Post body — typography styles included |

### Gutenberg blocks

| Class | Description |
|-------|-------------|
| `.wp-block-image` | Image block wrapper with margin |

### Pagination

| Class | Description |
|-------|-------------|
| `.pagination` | Flex row of page links |
| `.pagination .current` | Highlighted active page |

### 404

| Class | Description |
|-------|-------------|
| `.not-found` | Centered 404 layout |

---

## Creating a theme

### 1. Create the package

```
themes/my-theme/
├── package.json
└── index.ts
```

`package.json`:
```json
{
  "name": "@astropress/theme-my-theme",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts"
  }
}
```

`index.ts`:
```ts
export const themeStyles = `
  :root {
    --color-primary: #7c3aed;
    --color-primary-hover: #6d28d9;
    --font-sans: 'Inter', system-ui, sans-serif;
    --max-width: 860px;
  }

  /* Your custom styles here */
  .site-header {
    border-bottom: 2px solid var(--color-primary);
  }
`;
```

### 2. Activate the theme

In `apps/web/src/layouts/BaseLayout.astro`, change the import:

```diff
- import { themeStyles } from "@astropress/theme-default";
+ import { themeStyles } from "@astropress/theme-my-theme";
```

Also add the dependency to `apps/web/package.json`:

```json
{
  "dependencies": {
    "@astropress/theme-my-theme": "workspace:*"
  }
}
```

---

## Extending the default theme

To inherit default styles and add overrides:

```ts
// themes/my-theme/index.ts
import { themeStyles as defaultStyles } from "@astropress/theme-default";

export const themeStyles = `
  ${defaultStyles}

  :root {
    --color-primary: #7c3aed;
  }

  .site-header {
    border-bottom: 2px solid var(--color-primary);
  }
`;
```

---

## Customising the layout

The layout HTML lives in `apps/web/src/layouts/BaseLayout.astro`. It handles:
- `<head>` with title, meta description, and theme styles
- Header with site name, description, and primary navigation
- Main content slot
- Footer

To change the HTML structure, edit `BaseLayout.astro` directly or create a new layout file and use it in specific pages.

---

## Navigation in themes

The default `BaseLayout.astro` reads the `primary` menu automatically:

```astro
const navItems = db ? await getNavMenu(db, "primary") : [];
```

To render a different menu location, add a call for each slug:

```astro
const footerNav = db ? await getNavMenu(db, "footer") : [];
```

Create a menu with the matching slug in **Site → Menus** in the admin.
