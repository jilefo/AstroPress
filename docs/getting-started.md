# Getting Started

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| pnpm | 9+ |

## 1. Clone and install

```bash
git clone https://github.com/jilefo/AstroPress
cd astropress
pnpm install
```

## 2. Set up the local database

```bash
pnpm db:setup    # creates local.db and runs all migrations
pnpm db:seed     # optional: seeds demo posts, pages, and options
```

The database file is `./local.db` at the monorepo root. Both apps read it via `DATABASE_URL=file:./local.db`.

## 3. Start dev servers

```bash
pnpm dev
```

This starts both apps in parallel via Turborepo:

| App | URL | Role |
|-----|-----|------|
| Admin | http://localhost:4321 | CMS dashboard |
| Public site | http://localhost:4322 | Front-end |

## 4. First-time setup wizard

Visit http://localhost:4321 — you'll be redirected to the **setup wizard**.

Fill in:
- Site title and URL
- Admin username, email, and password

After submitting, the wizard stores `astropress_setup_complete=1` in `wp_options` and you will not see it again.

## 5. Log in

You'll be redirected to `/login`. Use the credentials from the setup wizard.

---

## Project structure at a glance

```
astropress/
├── apps/
│   ├── admin/   # CMS dashboard (port 4321)
│   └── web/     # Public site (port 4322)
├── packages/
│   ├── core/    # Schema, registry, query helpers
│   ├── auth/    # Session auth (Lucia v3)
│   ├── api/     # Hono router foundation
│   └── ui/      # Shared React components
├── plugins/     # First-party plugins
├── themes/      # Front-end themes
└── docs/        # You are here
```

See [architecture.md](./architecture.md) for a deep dive.

---

## Common dev tasks

### Restart just the admin

```bash
lsof -ti :4321 | xargs kill -9
cd apps/admin && pnpm dev
```

### Restart just the web app

```bash
lsof -ti :4322 | xargs kill -9
cd apps/web && pnpm dev
```

### Type-check everything

```bash
pnpm typecheck
```

### Re-run migrations after schema changes

```bash
cd packages/core && pnpm db:generate   # generate migration file
pnpm db:setup                          # apply to local.db
```

---

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Both apps | SQLite path, default `file:./local.db` |
| `AUTH_SECRET` | Admin | 32+ char string for session signing |
| `SITE_URL` | Admin | Full public URL of the web app |
| `R2_BUCKET` | Admin | Cloudflare R2 bucket name (production) |

In local dev these are auto-configured. For production see [deployment.md](./deployment.md).
