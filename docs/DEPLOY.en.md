# AstroPress Official Deployment Guide

> **Goal**: Go from zero to production in 15 minutes with a fully functional CMS.
>
> **Dual-instance reference**:
> - **V2 (production instance)** https://astropress-v2.nqc715560.workers.dev (version `442c51b0`)
> - **OLD (legacy instance)** https://astropress.nqc715560.workers.dev (version `a67875e6`)
> - Both are configured with D1, R2, and AI bindings

---

## 1. Prerequisites

### 1.1 Register a Cloudflare Account

Visit [cloudflare.com](https://cloudflare.com) and sign up for a free account (the free plan is sufficient to run this system).

### 1.2 Install Wrangler CLI

```bash
# Method 1: via npm (recommended)
npm install -g wrangler

# Method 2: Windows users may use the portable toolchain (this repo's deploy script auto-detects D:\DevTools)
# See docs/FAQ.md for details on portable toolchain detection after a system reinstall
```

### 1.3 Log in to Cloudflare

```bash
wrangler login
```

> If the browser redirect fails, check that Chrome/Edge is installed. You can also use `wrangler login --no-browser` to copy the link and authorize manually.

---

## 2. One-Click Deployment (Cloudflare Workers)

### 2.1 Clone the Repository

```bash
git clone https://github.com/jilefo/AstroPress.git
cd AstroPress
pnpm install
```

### 2.2 Initialize Resources

```bash
# Create the D1 database (record the returned database_id)
wrangler d1 create astropress

# Create the R2 bucket
wrangler r2 bucket create astropress-media
```

### 2.3 Configure `wrangler.toml`

Edit `apps/admin/wrangler.toml`:

```toml
name = "astropress-v2"              # Worker name (customizable)
main = "./dist/_worker.js/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
binding = "ASSETS"
directory = "./dist"
not_found_handling = "404-page"

[build]
command = "pnpm --filter @astropress/admin run build:cf"

[observability]
enabled = true

[[d1_databases]]
binding = "DB"
database_name = "astropress"        # Must match the D1 name created above
database_id = "<YOUR_DATABASE_ID>"  # Copy from the wrangler d1 create output

[[r2_buckets]]
binding = "R2"
bucket_name = "astropress-media"    # Must match the R2 name created above

# Workers AI — enables the AI writing assistant
[ai]
binding = "AI"
```

> **Note**: The `[ai]` binding is carried automatically at deploy time; no manual setup in the dashboard is required.

### 2.4 Build and Deploy

```bash
cd apps/admin
npx wrangler deploy
```

The build process automatically runs `pnpm run build:cf` (including the Astro build, static asset bundling, UTF-8 encoding guard injection, etc.).

Example output after a successful deploy:

```
Total Upload: 3771.64 KiB / gzip: 744.33 KiB
Worker Startup Time: 29 ms
Your worker has access to the following bindings:
- D1 Databases:
  - DB: astropress (...)
- R2 Buckets:
  - R2: astropress-media
- AI:
  - Name: AI
Current Version ID: ...
```

---

## 3. First Launch and Initialization

### 3.1 Visit the Setup Wizard

Open `https://your-worker.workers.dev/setup` and follow the wizard to create the admin account.

> **Important**: The setup wizard only creates the admin account and basic options; it **does not automatically activate a theme** (this is known behavior — see 3.2 below).

### 3.2 Activate a Theme

1. Log in to the admin panel at `/admin`
2. Go to "Appearance → Themes"
3. Pick a theme (e.g., AIYA-CMS) and click "Activate"

### 3.3 Configure the AI Writing Assistant (Optional but Recommended)

Go to "Settings → AI" and select **Cloudflare AI** (no API Key required; uses the Workers AI binding).

### 3.4 Install Theme Packs (Optional)

To import more themes (44 theme packs are preloaded in the `wp-themes/` directory), use "Appearance → Themes → Import" for batch import.

---

## 4. Deployer Self-Check Checklist

After deployment, verify in order:

```bash
# 1. Health check (all bindings ready)
curl https://your-worker.workers.dev/ap-health
# Expected: {"ok":true,"checks":{"database":"ok","storage":"ok","ai":"ok","setupComplete":true}}

# 2. Homepage accessible
curl -I https://your-worker.workers.dev/

# 3. Login page accessible
curl -I https://your-worker.workers.dev/login

# 4. Admin login (replace username and password)
curl -c cookies.txt -X POST https://your-worker.workers.dev/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=your-password"

# 5. Access the dashboard with authentication
curl -b cookies.txt https://your-worker.workers.dev/admin/dashboard
```

If all checks pass, the deployment is successful.

---

## 5. Common Issues

| Issue | Solution |
|---|---|
| `wrangler deploy` reports `Failed to fetch auth token` | Run `wrangler login` to re-authorize |
| First visit to `/` returns 404 | No theme is activated; activate one in the admin panel |
| AI endpoint returns "AI service not configured" | Select Cloudflare AI under "Settings → AI" |
| Image upload fails | Check that the R2 binding name is `astropress-media` |
| Static assets 404 after deploy | Confirm `[assets] directory = "./dist"` in `wrangler.toml` |

For more issues, see [docs/FAQ.md](./FAQ.md).

---

## 6. Next Steps

- Read [docs/USER-GUIDE.md](./USER-GUIDE.md) to learn admin operations
- Configure a custom domain: Cloudflare Dashboard → Worker → Triggers → Custom Domains
- Enable automatic backups: configure a scheduled task under "Plugins → Backup" in the admin panel

---

## 7. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                   │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Workers    │  │  D1 Database │  │  R2 Object Storage  │  │
│  │  (SSR)      │──│  (SQLite)    │  │  (Media Files)      │  │
│  │  Astro 4    │  │              │  │                     │  │
│  └─────────────┘  └──────────────┘  └─────────────────────┘  │
│         │                                                      │
│         ▼                                                      │
│  ┌─────────────┐                                              │
│  │ Workers AI  │  ← AI writing assistant (no API Key needed) │
│  └─────────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

**Advantages**:
- Global edge network with millisecond-level response times
- Serverless — zero server maintenance
- Free tier is sufficient for small and medium sites
- All data stays within the Cloudflare ecosystem — no external dependencies
