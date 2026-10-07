# Deployer Advisory

> Production environment recommendations for operators and site owners about to deploy AstroPress, ordered by importance.

---

## 1. Security Baseline (Required)

1. **Create a second admin account immediately after installation** — a single locked admin means losing control of the entire site (HIGH risk)
2. **Enable 2FA for all admins** — "Users → Profile → Two-Factor Authentication"
3. **Strong password policy** — at least 12 characters, mixed case + numbers + symbols; the system already enforces 10 failed logins → 15-minute lockout
4. **Use a 32+ character random string for AUTH_SECRET** — generate with `openssl rand -base64 32`; if leaked, all sessions become invalid immediately and all users must re-login
5. **Admin path protection** (optional) — configure IP Access Rules in the Cloudflare Dashboard to allow only trusted IPs for `/admin` and `/login`

## 2. Deployment Configuration (Strongly Recommended)

6. **Bind a custom domain** — cache-warmer self-warming is blocked by the CF platform under `workers.dev`; all features work correctly after binding a custom domain
7. **Confirm the three bindings are ready** — after deployment, visit `/ap-health` and ensure `database/storage/ai` are all `ok`
8. **Activate a theme after the first deployment** — the setup wizard does not write `astropress_active_theme`; the homepage will 404 until a theme is activated
9. **Configure the AI service provider** — select Cloudflare AI under "Settings → AI" (free, zero configuration) or a custom OpenAI-compatible endpoint (DeepSeek, etc.)
10. **Enable page cache + lazy loading** — under "Plugins → Cache Suite"; response time drops from ~1.5s to ~50ms

## 3. Operations (Recommended)

11. **Set up health monitoring** — UptimeRobot monitoring `/ap-health`, keyword `ok:true`, 5-minute interval
12. **Enable automatic backups** — "Plugins → Tools Suite → Backup", daily backup to R2
13. **Regularly check 404 monitoring** — "Plugins → SEO Suite → 404 Monitor", set redirects for high-frequency 404 paths
14. **Watch activity logs** — "Site → Activity Log", abnormal logins / bulk deletions are immediately visible
15. **Back up before updating** — export the database and download a media backup before upgrading versions

## 4. Performance Tuning (Optional)

16. **Configure cache warming** — add the homepage + Top 10 posts under "Cache Warmer" to eliminate cold starts
17. **Use WebP for images** — 30% smaller than JPG; uploaded images are automatically optimized
18. **Use "Load more" wisely** — use infinite scroll instead of pagination on long list pages to reduce full-page refreshes

## 5. Applicable Scale (Honest Limits)

| Metric | Comfort Zone | Limit Zone |
|---|---|---|
| Daily UV | < 10,000 | 50,000 (all caching must be enabled) |
| Number of posts | < 5,000 | 20,000 |
| Concurrent comments | < 10/minute | platform rate-limit as fallback |
| Media storage | < 10GB (free quota) | pay-as-you-go |

If you exceed the comfort zone, consider a Node.js self-hosted + PostgreSQL solution (see [DEPLOY-NODE.md](./DEPLOY-NODE.md)).

## 6. Content Compliance Notes

- AI-generated content should be reviewed manually before publishing (factual / copyright risks are your own)
- Comment honeypot + frequency control are built in; still recommended to keep "manual moderation" enabled
- Ad content must comply with the laws and regulations of the target region

---

**Encountered an issue not covered in this advisory?** Check [FAQ.md](./FAQ.md) or open an issue.
