# AstroPress User Guide

> A complete operations guide for site owners, covering every module of the admin panel.

---

## 1. Login and Dashboard

### 1.1 Logging In

1. Visit `https://your-site.workers.dev/login`
2. Enter your admin username and password
3. Optional: enable "Remember Me" (30-day session)

### 1.2 Dashboard Overview

After logging in, you land on `/admin/dashboard`, where you can view:

| Module | Description |
|---|---|
| Post statistics | Number of published / draft posts and pages |
| Comment statistics | Number of pending / approved comments |
| Media library | Total file count and storage usage |
| Cache status | Page cache hit rate (see the "Dashboard Cache Status" card) |
| Recent activity | Logs of logins, edits, comments, and other operations |

### 1.3 Sidebar Navigation (Collapsible Groups)

- **Content**: Posts, Pages, Custom Post Types, Media Library, Comments, Forms, Ads
- **Structure**: Menus, Categories, Tags
- **Site**: Site Directory, Redirects, Notification Center
- **Appearance**: Themes, Theme Editor, Custom CSS
- **Plugin Suites** (9 collapsible groups):
  - Security & Protection: Login Lockdown, 2FA, Maintenance Mode, Security Headers
  - Cache & Performance: Page Cache, Lazy Load, HTML Optimization, Cache Warmer
  - SEO & Traffic: SEO Tools, Sitemap, Analytics
  - Content & Engagement: Comments, Likes, Related Posts, Reading Mode
  - Marketing & Growth: Ads, Popups, Tracking Pixels
  - Tools & Integrations: File Manager, Database Console, Backup, Git Sync
  - AI & Automation: AI Writing Assistant, AI Auto-Fill, Webhook Publishing
  - Multilingual & i18n: Multilingual, Translation Management
  - Developer Tools: Custom Fields, Custom Post Types, Shortcodes

> **Tip**: Menu links of disabled plugins are hidden automatically; click a group title to expand/collapse it — the state persists in localStorage.

---

## 2. Content Management

### 2.1 Publishing a Post

1. "Content → Posts → Add New"
2. Fill in the title and content (Markdown / block editor supported)
3. Configure the right sidebar:
   - **Categories**: select one or more
   - **Tags**: comma-separated
   - **Featured Image**: choose from the media library or upload
   - **Excerpt**: leave empty to auto-truncate the first 200 characters
   - **SEO**: custom title/description/keywords (optional; auto-generated if empty)
4. Click "Publish" or "Save Draft"

### 2.2 Using the AI Writing Assistant

1. Click "AI Writing" in the top-right corner of the editor
2. Choose a mode:
   - **In-depth Long-form**: generates a 2000+ word in-depth article from the title
   - **WeChat Viral Style**: generates a WeChat Official Account-style article with emojis and suspense
   - **Content Expansion**: select a paragraph and let AI expand it to 500 words
3. The generated content is inserted into the editor automatically and can be further edited

> **Note**: AI-generated content should be reviewed manually to avoid factual errors.

### 2.3 Uploading and Managing Media

1. "Content → Media Library → Upload"
2. Drag-and-drop upload supported; max 100MB per file (adjustable via `AP_AV_MAX_MB`)
3. Thumbnails are generated automatically; cropping/rotation supported
4. Create folders for organization (e.g., "2026 Covers", "Product Screenshots")

### 2.4 Managing Comments

1. "Content → Comments"
2. Pending comments are highlighted; click "Approve" or "Spam"
3. Approved comments can be replied to (admin replies show a "Site Owner" badge)
4. Honeypot mechanism: bots are blocked automatically (transparent to visitors)

---

## 3. Appearance and Themes

### 3.1 Switching Themes

1. "Appearance → Themes"
2. Click "Activate" on a theme card
3. Takes effect on the frontend immediately (no redeploy needed)

### 3.2 Customizing a Theme

1. "Appearance → Theme Editor"
2. Visually edit the header/footer/sidebar
3. Drag-and-drop blocks; modify colors/fonts
4. Live preview after saving

### 3.3 Importing a New Theme

1. Download a theme pack (.zip)
2. "Appearance → Themes → Import"
3. Select the zip file and check "Create sample pages"
4. After import, activate it from the list

---

## 4. Plugin Management

### 4.1 Enabling/Disabling Plugins

1. "Plugins → Installed Plugins"
2. Click "Enable" or "Disable" on a plugin card
3. **Suite cascading**: disabling the "Cache Suite" also disables its member plugins (Page Cache, Lazy Load, HTML Optimization, etc.)

### 4.2 Configuring Plugins

Once enabled, a "Settings" button appears on the plugin card; click it to open the configuration page.

### 4.3 Common Plugin Configuration Examples

**Page Cache**:
- "Plugins → Cache Suite → Page Cache"
- Once enabled, published post pages are cached (default TTL: 1 hour)
- Exclusion rules can be configured (e.g., do not cache `/search`)

**Site Directory**:
- "Site → Site Directory"
- Add categories → add links (title, URL, description, icon)
- Click statistics supported; displayed on the frontend at `/directory`

**Redirects**:
- "Site → Redirects"
- Add rules: old path → new path (301 permanent redirect)
- Regular expressions supported (e.g., `/old-blog/(.*)` → `/blog/$1`)

---

## 5. SEO Optimization

### 5.1 Global SEO Settings

1. "Settings → SEO"
2. Fill in the site title, subtitle, and default description
3. Configure the default social media image (used for og:image)

### 5.2 Per-Post SEO

When editing a post, use the "SEO" panel in the right sidebar:
- **SEO Title**: falls back to the post title if empty
- **Meta Description**: auto-truncated from the excerpt if empty
- **Focus Keyword**: primary keyword (used for internal link suggestions)
- **Canonical URL**: prevents duplicate content

### 5.3 Sitemap

Generated automatically; verify at `/sitemap.xml`.

Submit to search engines:
- Google Search Console
- Baidu Webmaster Platform

---

## 6. Multilingual (Optional)

### 6.1 Enabling Multilingual

1. "Plugins → Multilingual Suite → Multilingual"
2. Add languages (e.g., English, 日本語)
3. Set the default language

### 6.2 Translating Content

1. When editing a post, use the "Language" panel in the right sidebar
2. Click "Add Translation" to create the corresponding language version
3. A language switcher appears automatically on the frontend

---

## 7. Security Recommendations

### 7.1 Enforce 2FA (Two-Factor Authentication)

1. "Users → Profile"
2. Enable "Two-Factor Authentication" and scan the QR code to bind
3. A 6-digit verification code is required at next login

### 7.2 Regular Backups

1. "Plugins → Tools Suite → Backup"
2. Configure automatic backups (daily/weekly)
3. Backup files are stored in R2 and can be downloaded locally

### 7.3 Create a Second Admin

Prevents a single admin account lockout:
1. "Users → Add User"
2. Select the "Administrator" role
3. Use a separate email and a strong password

---

## 8. Performance Optimization

### 8.1 Enable Page Cache

"Plugins → Cache Suite → Page Cache" → Enable

Effect: published pages are served directly from cache; response time drops from 1.5s to 50ms.

### 8.2 Enable Image Lazy Loading

"Plugins → Cache Suite → Lazy Load" → Enable

Effect: images load only when they enter the viewport, reducing initial page weight.

### 8.3 Configure Cache Warming

"Plugins → Cache Suite → Cache Warmer" → add a URL list

Effect: pages are proactively visited on a schedule so cache is generated in advance.

---

## 9. Troubleshooting

### 9.1 Health Check

Visit `/ap-health` to view system status:

```json
{
  "ok": true,
  "checks": {
    "database": "ok",
    "storage": "ok",
    "ai": "ok",
    "setupComplete": true
  }
}
```

Any check that is not `ok` results in `ok: false`.

### 9.2 Viewing Activity Logs

"Site → Activity Log" shows:
- Login success/failure records
- Post edit records
- Plugin enable/disable records

### 9.3 404 Monitoring

"Plugins → SEO Suite → 404 Monitor" shows invalid URLs visited by users, making it easy to set up redirects.

---

## 10. Advanced Tips

### 10.1 Automatic Publishing via Webhook

1. "Plugins → AI & Automation → Webhook Publishing"
2. Create a Webhook Key
3. External systems can POST to `/ap-webhook/publish` to publish posts automatically

See [docs/API.md](./API.md) for details.

### 10.2 Using Custom Fields

1. "Developer Tools → Custom Fields"
2. Create a field group (e.g., "Book Info": author, publisher, ISBN)
3. Bind it to a post type
4. The custom fields panel appears automatically when editing posts

### 10.3 Using Shortcodes

Insert into post content:

```
[ads slot="in-content"]
[related-posts count="5"]
[donation]
```

They are rendered as the corresponding components on the frontend.

---

## 11. Getting Help

- **Official docs**: https://github.com/jilefo/AstroPress/tree/main/docs
- **Issue tracker**: https://github.com/jilefo/AstroPress/issues
- **FAQ**: [docs/FAQ.md](./FAQ.md)
