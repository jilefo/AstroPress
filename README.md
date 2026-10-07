# AstroPress

A fully open-source, WordPress-compatible CMS built on Astro — admin and public frontend in a single deployment.

No PHP. No legacy baggage. TypeScript, Astro 4 SSR, Drizzle ORM, and your choice of hosting.

> **English docs**: [docs/DEPLOY.en.md](docs/DEPLOY.en.md) · [docs/USER-GUIDE.en.md](docs/USER-GUIDE.en.md)

AstroPress is a modern, WordPress-compatible CMS that runs on the edge with zero PHP. It uses the familiar `wp_*` database schema and plugin system, re-implemented in TypeScript with Astro 4 SSR. Deploy natively to Cloudflare Workers with D1, R2, and Workers AI, or self-host on Node.js with SQLite. All documentation is available in both Chinese and English.

---

## Deploy

| Platform | One-click |
|----------|-----------|
| Cloudflare Pages | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jilefo/AstroPress) |
| Railway | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/astropress) |
| Render | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/jilefo/AstroPress) |
| Docker | `docker compose up` — see [Docker](#docker) below |

> 中文部署文档：[docs/DEPLOY.md](docs/DEPLOY.md)（Cloudflare 15 分钟上线）· [docs/DEPLOY-NODE.md](docs/DEPLOY-NODE.md)（Node.js 自托管）· [docs/USER-GUIDE.md](docs/USER-GUIDE.md)（站长操作手册）· [docs/FAQ.md](docs/FAQ.md)（常见问题）· [docs/DEPLOYER-ADVICE.md](docs/DEPLOYER-ADVICE.md)（部署者建议）· [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（架构与插件开发）

---

## What it is

AstroPress is a modern CMS that speaks WordPress — same `wp_*` database schema, same mental model — but runs on the edge with zero PHP. Developers get the extensibility of WordPress; users get a fast, cheap, globally-distributed site.


**Key features:**
- WordPress-compatible `wp_*` schema (Drizzle ORM + SQLite/D1)
- Visual block-based page and theme editor (full-screen ThemeEditor)
- Gutenberg block editor for posts and classic content
- Custom post types, taxonomies, custom fields (ACF-style) — all managed via UI
- WPForms-style form builder with entries, conditional logic, multi-page
- Navigation menus with drag-and-drop reorder and submenu nesting
- Plugin system — 52 bundled plugins; drop a package in `/plugins`, register in `apps/admin/src/plugins.ts`
- 10 hand-ported Hexo/Hugo themes (Stack, Butterfly, Fluid, Icarus, Keep, MengD, NexT, Redefine, Volantis, Ayer) fully compatible with every injection plugin — theme slot sync switches header/footer automatically on activation
- Single installation — admin (`/admin/*`) and public frontend (`/*`) in one app
- Cloudflare-native: D1 database + R2 object storage + Pages hosting
- Session-based auth (Lucia v3)

---

## Architecture

AstroPress runs as a **single Astro SSR app** that serves both the admin dashboard and the public-facing website:

```
/              → public homepage (blog list or static front page)
/blog/[slug]   → blog post
/[slug]        → page (supports visual block editor)
/forms/[id]    → standalone form page
/admin/*       → CMS dashboard (auth required)
/api/*         → REST API (most endpoints require auth)
```

Everything shares one database. No separate frontend deployment needed.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### 1. Install dependencies

```bash
git clone https://github.com/jilefo/AstroPress
cd astropress
pnpm install
```

### 2. Set up the local database

```bash
pnpm db:setup        # runs migrations against local.db
pnpm db:seed         # optional: seeds demo content
```

### 3. Start dev server

```bash
pnpm dev
```

| URL | Description |
|-----|-------------|
| http://localhost:4321 | Admin + public site |
| http://localhost:4321/admin | CMS dashboard |

Visit http://localhost:4321 — the **setup wizard** runs on first boot to create your admin account.

---

## Deploy to Cloudflare Pages

### One-click deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jilefo/AstroPress)

**No CLI or terminal needed.** After clicking the button, follow the steps below.

---

### Step-by-step setup

#### 1. Connect your repo

1. Click the deploy button above
2. Authorize GitHub and Cloudflare when prompted
3. Cloudflare forks the repo and creates a Pages project

#### 2. Configure build settings

In the Pages project → **Settings → Build & Deployments**:

| Setting | Value |
|---|---|
| Root directory | `apps/admin` |
| Build command | `ASTRO_ADAPTER=cloudflare pnpm build` |
| Build output directory | `dist` |
| Deploy command | *(leave empty)* |

#### 3. Add bindings

Go to **Settings → Functions** and add the following bindings. Create each resource in Cloudflare first if it doesn't exist yet.

**D1 Database** (required — stores all CMS content)

| Field | Value |
|---|---|
| Variable name | `DB` |
| D1 database | Create a new database named `astropress` |

**R2 Bucket** (required for media uploads)

| Field | Value |
|---|---|
| Variable name | `R2` |
| R2 bucket | Create a new bucket named `astropress-media` |

**Workers AI** (optional — enables built-in AI with no external API key)

| Field | Value |
|---|---|
| Variable name | `AI` |
| Binding type | AI |

> If you skip the AI binding, you can still use any external provider (Anthropic, OpenAI, Gemini, Mistral, Groq) by adding an API key in **Admin → Settings → AI**.

#### 4. Deploy

Save settings and trigger a new deployment. On first visit, AstroPress automatically creates all database tables and redirects you to the setup wizard to create your admin account.

---

### Enable Cloudflare Workers AI in the admin

Once the `AI` binding is added:

1. Go to **Admin → Settings → AI**
2. Select **Cloudflare Workers AI (no API key needed)**
3. Choose a model:
   - **Llama 3.1 8B** — fast, great for most tasks
   - **Llama 3.3 70B** — smarter, slower
   - **Mistral 7B** — good alternative
4. Click **Save Settings**

The AI assistant, block generator, and chat widget will all use your Workers AI binding at no extra per-token cost beyond your Cloudflare plan.

---

### Manual CLI deploy

```bash
cd apps/admin
npx wrangler d1 create astropress
npx wrangler r2 bucket create astropress-media
npx wrangler pages project create astropress

# Build and deploy
ASTRO_ADAPTER=cloudflare pnpm build
npx wrangler pages deploy dist
```

Add D1, R2, and AI bindings in the Cloudflare dashboard after the project is created (CLI does not set bindings for Pages projects).

### One-command deploy script (中文)

仓库根目录提供 `部署AstroPress到Cloudflare.py`：自动完成前置检查（node/pnpm/wrangler 登录态）→ 绑定校验（D1 database_id 占位符检测）→ 依赖安装 → `build:cf` → 按序应用 `packages/core/migrations/*.sql` 到远程 D1 → `wrangler deploy`。支持 `--skip-install` / `--only-migrate`。

> D1（`DB`）、R2（`R2`）、Workers AI（`AI`）三个绑定均在 [apps/admin/wrangler.toml](apps/admin/wrangler.toml) 中声明，`wrangler deploy` 自动携带，**无需手工在控制台添加**（仅 Pages 项目仍需在控制台手动绑定）。

```bash
python 部署AstroPress到Cloudflare.py
```

**双运行时兼容**：`@astropress/core` 内置 `isCloudflareRuntime()` / `hasFileSystem()` 检测；依赖本地文件系统或子进程的插件（file-manager / backup / static-html / ai-chat / git-sync / webdav）在 Workers 环境自动优雅降级为 `501 ENV_NOT_SUPPORTED` 中文提示，Node.js 部署功能完整保留。媒体上传走 R2 优先 + 本地 fs 兜底，天然双模。

---

## Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/astropress)

Or manually:

1. Push the repo to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Set environment variables in the Railway dashboard:
   - `DATABASE_URL` — e.g. `file:./data/astropress.db` (Railway persistent volume) or a PostgreSQL URL
   - `AUTH_SECRET` — a random 32+ character string

Railway auto-detects `railway.toml` and builds with Docker.

---

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/jilefo/AstroPress)

Render reads `render.yaml` automatically. Set `DATABASE_URL` in the Render dashboard after the first deploy. A 1 GB persistent disk is attached at `/app/data` for the SQLite database.

---

## Docker

### Quick start

```bash
cp .env.example .env     # edit AUTH_SECRET
docker compose up
```

Open http://localhost:4321 — database tables are created automatically on first boot, then the setup wizard runs to create your admin account.

### Build image manually

```bash
docker build -t astropress .
docker run -p 4321:4321 \
  -e DATABASE_URL=file:./data/astropress.db \
  -e AUTH_SECRET=your-secret-here \
  -v $(pwd)/data:/app/data \
  astropress
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite: `file:./data/astropress.db` · PostgreSQL: `postgres://...` |
| `AUTH_SECRET` | 32+ char string for session signing |
| `AP_AV_MAX_MB` | Max audio/video upload size in MB for the media-av plugin (default `100`) |
| `AP_TRUST_PROXY` | Set to `1` only behind a trusted reverse proxy that rewrites `X-Forwarded-For`; makes comment rate limiting count clients by the forwarded IP. Unset by default — the socket address is used and spoofed XFF headers are ignored. |

On **Cloudflare Pages**, the D1 database is bound automatically via `wrangler.toml` — no `DATABASE_URL` needed.

> **AI assistant login sessions** — the ai-chat plugin keeps per-provider logins in
> `.ap-data/ai-profiles/<provider>/` using a persistent headless Chromium (Playwright).
> Logins survive restarts; idle sessions release browser memory after 30 minutes. Run
> `pnpm playwright install chromium` if the browser binary is missing.

---

## Monorepo Structure

```
astropress/
├── apps/
│   └── admin/              # Single Astro SSR app (admin + public frontend)
│       └── src/
│           ├── components/ # BlockRenderer.astro
│           ├── islands/    # React islands (BlockEditor, FormBuilder, ThemeEditor …)
│           ├── layouts/    # AdminLayout.astro, BaseLayout.astro
│           ├── lib/        # icons.ts, posts.ts, public-query.ts, formRenderer.ts …
│           ├── middleware.ts
│           ├── pages/
│           │   ├── index.astro          # public homepage
│           │   ├── [slug].astro         # public pages
│           │   ├── blog/[slug].astro    # blog posts
│           │   ├── forms/[id].astro     # standalone form page
│           │   ├── admin/               # CMS dashboard pages
│           │   └── api/                 # REST endpoints
│           └── plugins.ts
├── packages/
│   ├── core/               # Drizzle schema, registry, query helpers, types
│   ├── auth/               # Lucia v3 session auth
│   ├── api/                # Hono router foundation
│   └── ui/                 # Shared React components
├── plugins/                # Loaded in apps/admin/src/plugins.ts
│   ├── seo/                # First-party SEO plugin (upstream)
│   ├── ads-manager/        # Ad slots/units as a CPT, tracking, GDPR gating
│   ├── editor-upload/      # Hardened editor uploads (sniffing, SVG sanitizer)
│   ├── editor-tools/       # Editor toolbar: one-click auto-format + zh↔en translation (site AI)
│   ├── multilingual/       # Translation groups, /{lang}/ URLs, hreflang, sitemap
│   ├── image-mirror/       # Sideloads remote <img> into the media library on save
│   ├── admin-i18n/         # Admin UI zh-CN translation (built-in dict + n8n webhook fallback)
│   ├── ai-chat/            # AI assistant: embedded in-page login (QR/phone/password) + persistent browser sessions (DeepSeek/元宝/通义千问/豆包/智谱, no API key)
│   ├── ai-autofill/        # AI auto-fill of Excerpt/Tags/SEO on publish + AI writing assistant (topic → title & content)
│   ├── webhook-publisher/  # REST webhook publishing (API-key auth, /ap-webhook/*)
│   ├── related-posts/      # Related / random / popular posts sections on article pages (SEO + PV)
│   ├── seo-tools/          # RSS feed (/rss.xml) + robots.txt management
│   ├── search/             # Full-site search page (/search) + floating search button
│   ├── redirect/           # 301/302 redirect manager (wildcard, hit counts, loop guard)
│   ├── comments/           # Threaded comments: public form injected into articles + moderation/reply/spam
│   ├── gitalk-comment/     # GitHub-Issue-based comments (Gitalk CDN, OAuth app config, secret masking)
│   ├── link-directory/     # Website directory: public /directory page + click tracking + categories
│   ├── media-av/           # Audio/video uploads for the editor (magic-byte sniffing, /api/ap-media-av/)
│   ├── wp-editor/          # WordPress-style editor toolbar (blocks, alignment, links, focus mode, word count)
│   ├── db-console/         # Adminer-inspired SQLite console (browse/structure/exec/export, write-confirm gate)
│   ├── config-io/          # Import/export site configuration as JSON (secrets stripped)
│   ├── backup/             # One-click backups: logical SQL dump + DB + media as .apzip in /backups
│   ├── file-manager/       # Windows-Explorer-style site file manager (zip/unzip/download/delete, guarded paths)
│   ├── webdav/             # WebDAV server for /webdav-storage (Basic auth + token, PROPFIND/PUT/GET/DELETE/MKCOL)
│   ├── gist-sync/          # Sync site config to GitHub Gist (push/pull, history, secrets stripped)
│   ├── git-sync/           # Push site data + full source tree to GitHub/Gitee/Gitea hosts via Contents REST API (no git CLI)
│   ├── permalink/          # Pretty permalinks: posts reachable at /{slug} without the /blog/ prefix (internal rewrite)
│   ├── sitemap/            # XML sitemap (/sitemap.xml): lastmod/changefreq/priority + multilingual hreflang alternates
│   ├── share/              # Social share buttons on articles (WeChat/Weibo/QQ/Twitter/Facebook/LinkedIn/Telegram/WhatsApp/copy)
│   ├── customer-service/   # Floating contact widget (QQ/WeChat/Telegram/email/phone/working-hours) on all public pages
│   ├── footer/             # Site footer settings: copyright, ICP & police beian links, custom links/HTML, Powered-by toggle
│   ├── donation/           # Article donation button + WeChat/Alipay/Apple Pay/Google Pay QR + PayPal/Afdian link modal
│   ├── static-html/        # Static site exporter: scheduled (hourly/daily/weekly) full-HTML export + auto sitemap.xml/rss.xml
│   ├── page-cache/         # Anonymous full-page HTML cache (in-memory LRU, TTL, auto-purge on writes, HIT/MISS stats)
│   ├── image-lazy/         # Auto loading="lazy" decoding="async" for <img>/<iframe> (first-N LCP skip, no-lazy opt-out)
│   ├── html-opt/           # HTML minify (comments/whitespace, protects script/style/pre/textarea) + dns-prefetch/preconnect hints
│   ├── db-optimize/        # SQLite maintenance: size/table stats, autoload size, revisions, ANALYZE/PRAGMA optimize/VACUUM/purge revisions
│   ├── error-monitor/      # 404 logger (path/referer/hits/timeline, dedupe window, ignore rules, /admin-ext/404-monitor)
│   ├── security-headers/   # Security headers: nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, CSP (Report-Only)
│   ├── asset-cache/        # Static-asset Cache-Control headers (/_astro immutable 1y, /media 7d, per-ext rules)
│   ├── rate-limit/         # Global IP token-bucket rate limiting (429 + Retry-After, backstop defaults above plugin limiters)
│   ├── maintenance-mode/   # Maintenance mode: anonymous 503 + Retry-After page, admin/API/IP-whitelist bypass
│   ├── activity-log/       # Admin write-operation audit log (no request body/query stored, 50k-row lazy trim)
│   ├── revisions/          # Post revision history: pre-write snapshots (keep 20/post), view & one-click restore
│   ├── cache-warmer/       # Cache warmer: homepage + sitemap <loc> URLs, serial fetch, manual/scheduled (0/1/6/24h)
│   ├── plugin-manager/     # Plugin manager: enable/disable/purge with admin & frontend teardown
│   ├── user-roles/         # WP role capability enforcement: 5 roles × 7 capabilities middleware (P0 security)
│   ├── dashboard-widgets/  # Dashboard enhancement: content stats, recent posts, drafts, system health widgets
│   ├── notification-center/ # In-app notifications: bell icon, unread badge, auto-create on comments/forms
│   ├── media-folders/      # Media library folder management: tree CRUD, batch move, wp_postmeta association
│   └── two-factor-auth/    # TOTP two-factor authentication (RFC 6238, zero deps, QR setup, session guard)
├── themes/
│   └── default/            # Default front-end theme styles
├── wp-themes/              # 44 theme packages (34 WP ports + 10 Hexo/Hugo ports: Stack, Butterfly, Fluid, Icarus, Keep, MengD, NexT, Redefine, Volantis, Ayer)
├── scripts/                # Audit & verification tools (audit-plugins.py, verify-themes.py, check-theme-collision.py, smoke-round*.py)
├── .ap-data/               # Runtime data (gitignored): persistent AI login profiles per provider
├── backups/                # Backup plugin output (gitignored, .apzip archives)
├── webdav-storage/         # WebDAV plugin storage root (gitignored; mount via /webdav/)
├── PLAN.md                 # Plugin ecosystem gap analysis & roadmap (performance/security/ops)
├── CHANGELOG.md
├── Dockerfile
├── docker-compose.yml
├── railway.toml
├── render.yaml
└── wrangler.toml
```

---

## Data Layer — Query Helpers

Import from `@astropress/core/query` in any Astro page:

```astro
---
import { queryPosts, getField, getPostTerms, getSiteInfo } from "@astropress/core/query";

const db = Astro.locals.db;

// Like WP_Query
const { posts, total, pages } = await queryPosts(db, {
  type: "book",
  perPage: 12,
  orderBy: "title",
  order: "asc",
});

// Like ACF get_field / get_post_meta
const price = await getField(db, post.id, "price");

// Like get_the_terms
const categories = await getPostTerms(db, post.id, "category");

// Like get_bloginfo
const site = await getSiteInfo(db);
---
```

| Function | WP equivalent |
|---|---|
| `queryPosts(db, args)` | `WP_Query` |
| `getPost(db, idOrSlug, type?)` | `get_post()` |
| `getPostById(db, id)` | `get_post()` |
| `getPostBySlug(db, slug, type?)` | `get_page_by_path()` |
| `getField(db, postId, key)` | ACF `get_field()` |
| `getFields(db, postId)` | all meta as `Record<string,string>` |
| `getTerms(db, taxonomy, args?)` | `get_terms()` |
| `getPostTerms(db, postId, taxonomy)` | `get_the_terms()` |
| `getOption(db, name, fallback?)` | `get_option()` |
| `getSiteInfo(db)` | `get_bloginfo()` |

---

## Plugin System

1. Create a package in `/plugins/my-plugin/`
2. Export a plugin config:

```ts
// plugins/my-plugin/src/index.ts
import { definePlugin, registerPostType } from "@astropress/core";

export default definePlugin({
  name: "My Plugin",
  version: "1.0.0",
  register() {
    registerPostType("product", {
      label: "Product",
      pluralLabel: "Products",
      icon: "bag",
      public: true,
      showInMenu: true,
      supports: ["title", "editor", "thumbnail", "custom-fields"],
    });
  },
});
```

3. Load it in `apps/admin/src/plugins.ts`:

```ts
import myPlugin from "@astropress/my-plugin";
loadPlugin(myPlugin);
```

### Plugin Suites — 10 merged bundles

All 50 feature plugins are also bundled into 10 zero-modification suites (member plugins keep their own implementations; each suite only aggregates their Astro integrations). Registration order is constraint-aware: `security-suite` first → `media-suite` → `perf-suite` → … → `plugin-manager` last. The Plugin Manager (`/admin-ext/plugin-manager`) renders suite cards with clickable member chips and cascading enable/disable (one toggle writes all member states).

| Suite | Members |
|---|---|
| `security-suite` | rate-limit, maintenance-mode, two-factor-auth, user-roles, activity-log |
| `media-suite` | media-folders, security-headers |
| `perf-suite` | page-cache, image-lazy, html-opt, asset-cache, sitemap, static-html, error-monitor, cache-warmer |
| `editor-suite` | editor-upload, editor-tools, image-mirror, media-av, wp-editor |
| `ai-suite` | multilingual (web+admin), admin-i18n, ai-chat, ai-autofill |
| `seo-suite` | related-posts, seo-tools, search, redirect, permalink, revisions |
| `site-suite` | ads-manager (web+admin), comments, share, customer-service, footer, donation, gitalk-comment |
| `sync-suite` | backup, config-io, gist-sync, git-sync |
| `ops-suite` | webhook-publisher, db-console, link-directory, file-manager, webdav, db-optimize |
| `admin-suite` | dashboard-widgets, notification-center, theme-slot-sync |

---

## Quality Assurance

All bundled plugins are covered by automated black-box suites (run against a local dev server; test data uses timestamped identifiers and self-cleans via each plugin's own API):

| Suite | What it covers |
|---|---|
| `logs/aa8_t1_pages.py` … `logs/aa8_t12_wpthemes.py` | **AA8-round — 358/358 PASS:** 12 black-box domains covering all 10 suites' 50 members — 61 pages, security headers/rate-limit/maintenance/2FA/audit, cache MISS→HIT + lazy-loading + HTML-opt + sitemap/robots/RSS, editor injection chain + translation validation, real AI write/optimize flows with Markdown output + 20-language multilingual presets, full redirect CRUD + hit verification, settings round-trips + frontend injection markers for all site/sync/ops plugins, notification center, and a real plugin-manager disable→injection-stripped→restore guard. Theme×plugin matrix: all 11 installed themes × 10 plugin markers; 44 wp-themes packages structurally valid + one real import→activate→render→delete cycle; 10 hexothemes/hugo source dirs verified. Verdict: `logs/插件真实测试报告-20261005224337.md` |
| `logs/test_plugins_full.py` | **O-round — 116/116 PASS × 3 consecutive rounds (7 rounds total):** all 9 suites' admin pages/APIs/public endpoints, real write flows with self-cleanup, cascade enable/disable, rate-limit/throttle/honeypot security specials, backup auto-backup settings CRUD + input sanitizing; plus a dedicated real-trigger scheduler test (auto backup fired on time, 531 KB `.apzip` generated and cleaned). Verdict report: `logs/插件真实测试报告-20261004051834.md` |
| `logs/test_plugins_full.py` + `logs/test_fixups.py` | **N-round (post-merge) — 123/123 final PASS:** all 9 suites' 52 member plugins (43 admin pages, admin APIs, public endpoints, 7 editor-injected scripts), real write flows (maintenance toggle, redirect CRUD + loop guard, comment submit/approve/reply/delete, backup create/cleanup, file-manager mkdir/write/delete, cascade enable/disable), and security specials (honeypot, comment throttle, global rate-limit 429, CSRF, confirm gates, reserved-prefix rejection, magic-byte rejection, AUTH_SECRET stripping). Results in `logs/plugins_full_results.json`; verdict report in `logs/插件真实测试报告-20261003212107.md` |
| `logs/test_themes_plugins.py` + `logs/test_themes_all.py` | **Theme×plugin adaptation matrix — 45/45 PASS:** all 11 installed themes activated one-by-one (home/post/404/search hook assertions, Butterfly restored afterwards) plus 34 wp-themes packages import-tested (`createPages=false`, orphans cleaned: 204 templates + 204 schemas + 34 css options). Results in `logs/theme_plugin_matrix*.json` |
| `scripts/test-l-round.py` | L-round assertions: 5 new plugins (user-roles / dashboard-widgets / notification-center / media-folders / two-factor-auth) — admin pages, API CRUD, sidebar injection |
| `scripts/test-plugins-full.py` | 217 assertions: every admin API, public endpoint, injected asset and admin page of all plugins + auth wall + public pages |
| `scripts/test-new-plugins.py` | 53 assertions: permalink / sitemap / share / customer-service / footer / donation plugin contracts (merged into the same result file) |
| `scripts/test-b-round.py` | 109 deep assertions: registry/settings-entry fixes, manager disable → zero frontend injection gates, every file-manager operation (mkdir/upload/download/view/edit/rename/copy/move/zip/unzip/delete + traversal/zip-bomb/auth guards + create file), and end-to-end static-html export (settings validation, CSRF/auth, real generation, sitemap/rss, dev-only tag stripping, stale-output cleanup, permalink-aware export) |
| `scripts/test-c8-donation.py` | 9 assertions: donation new payment methods (PayPal/Apple Pay/Google Pay/Afdian) CRUD, image upload via media library, CSRF/auth/anon walls, frontend injection |
| `scripts/test-c-round.py` | 359 assertions (baseline 270 merged as subprocess + 89 new): full file-manager operation matrix, gitalk-comment settings/injection, all 10 Hexo/Hugo ported themes activate-and-render checks, static-html, security spot checks |
| `scripts/plugin-test-result.json` / `plugin-test-result-b.json` / `plugin-test-result-c.json` | Raw assertion data for the latest run (359 assertions, all passing) |
| `scripts/test-plugins-stress.py` | Concurrency/edge stress (atomic counters, rate-limit races, malformed bodies, 100-way mixed traffic) |
| `scripts/test-f-full.py` | **F-round master suite — 257 assertions (257/257 PASS):** every endpoint of all **40 plugins**, all 33 admin pages, core public endpoints (auth, media, forms), injection middleware chains; negative cases for CSRF/auth-wall/confirm/path-traversal(zip-slip + `%2F` media traversal)/rate-limits/protocol sanitizing/login brute-force lockout/request-body caps. Results in `scripts/.f-full-result.json` |
| `scripts/test-f-themes.py` | **10/10 PASS** — home/post/search/404 + 7 injection markers + 3 security headers across all 10 ported themes (`scripts/.f-themes-result.json`) |
| `scripts/verify-sanitize.ts` | 33/33 PASS — whitelist HTML sanitizer regression (`tsx scripts/verify-sanitize.ts`) |
| `scripts/perf-probe.py` / `scripts/stress-plugins.py` | Public hot-path latency probe (avg 3.1–11.5 ms) and 4-way × 15-round × 5-endpoint stress (75/75 OK) |
| `scripts/audit-plugins.py` | Static audit gate (auth/CSRF/confirm guards, injection sinks) — latest result **E:0 W:0 I:14** |
| **K-round deep code audit** | **All 51 plugins (93+ API endpoints + 28 middlewares) + 44 themes manually reviewed — E:0 W:0.** Security (auth/CSRF/confirm/path-traversal/zip-slip/XSS/SQL-injection), performance (shared settings cache/bounded memory/LRU), error handling (fail-open), idempotency (DOM markers), code quality (JSDoc/consistent patterns) all production-ready |
| `scripts/k-round-audit.py` + `k-round-deep.py` + `k-round-verify.py` | **K-round Python automated audit pipeline:** 3 scripts scanning 534+ source files across 20+ dimensions (hardcoded values, z-index, SQL concat, eval, innerHTML, unbounded Maps, timer leaks, ReDoS, idempotency, CDN versions, env fallbacks, error handling, cross-plugin duplication). Initial 224 findings → triple-verified to **4 low-risk observations, 0 critical/high** |
| `scripts/verify-themes.py` / `scripts/check-theme-collision.py` | Theme package verification (FAIL:0 WARN:0) and theme-vs-injected-markup collision scan (CLEAN) |
| `pnpm turbo typecheck --force` | Whole-monorepo type gate — **56/56 packages pass** |

Generated professional reports (Chinese): the current master report is [docs/test-report-full.md](docs/test-report-full.md) — **257 assertions across all 40 plugins + 12 deep-hardening fixes (F-T8-01 ~ F-T8-12, including one critical unauthorized file-read fix), performance baseline and full assertion appendix**; earlier rounds: [docs/plugin-test-report-2026-10-02.md](docs/plugin-test-report-2026-10-02.md) — 10 chapters including the per-plugin results, security matrix, end-to-end business flows, and the second-round deep-hardening log (concurrency stress, response-header injection / open-redirect / rate-limit-bypass probes, zip-bomb caps, hot-path middleware performance); and the follow-up [docs/plugin-test-report-2026-10-02-b-round.md](docs/plugin-test-report-2026-10-02-b-round.md) covering the registry/settings fixes, the static-html exporter, the file-manager editor toolbar and full operation matrix, frontend hot-path performance gating, and 377/377 combined results. The latest [docs/plugin-test-report-2026-10-02-c-round.md](docs/plugin-test-report-2026-10-02-c-round.md) is the full terminal pass (359/359): complete file-manager operation matrix, the Gitalk comment plugin, activate-and-render verification of all 10 Hexo/Hugo ported themes, and security spot checks.

### Hexo/Hugo theme ports

Ten additional theme packages were hand-ported from `hexothemes/` sources into `wp-themes/` (stack, ayer, butterfly, fluid, icarus, keep, mengd, next, redefine, volantis). Each is a standard AstroPress theme package (manifest + theme.css + 6 templates + home page) covering only the fixed front-end DOM hooks, so every injection plugin (comments / gitalk / related-posts / share / donation / ads) works unchanged under all of them. Import them with `python scripts/import-hexo-themes.py`, then activate under **Appearance → Themes**.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/](docs/). Recent changes are recorded in [CHANGELOG.md](CHANGELOG.md); plugin/theme audits in [docs/theme-package-audit.md](docs/theme-package-audit.md).

## License

MIT — see [LICENSE](LICENSE).
