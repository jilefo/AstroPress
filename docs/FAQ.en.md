# AstroPress FAQ

---

## Deployment

### Q1: How do I quickly restore the development environment after a system reinstall?

**A**: This repo's deploy script automatically detects the portable toolchain in `D:\DevTools`:

1. Only Python 3 needs to be installed (system PATH)
2. Place portable Node.js, Git, and pnpm in the corresponding `D:\DevTools` directories
3. The deploy script auto-detects them and adds them to PATH when run

See the `setup_env()` function in [scripts/deploy.py](../scripts/deploy.py) for details.

---

### Q2: `pnpm install` fails with an `EPERM` error?

**A**: A long-running local dev server (port 4321) locks `turbo.exe`, causing the install to fail.

Fix:
```powershell
# Find the process holding the port
netstat -ano | findstr :4321
# Kill the process (replace PID)
taskkill /F /PID <PID>
# Reinstall
pnpm install
```

---

### Q3: Static assets return 404 after deployment?

**A**: Check that `[assets] directory = "./dist"` in `wrangler.toml` is correct, and that `pnpm run build:cf` was executed.

---

### Q4: The AI writing assistant returns "AI service not configured"?

**A**: On a fresh instance, you must manually select **Cloudflare AI** under "Settings → AI" in the admin panel (no API Key required; uses the Workers AI binding).

---

### Q5: Image uploads fail?

**A**: Check the R2 binding:
1. `wrangler.toml` must contain `[[r2_buckets]] binding = "R2"` and `bucket_name = "astropress-media"`
2. Cloudflare Dashboard → R2 → confirm the bucket exists
3. Check the storage path configuration under "Settings → Media" in the admin panel

---

## Features

### Q6: How do I remove the `/blog/` prefix from post URLs?

**A**: It is removed by default (fixed in the V2.1 round). To restore it:

1. "Plugins → Developer Tools → Permalinks"
2. Uncheck "Enable clean permalinks"
3. After saving, the `/blog/{slug}` format is restored

Old links 301-redirect to the new format (SEO-friendly).

---

### Q7: Why don't submitted comments appear on the frontend?

**A**: Comments require moderation by default. Go to "Content → Comments → Pending" and click "Approve".

To disable moderation: "Settings → Discussion" → uncheck "Comments must be manually approved".

---

### Q8: How do I make posts multilingual?

**A**:

1. Enable and add languages under "Plugins → Multilingual Suite → Multilingual"
2. When editing a post, click "Add Translation" in the right sidebar
3. A language switcher appears automatically on the frontend

Note: sitemaps for multilingual sites automatically include hreflang tags.

---

### Q9: How do I customize the 404 page?

**A**: "Appearance → Theme Editor" → select the 404 template → edit via drag-and-drop blocks.

---

### Q10: How do I bulk import posts?

**A**: Use the Webhook publishing endpoint:

```bash
curl -X POST https://your-site.workers.dev/ap-webhook/publish \
  -H "Authorization: Bearer YOUR_WEBHOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Post title",
    "content": "Markdown content",
    "status": "publish"
  }'
```

See [docs/API.md](./API.md) for details.

---

## Performance

### Q11: The first visit is slow?

**A**: This is the Cloudflare Workers cold start (< 100ms), plus the initial D1 connection. Subsequent visits hit the page cache (< 50ms).

Optimization:
1. Add the homepage and popular posts under "Plugins → Cache Suite → Cache Warmer"
2. Enable "Plugins → Cache Suite → Page Cache"

---

### Q12: How do I check the cache hit rate?

**A**: The "Dashboard" → "Cache Status" card shows it in real time.

---

### Q13: Images load slowly?

**A**:

1. Enable "Plugins → Cache Suite → Lazy Load"
2. Use WebP format when uploading (smaller file size)
3. Configure CDN cache rules (Cloudflare Dashboard → Caching → Page Rules)

---

## Security

### Q14: Forgot the admin password?

**A**:

```bash
# Reset locally (requires wrangler login first)
cd apps/admin
npx wrangler d1 execute astropress --command "UPDATE wp_users SET user_pass = 'new-password-hash' WHERE user_login = 'admin';"
```

Or use "Users → Profile → Change Password" in the admin panel.

---

### Q15: How is brute-force login prevented?

**A**: Built-in protections:
- 10 failed logins → 15-minute lockout
- Global rate limit of 20 requests/minute
- Optional 2FA

---

### Q16: How do I restrict admin access by IP?

**A**: Cloudflare Dashboard → Workers → your Worker → Settings → IP Access Rules; add a whitelist.

---

## Data

### Q17: How do I back up data?

**A**:

1. Automatic: "Plugins → Tools Suite → Backup" — configure a scheduled task (daily/weekly)
2. Manual: "Database Console" → export SQL
3. Media files: automatically persisted in R2 object storage

---

### Q18: How do I migrate to another platform?

**A**:

1. Export data: "Database Console" → export SQL
2. Download media: "Backup" → download R2 files
3. After deploying to the new platform, import the SQL and upload the media

---

### Q19: What if the database is corrupted?

**A**: D1 is a managed service with automatic backups by Cloudflare. If problems occur:

1. Cloudflare Dashboard → D1 → your database → Backups
2. Choose a restore point → Restore

---

## Development

### Q20: How do I develop a custom plugin?

**A**: See [docs/PLUGIN-DEV.md](./PLUGIN-DEV.md) (plugin development guide).

Brief steps:
1. Create a plugin folder under `plugins/`
2. Implement `middleware.ts` / `routes/` / `admin/`
3. Register it in `apps/admin/astro.config.ts`
4. Enable it in the admin panel under "Plugin Management"

---

### Q21: How do I debug in production?

**A**:

```bash
# Real-time logs
npx wrangler tail

# View specific requests
npx wrangler tail --status error
```

---

### Q22: How do I connect local development to the production database?

**A**: **Not recommended** (high risk). If you must:

```bash
# .env
DATABASE_URL="libsql://your-database.turso.io"
```

See [docs/deployment.md](./deployment.md) for details.

---

## Miscellaneous

### Q23: Which browsers are supported?

**A**:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

IE11 is not supported.

---

### Q24: Is the free tier enough?

**A**: Cloudflare free plan:
- Workers: 100,000 requests/day
- D1: 5 million rows read/day, 100,000 rows written/day
- R2: 10GB storage, 10 million reads/month

Fully sufficient for small and medium sites (< 10,000 UV/day).

---

### Q25: How do I contribute code?

**A**: See [CONTRIBUTING.md](../CONTRIBUTING.md).

---

**Didn't find your answer?** Open an issue: https://github.com/jilefo/AstroPress/issues
