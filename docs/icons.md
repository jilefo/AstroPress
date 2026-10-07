# Icon Pack

All admin UI icons come from a single shared file: `apps/admin/src/lib/icons.ts`.

Icons are flat inline SVGs — 24×24 viewBox, `stroke="currentColor"`, stroke-width 1.75, round line caps and joins (`currentColor` means they inherit the text color of their parent element).

---

## Usage

### In Astro templates

```astro
---
import { adminIcons, getIcon } from "../lib/icons";
---

<!-- By name directly -->
<Fragment set:html={adminIcons.dashboard} />

<!-- With fallback for user-supplied names -->
<Fragment set:html={getIcon(postType.config.icon ?? "folder")} />
```

### Icon picker (for post type editor)

```astro
---
import { adminIcons, ICON_NAMES } from "../lib/icons";
---
{ICON_NAMES.map(name => (
  <label title={name}>
    <input type="radio" name="icon" value={name} />
    <span class="icon-opt">
      <Fragment set:html={adminIcons[name]} />
    </span>
  </label>
))}
```

### In React islands

React islands can't use `<Fragment set:html>`. Render SVGs via `dangerouslySetInnerHTML` or fetch the icon name and let the Astro layer render it.

---

## API

```ts
import { adminIcons, getIcon, ICON_NAMES } from "@astropress/admin/lib/icons";
// or in admin pages:
import { adminIcons, getIcon, ICON_NAMES } from "../lib/icons";

adminIcons          // Record<string, string> — name → SVG string
getIcon(name)       // string — returns adminIcons[name] ?? adminIcons.folder
ICON_NAMES          // string[] — all icon names
```

---

## Icon reference

### Navigation / system

| Name | Used for |
|------|---------|
| `dashboard` | Dashboard link |
| `settings` | Settings page |
| `user` | User display in topbar + sidebar footer |
| `bolt` | Brand mark in sidebar header |
| `logout` | Logout button |
| `menus` | Menus sidebar link |
| `plugins` | Plugins sidebar link |

### Content

| Name | Used for |
|------|---------|
| `post` | Posts sidebar link, default post type icon |
| `page` | Pages sidebar link, default page icon |
| `folder` | Default CPT icon, folder-type CPTs |
| `forms` | Forms sidebar link |
| `media` | Media library |

### Structure

| Name | Used for |
|------|---------|
| `fields` | Custom Fields sidebar link |
| `posttypes` | Post Types sidebar link |
| `taxonomies` | Taxonomies sidebar link |

### Post type picker — document/text

| Name | Description |
|------|-------------|
| `post` | Document with content lines |
| `page` | Document with folded corner |
| `file` | Generic file |
| `book` | Open book |
| `archive` | Archived box |
| `code` | Code brackets `<>` |

### Post type picker — media

| Name | Description |
|------|-------------|
| `image` | Picture frame |
| `video` | Video camera |
| `film` | Film strip |
| `music` | Music note |
| `mic` | Microphone |
| `camera` | Camera |

### Post type picker — places/time

| Name | Description |
|------|-------------|
| `home` | House |
| `map` | Map pin |
| `globe` | Globe/world |
| `calendar` | Calendar grid |
| `clock` | Clock face |

### Post type picker — communication

| Name | Description |
|------|-------------|
| `mail` | Envelope |
| `message` | Speech bubble |
| `rss` | RSS signal |
| `radio` | Radio signal waves |

### Post type picker — data/tech

| Name | Description |
|------|-------------|
| `database` | Database cylinders |
| `cpu` | Processor chip |
| `chart` | Bar chart |
| `grid` | 4-cell grid |
| `list` | List rows |
| `activity` | Activity/heartbeat line |
| `link` | Chain link |

### Post type picker — commerce/people

| Name | Description |
|------|-------------|
| `bag` | Shopping bag |
| `briefcase` | Briefcase |
| `truck` | Delivery truck |
| `users` | Multiple people |
| `award` | Medal/award ribbon |
| `percent` | Percent sign |

### Post type picker — engagement

| Name | Description |
|------|-------------|
| `star` | Star |
| `heart` | Heart |
| `bookmark` | Bookmark ribbon |
| `tag` | Price tag |
| `eye` | Visibility eye |

### Utility icons (available but not in picker by default)

| Name | Description |
|------|-------------|
| `info` | Info circle |
| `help` | Question mark circle |
| `search` | Magnifying glass |
| `edit` | Pencil edit |
| `trash` | Trash bin |
| `plus` | Plus sign |
| `shield` | Shield |
| `zap` | Lightning bolt |
| `layers` | Stacked layers |
| `package` | 3D box/package |
| `feather` | Feather/pen |

---

## Adding new icons

Add your SVG to `apps/admin/src/lib/icons.ts` in the `adminIcons` object:

```ts
export const adminIcons: Record<string, string> = {
  // ... existing icons ...

  myIcon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.75"
    stroke-linecap="round" stroke-linejoin="round">
    <!-- your paths -->
  </svg>`,
};
```

Recommended icon sources (all MIT-licensed): [Lucide](https://lucide.dev), [Feather](https://feathericons.com).

Keep to the same style: 24×24 viewBox, stroke-based, no fills, currentColor.
