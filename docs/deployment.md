# Deployment

AstroPress deploys to Cloudflare's free tier: **Pages** for hosting, **D1** for the database, and **R2** for media storage.

---

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated
- A Cloudflare account

```bash
npm install -g wrangler
wrangler login
```

---

## Step 1 — Create Cloudflare resources

```bash
# SQLite database
npx wrangler d1 create astropress
# → Note the database_id in the output

# Object storage for media
npx wrangler r2 bucket create astropress-media

# Pages projects (one per app)
npx wrangler pages project create astropress-admin
npx wrangler pages project create astropress-web
```

---

## Step 2 — Configure wrangler.toml files

Update `apps/admin/wrangler.toml`:

```toml
name = "astropress-admin"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "astropress"
database_id = "YOUR_DATABASE_ID"   # ← paste from Step 1

[[r2_buckets]]
binding = "R2"
bucket_name = "astropress-media"

[vars]
SITE_URL = "https://astropress-web.pages.dev"
```

Update `apps/web/wrangler.toml`:

```toml
name = "astropress-web"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "astropress"
database_id = "YOUR_DATABASE_ID"   # ← same database ID
```

---

## Step 3 — Run migrations on the remote database

```bash
cd packages/core
npx wrangler d1 migrations apply astropress --remote
```

---

## Step 4 — Set environment variables

In the Cloudflare Pages dashboard for **astropress-admin**, go to **Settings → Environment variables** and add:

| Variable | Value |
|----------|-------|
| `AUTH_SECRET` | A random 32-character string |
| `SITE_URL` | The full URL of your web Pages project |

Generate a secret:
```bash
openssl rand -base64 32
```

---

## Step 5 — Build and deploy manually (first time)

```bash
pnpm build

# Deploy admin
cd apps/admin
npx wrangler pages deploy dist --project-name astropress-admin

# Deploy web
cd ../web
npx wrangler pages deploy dist --project-name astropress-web
```

---

## Step 6 — Set up CI/CD with GitHub Actions

Add these secrets to your GitHub repository (**Settings → Secrets and variables → Actions**):

| Secret | How to get it |
|--------|--------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, add Pages + D1 + R2 permissions |
| `CF_ACCOUNT_ID` | Cloudflare dashboard → right sidebar |

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install

      - name: Run D1 migrations
        run: cd packages/core && npx wrangler d1 migrations apply astropress --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}

      - name: Build
        run: pnpm build

      - name: Deploy admin
        run: npx wrangler pages deploy apps/admin/dist --project-name astropress-admin
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}

      - name: Deploy web
        run: npx wrangler pages deploy apps/web/dist --project-name astropress-web
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

Push to `main` — the workflow builds, migrates, and deploys both apps automatically.

---

## First boot

Visit your admin Pages URL (e.g. `https://astropress-admin.pages.dev`). The **setup wizard** runs automatically on first visit:

1. Enter your site title and URL
2. Create an admin username, email, and password
3. Submit — the wizard writes to D1 and marks setup as complete

You will not see the wizard again.

---

## Custom domains

In the Cloudflare Pages dashboard for each project:

1. **Custom domains** → **Set up a custom domain**
2. Enter your domain (e.g. `admin.mysite.com`)
3. Follow the DNS instructions

Update `SITE_URL` in the admin environment variables to match the web app's custom domain after setting it.

---

## Environment variables reference

| Variable | App | Required | Description |
|----------|-----|----------|-------------|
| `DATABASE_URL` | Both | Dev only | SQLite file path (`file:./local.db`) |
| `AUTH_SECRET` | Admin | Production | 32+ char session signing key |
| `SITE_URL` | Admin | Production | Full URL of `apps/web` |
| `R2_BUCKET` | Admin | Production | R2 bucket name for media |

In production on Cloudflare, the D1 database is injected automatically via the `DB` binding — no `DATABASE_URL` needed.

---

## Local dev with production D1

To test against the remote D1 database locally:

```bash
cd apps/admin
npx wrangler pages dev dist --d1=DB=YOUR_DATABASE_ID
```

Note: this uses the remote database — changes will be real.
