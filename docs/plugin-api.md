# Plugin API

Plugins extend AstroPress server-side at startup. They can register post types, taxonomies, field groups, and sidebar panels without modifying core.

---

## Plugin anatomy

Every plugin exports a default `definePlugin` config:

```ts
// plugins/my-plugin/src/index.ts
import { definePlugin, registerPostType, registerTaxonomy } from "@astropress/core";

export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",
  description: "What this plugin does",

  register() {
    // Called once at startup — register everything here
    registerPostType("product", {
      label: "Product",
      pluralLabel: "Products",
      icon: "bag",
      public: true,
      showInMenu: true,
      supports: ["title", "editor", "thumbnail", "custom-fields"],
    });

    registerTaxonomy("product_category", {
      label: "Product Category",
      pluralLabel: "Product Categories",
      hierarchical: true,
      postTypes: ["product"],
    });
  },
});
```

---

## Loading a plugin

Import and call `loadPlugin()` in `apps/admin/src/plugins.ts`:

```ts
import { loadPlugin } from "@astropress/core";
import myPlugin from "@astropress/my-plugin";

let bootstrapped = false;

export function bootstrapPlugins(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  loadPlugin(myPlugin);   // ← add your plugin here
}
```

`bootstrapPlugins()` is called on every request in middleware but guarded by the `bootstrapped` flag so `register()` runs exactly once per process.

---

## What plugins can do

| Capability | API |
|-----------|-----|
| Register post type | `registerPostType(slug, config)` |
| Register taxonomy | `registerTaxonomy(slug, config)` |
| Register field group | `registerFieldGroup(group)` |
| Register sidebar panel | `registerSidebarPanel(id, config)` |
| Add sidebar links | Post types with `showInMenu: true` appear automatically |

---

## Registering a sidebar panel

Sidebar panels appear in the post editor. The panel is rendered by a React island on the client:

```ts
import { registerSidebarPanel } from "@astropress/core";

registerSidebarPanel("my-panel", {
  id: "my-panel",
  title: "My Panel",
  postTypes: ["post", "page"],    // empty array = all types
  componentId: "MyPanelIsland",   // must match an island in apps/admin/src/islands/
});
```

The island file `apps/admin/src/islands/MyPanelIsland.tsx` must exist and export a default React component accepting `{ postId: number }`.

---

## Registering a field group programmatically

```ts
import { registerFieldGroup } from "@astropress/core";

registerFieldGroup({
  id: "book-fields",
  key: "group_book_fields",
  title: "Book Details",
  active: true,
  fields: [
    {
      id: "f1",
      key: "field_isbn",
      name: "isbn",
      label: "ISBN",
      type: "text",
      instructions: "",
      required: false,
      conditionalLogic: false,
      wrapper: { width: "", class: "", id: "" },
    },
  ],
  location: [[{ param: "post_type", operator: "==", value: "book" }]],
  menuOrder: 0,
  position: "normal",
  labelPlacement: "top",
  instructionPlacement: "label",
  hideOnScreen: [],
});
```

---

## Package structure

```
plugins/my-plugin/
├── package.json        # name: "@astropress/plugin-my-plugin"
│                       # exports: { ".": "./src/index.ts" }
│                       # dependencies: { "@astropress/core": "workspace:*" }
├── src/
│   └── index.ts        # default export: definePlugin(...)
└── tsconfig.json
```

`package.json` example:

```json
{
  "name": "@astropress/plugin-my-plugin",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@astropress/core": "workspace:*"
  }
}
```

---

## `PluginConfig` interface

```ts
interface PluginConfig {
  name:         string;
  version:      string;
  description?: string;
  /** Called once at startup to register capabilities */
  register():   void;
}
```

---

## Built-in example: SEO plugin

`plugins/seo/` is the reference implementation:

```ts
// plugins/seo/src/index.ts
import { definePlugin, registerSidebarPanel } from "@astropress/core";

export default definePlugin({
  name: "seo",
  version: "0.1.0",
  description: "SEO meta fields (title, description, focus keyword)",

  register() {
    registerSidebarPanel("seo", {
      id: "seo",
      title: "SEO",
      postTypes: ["post", "page"],
      componentId: "SeoPanel",
    });
  },
});
```

The `SeoPanel` island (`apps/admin/src/islands/SeoPanel.tsx`) reads/writes `wp_postmeta` keys:
- `_yoast_wpseo_title` — SEO title
- `_yoast_wpseo_metadesc` — meta description
- `_yoast_wpseo_focuskw` — focus keyword

These keys are compatible with Yoast SEO for easy migration.

---

## Plugin loader internals

```ts
// packages/core/src/plugins/loader.ts
const loaded = new Map<string, RegisteredPlugin>();

export function loadPlugin(config: PluginConfig): void {
  if (loaded.has(config.name)) return;
  config.register();
  loaded.set(config.name, { config, loaded: true });
}

export function getLoadedPlugins(): RegisteredPlugin[] { ... }
export function isPluginLoaded(name: string): boolean { ... }
```
