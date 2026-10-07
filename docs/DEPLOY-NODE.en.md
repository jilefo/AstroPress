# AstroPress Node.js Self-Hosted Deployment Guide

> For scenarios where you don't want to use Cloudflare or need complete self-control.

---

## 1. Requirements

- Node.js 20+
- pnpm 8+
- SQLite 3 (built-in, no separate installation needed)

---

## 2. Quick Start

### 2.1 Clone and Install

```bash
git clone https://github.com/jilefo/AstroPress.git
cd AstroPress
pnpm install
```

### 2.2 Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Database (local SQLite file path)
DATABASE_URL="file:./data/astropress.db"

# Authentication secret (randomly generated 32-character string)
AUTH_SECRET="your-random-secret-here"

# Optional: AI configuration (using OpenAI-compatible endpoints)
# OPENAI_API_KEY="sk-..."
# OPENAI_BASE_URL="https://api.deepseek.com/v1"
# OPENAI_MODEL="deepseek-chat"
```

### 2.3 Initialize the Database

```bash
pnpm db:push        # Create table structures
pnpm db:seed        # Optional: import sample data
```

### 2.4 Start

```bash
# Development mode (hot reload)
pnpm dev

# Production mode
pnpm build
pnpm start
```

Listens by default on `http://localhost:4321`.

> **Important: production must be served over HTTPS, otherwise admin login silently fails.**
> The session cookie is always marked `Secure` when `NODE_ENV=production`, so browsers only send it
> over HTTPS. Accessing `http://IP:4321` directly makes login silently bounce back to the login page.
> For local development use `pnpm dev` (development mode drops `Secure`); for production set up a
> reverse proxy with TLS (see section 4).
>
> Note: the `storage` / `ai` checks in the `/ap-health` probe are Cloudflare-oriented (R2 /
> Workers AI bindings) and may report unavailable on Node — an expected platform difference that
> does not affect file management, media uploads (local disk), or AI via an OpenAI-compatible
> endpoint (configure it under "Settings → AI"). Use the `ok` field for liveness.

---

## 3. Production Deployment

### 3.1 Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start
pm2 start apps/admin/dist/server/entry.mjs --name astropress

# Start on boot
pm2 startup
pm2 save
```

### 3.2 Using Docker

```bash
# Build the image
docker build -t astropress .

# Run
docker run -d \
  -p 4321:4321 \
  -v $(pwd)/data:/app/data \
  -e AUTH_SECRET=your-secret \
  astropress
```

### 3.3 Using Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  astropress:
    build: .
    ports:
      - "4321:4321"
    volumes:
      - ./data:/app/data
    environment:
      - AUTH_SECRET=your-secret
    restart: unless-stopped
```

Start:

```bash
docker compose up -d
```

---

## 4. Reverse Proxy (Nginx)

### 4.1 Basic Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4.2 Enable HTTPS (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Auto-configure
sudo certbot --nginx -d your-domain.com
```

---

## 5. Data Backup

### 5.1 Automatic Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="./backups"

# Back up the database
cp ./data/astropress.db "$BACKUP_DIR/db-$DATE.db"

# Back up media files
tar -czf "$BACKUP_DIR/media-$DATE.tar.gz" ./public/media

# Keep only the last 30 days
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

Add to crontab:

```bash
# Backup every day at 2 AM
0 2 * * * /path/to/backup.sh
```

### 5.2 Manual Backup

```bash
# Export the database
sqlite3 ./data/astropress.db .dump > backup.sql

# Package media
tar -czf media-backup.tar.gz ./public/media
```

---

## 6. Performance Optimization

### 6.1 Enable Page Cache

"Plugins → Cache Suite → Page Cache" → Enable

### 6.2 Use Redis Cache (Optional)

```bash
# Install Redis
docker run -d -p 6379:6379 redis:alpine

# .env
REDIS_URL="redis://localhost:6379"
```

### 6.3 Configure CDN

Map `/media/*` paths to a CDN (e.g., Cloudflare, Upyun).

---

## 7. Troubleshooting

### 7.1 Viewing Logs

```bash
# PM2
pm2 logs astropress

# Docker
docker logs <container-id>
```

### 7.2 Health Check

```bash
curl http://localhost:4321/ap-health
```

### 7.3 Database Lock

SQLite doesn't support high-concurrency writes. If you encounter `database is locked`:

1. Check for long-running transactions
2. Restart the service
3. Consider migrating to PostgreSQL (requires schema modifications)

---

## 8. Differences from Cloudflare Deployment

| Feature | Cloudflare | Node.js |
|---|---|---|
| Database | D1 (managed SQLite) | SQLite file |
| Storage | R2 object storage | Local filesystem |
| AI | Workers AI | OpenAI-compatible endpoint |
| File manager plugin | ❌ Unavailable | ✅ Available |
| WebDAV plugin | ❌ Unavailable | ✅ Available |
| Git sync plugin | ❌ Unavailable | ✅ Available |
| Cold start | < 100ms | 0 (persistent process) |
| Global CDN | ✅ Automatic | ❌ Requires configuration |

---

## 9. Upgrading

```bash
# Pull latest code
git pull

# Update dependencies
pnpm install

# Database migration
pnpm db:push

# Rebuild
pnpm build

# Restart
pm2 restart astropress
```

---

## 10. Security Hardening

### 10.1 Firewall

```bash
# Only allow 80/443
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 10.2 Restrict File Permissions

```bash
chmod 600 .env
chmod -R 755 ./data
```

### 10.3 Regular Updates

```bash
# Check dependency vulnerabilities
pnpm audit

# Update dependencies
pnpm update
```

---

## 11. Monitoring

### 11.1 Using UptimeRobot

1. Point to the `/ap-health` endpoint
2. Configure monitoring: HTTP(s) → URL → keyword `ok:true`

### 11.2 Using PM2 Monitoring

```bash
pm2 install pm2-server-monit
```

---

**Next step**: read [USER-GUIDE.md](./USER-GUIDE.md) to learn admin operations.
