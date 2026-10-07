# AstroPress Architecture and Plugin Development Guide

> Architecture documentation and plugin development conventions for developers.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Astro 4 SSR |
| Database | Drizzle ORM + SQLite (local) / D1 (Cloudflare) |
| Storage | Local filesystem / R2 object storage |
| Authentication | Lucia Auth (Session Cookie) |
| AI | Workers AI / OpenAI-compatible endpoint |
| Deployment | Cloudflare Workers / Node.js self-hosted |

---

## 2. Directory Structure

```
astropress/
├── apps/
│   ├── admin/           # Admin panel + public frontend (single-app architecture)
│   │   ├── src/
│   │   │   ├── pages/   # Route pages
│   │   │   ├── middleware.ts  # Global middleware (auth/initialization)
│   │   │   └── plugins.ts     # Plugin assembly point
│   │   └── wrangler.toml      # Cloudflare configuration
│   └── web/             # Pure frontend (optional, dual-copy with admin)
├── packages/
│   ├── core/            # Core logic (database, themes, plugin system)
│   ├── auth/            # Authentication module
│   └── blocks/          # Block editor
├── plugins/             # All plugins (9 suites)
│   ├── permalink/       # Permalinks
│   ├── page-cache/      # Page cache
│   ├── seo-tools/       # SEO tools
│   ├── ai-chat/         # AI writing assistant
│   └── ...
├── wp-themes/           # Theme packs (44)
└── docs/                # Official documentation
```

---

## 3. Core Design Principles

### 3.1 Zero Core Modification

All plugins **must not modify** `apps/` or `packages/` source files; they wire in through three assembly points only:

1. `apps/admin/astro.config.ts` — register plugin integrations
2. `apps/admin/src/plugins.ts` — plugin state management
3. `apps/admin/package.json` — declare plugin dependencies

### 3.2 Middleware Chain Order

```
securityHeaders → rateLimit → maintenanceMode → pageCache → imageLazy → htmlOpt → assetCache → activityLog → revisions → cacheWarmer → pluginManager
```

**Rule**: rate limiting / maintenance mode must run before page-cache, otherwise the cache would bypass rate limiting.

### 3.3 Dual-Runtime Compatibility

The same codebase supports both:
- **Cloudflare Workers** (D1 + R2 + Workers AI)
- **Node.js** (SQLite + local filesystem + OpenAI-compatible endpoint)

Detect the environment via `context.locals.runtime.env`:

```ts
const isCF = !!(locals.runtime?.env?.DB);
```

---

## 4. Plugin Development Conventions

### 4.1 Minimal Plugin Structure

```
plugins/my-plugin/
├── package.json         # Plugin metadata
├── src/
│   ├── index.ts         # Entry (optional)
│   ├── middleware.ts    # Middleware (optional)
│   ├── routes/          # Public routes (optional)
│   ├── admin/           # Admin pages (optional)
│   │   ├── index.astro  # Admin page
│   │   └── api/         # Admin API
│   └── lib/             # Utility functions
└── README.md            # Plugin documentation
```

### 4.2 package.json Example

```json
{
  "name": "@astropress/plugin-my-plugin",
  "version": "1.0.0",
  "astropress": {
    "id": "my-plugin",
    "name": "My Plugin",
    "description": "Plugin description",
    "category": "tools",
    "icon": "🔧",
    "suite": "tools-suite"
  }
}
```

### 4.3 Middleware Example

```ts
// plugins/my-plugin/src/middleware.ts
import type { MiddlewareHandler } from "astro";

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = new URL(ctx.request.url);

  // Only handle specific paths
  if (!pathname.startsWith("/my-plugin")) {
    return next();
  }

  // Read the database
  const db = ctx.locals.db;

  // Inject response headers
  const response = await next();
  response.headers.set("X-My-Plugin", "active");
  return response;
};
```

### 4.4 Admin Page Example

```astro
---
// plugins/my-plugin/src/admin/index.astro
import AdminLayout from "@astropress/admin/layouts/AdminLayout.astro";
---

<AdminLayout title="My Plugin">
  <div class="card">
    <h2>Plugin Settings</h2>
    <form id="settings-form">
      <label>
        <input type="checkbox" name="enabled" />
        Enable feature
      </label>
      <button type="submit">Save</button>
    </form>
  </div>

  <style is:global>
    /* Styles for dynamically created elements must use is:global */
    .card { padding: 24px; background: white; border-radius: 8px; }
  </style>

  <script>
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/admin-ext/my-plugin/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      if (res.ok) alert('Saved');
    });
  </script>
</AdminLayout>
```

### 4.5 Public API Route Example

```ts
// plugins/my-plugin/src/routes/public-endpoint.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;

  // Query data
  const rows = await db.all("SELECT * FROM wp_posts LIMIT 10");

  return new Response(JSON.stringify({ ok: true, data: rows }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

---

## 5. Plugin State Management

### 5.1 Enable/Disable

Plugin state is stored in the `wp_options` table (`astropress_plugin_states`), in this format:

```json
{
  "my-plugin": true,
  "other-plugin": false
}
```

### 5.2 Cascading Enable/Disable

When a suite plugin (e.g., `cache-suite`) is enabled, its member plugins (`page-cache`, `image-lazy`, etc.) are enabled automatically.

### 5.3 Platform Capability Masking

Some plugins are unavailable on Cloudflare (e.g., file-manager depends on the local filesystem). Declare via `astropress.capabilities`:

```json
{
  "astropress": {
    "capabilities": {
      "cloudflare": false,
      "nodejs": true
    }
  }
}
```

---

## 6. Database Operations

### 6.1 Using Drizzle ORM

```ts
import { wpPosts } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

// Query
const posts = await db.select().from(wpPosts).where(eq(wpPosts.postStatus, "publish"));

// Insert
await db.insert(wpPosts).values({ postTitle: "Title", postContent: "Content" });

// Update
await db.update(wpPosts).set({ postTitle: "New title" }).where(eq(wpPosts.id, 1));
```

### 6.2 Raw SQL (Cross-Driver)

D1 and SQLite drivers behave differently (D1's `db.run()` returns no rows); use `packages/core/src/db/raw.ts`:

```ts
import { rawAll, rawGet } from "@astropress/core/db/raw";

const rows = await rawAll(db, "SELECT * FROM wp_posts WHERE id = ?", [1]);
const row = await rawGet(db, "SELECT * FROM wp_posts WHERE id = ?", [1]);
```

---

## 7. Security Conventions

### 7.1 Input Validation

All user input must be validated:

```ts
// Path parameters
if (!/^[a-z0-9-]+$/.test(slug)) {
  return new Response("Invalid identifier", { status: 400 });
}

// JSON body
let body;
try {
  body = await request.json();
} catch {
  return new Response("Malformed request", { status: 400 });
}
```

### 7.2 CSRF Protection

All write operations (POST/PUT/DELETE) must validate the Origin:

```ts
import { sameOrigin } from "@astropress/core/http";

if (!sameOrigin(request)) {
  return new Response("Cross-site request rejected", { status: 403 });
}
```

### 7.3 Path Traversal Protection

```ts
import { resolvePath } from "@astropress/core/paths";

const safePath = resolvePath(userInput);
if (!safePath) {
  return new Response("Illegal path", { status: 400 });
}
```

---

## 8. Performance Optimization

### 8.1 Settings Cache

Plugin settings are read with a 15-second cache + inflight merging:

```ts
import { loadPluginSettings } from "@astropress/core/plugin-settings";

const settings = await loadPluginSettings(db, "my-plugin");
```

### 8.2 Page Cache

Configure rules in the `page-cache` plugin, or mark in code:

```ts
response.headers.set("X-Cache-Control", "max-age=3600");
```

---

## 9. Testing Conventions

### 9.1 Writing Test Scripts

Create test scripts (Python) in the `logs/` directory:

```python
# logs/my_plugin_test.py
import urllib.request, json

BASE = "https://astropress-v2.nqc715560.workers.dev"

def test_endpoint():
    req = urllib.request.Request(f"{BASE}/my-plugin/endpoint")
    with urllib.request.urlopen(req) as r:
        assert r.status == 200
        print("[PASS] endpoint")

if __name__ == "__main__":
    test_endpoint()
```

### 9.2 Running Regression Tests

```bash
D:\DevTools\Python\python.exe logs/my_plugin_test.py
```

---

## 10. Release Process

### 10.1 Local Testing

```bash
pnpm dev          # Start the dev server
pnpm build        # Build
pnpm typecheck    # Type check
```

### 10.2 Deployment

```bash
cd apps/admin
npx wrangler deploy
```

### 10.3 Updating Documentation

- New features: update `CHANGELOG.md` + `docs/USER-GUIDE.md`
- Bug fixes: update `CHANGELOG.md`
- Architecture changes: update `docs/ARCHITECTURE.md`

---

## 11. Best Practices

1. **Avoid global state**: pass request-level state via `context.locals`
2. **Error handling**: wrap all async operations in try/catch
3. **Type safety**: avoid `any`; use TypeScript strict mode
4. **Logging**: record critical operations to `activity-log`
5. **Performance first**: avoid N+1 queries; use batch queries
6. **Backward compatibility**: new versions must be compatible with old data formats

---

## 12. Reference Implementations

Reference existing plugins:
- **Simple plugin**: `plugins/related-posts`
- **Middleware plugin**: `plugins/page-cache`
- **Full-featured plugin**: `plugins/comments`
- **Suite plugin**: `plugins/perf-suite`
