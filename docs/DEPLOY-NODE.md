# AstroPress Node.js 自托管部署指南

> 适用于不想使用 Cloudflare、需要完全自主控制的场景。

---

## 一、环境要求

- Node.js 20+
- pnpm 8+
- SQLite 3（内置，无需单独安装）

---

## 二、快速开始

### 2.1 克隆与安装

```bash
git clone https://github.com/jilefo/AstroPress.git
cd AstroPress
pnpm install
```

### 2.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
# 数据库（本地 SQLite 文件路径）
DATABASE_URL="file:./data/astropress.db"

# 认证密钥（随机生成 32 位字符串）
AUTH_SECRET="your-random-secret-here"

# 可选：AI 配置（使用 OpenAI 兼容端点）
# OPENAI_API_KEY="sk-..."
# OPENAI_BASE_URL="https://api.deepseek.com/v1"
# OPENAI_MODEL="deepseek-chat"
```

### 2.3 初始化数据库

```bash
pnpm db:push        # 创建表结构
pnpm db:seed        # 可选：导入示例数据
```

### 2.4 启动

```bash
# 开发模式（热重载）
pnpm dev

# 生产模式
pnpm build
pnpm start
```

默认监听 `http://localhost:4321`。

> **重要：生产环境必须通过 HTTPS 访问，否则后台无法登录。**
> 登录会话 Cookie 在 `NODE_ENV=production` 下恒带 `Secure` 属性，浏览器只在 HTTPS 连接中回传该 Cookie。
> 直接用 `http://IP:4321` 访问时，登录请求会静默失败（跳回登录页）。本地开发请使用 `pnpm dev`
> （development 模式下 Cookie 不带 `Secure`）；生产部署请配置反向代理 + HTTPS（见第四节）。
>
> 另：`/ap-health` 健康探针的 `storage` / `ai` 两项检查语义面向 Cloudflare（R2 / Workers AI 绑定），
> 在 Node 形态下这两项可能显示不可用，属预期平台差异，不影响文件管理、媒体上传（本地磁盘）与
> OpenAI 兼容端点 AI 功能（在「设置 → AI」中配置）。判断服务是否存活以 `ok` 字段为准。

---

## 三、生产部署

### 3.1 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start apps/admin/dist/server/entry.mjs --name astropress

# 开机自启
pm2 startup
pm2 save
```

### 3.2 使用 Docker

```bash
# 构建镜像
docker build -t astropress .

# 运行
docker run -d \
  -p 4321:4321 \
  -v $(pwd)/data:/app/data \
  -e AUTH_SECRET=your-secret \
  astropress
```

### 3.3 使用 Docker Compose

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

启动：

```bash
docker compose up -d
```

---

## 四、反向代理（Nginx）

### 4.1 基本配置

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

### 4.2 启用 HTTPS（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 自动配置
sudo certbot --nginx -d your-domain.com
```

---

## 五、数据备份

### 5.1 自动备份脚本

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="./backups"

# 备份数据库
cp ./data/astropress.db "$BACKUP_DIR/db-$DATE.db"

# 备份媒体文件
tar -czf "$BACKUP_DIR/media-$DATE.tar.gz" ./public/media

# 保留最近 30 天
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

添加到 crontab：

```bash
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh
```

### 5.2 手动备份

```bash
# 导出数据库
sqlite3 ./data/astropress.db .dump > backup.sql

# 打包媒体
tar -czf media-backup.tar.gz ./public/media
```

---

## 六、性能优化

### 6.1 启用页面缓存

「插件 → 缓存套件 → 页面缓存」→ 启用

### 6.2 使用 Redis 缓存（可选）

```bash
# 安装 Redis
docker run -d -p 6379:6379 redis:alpine

# .env
REDIS_URL="redis://localhost:6379"
```

### 6.3 配置 CDN

将 `/media/*` 路径配置到 CDN（如 Cloudflare、又拍云）。

---

## 七、故障排查

### 7.1 查看日志

```bash
# PM2
pm2 logs astropress

# Docker
docker logs <container-id>
```

### 7.2 健康检查

```bash
curl http://localhost:4321/ap-health
```

### 7.3 数据库锁定

SQLite 不支持高并发写入，如遇 `database is locked`：

1. 检查是否有长时间运行的事务
2. 重启服务
3. 考虑迁移到 PostgreSQL（需修改 schema）

---

## 八、与 Cloudflare 部署的差异

| 特性 | Cloudflare | Node.js |
|---|---|---|
| 数据库 | D1（托管 SQLite） | SQLite 文件 |
| 存储 | R2 对象存储 | 本地文件系统 |
| AI | Workers AI | OpenAI 兼容端点 |
| 文件管理插件 | ❌ 不可用 | ✅ 可用 |
| WebDAV 插件 | ❌ 不可用 | ✅ 可用 |
| Git 同步插件 | ❌ 不可用 | ✅ 可用 |
| 冷启动 | < 100ms | 0（常驻进程） |
| 全球 CDN | ✅ 自动 | ❌ 需配置 |

---

## 九、升级

```bash
# 拉取最新代码
git pull

# 更新依赖
pnpm install

# 数据库迁移
pnpm db:push

# 重新构建
pnpm build

# 重启
pm2 restart astropress
```

---

## 十、安全加固

### 10.1 防火墙

```bash
# 仅允许 80/443
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 10.2 限制文件权限

```bash
chmod 600 .env
chmod -R 755 ./data
```

### 10.3 定期更新

```bash
# 检查依赖漏洞
pnpm audit

# 更新依赖
pnpm update
```

---

## 十一、监控

### 11.1 使用 UptimeRobot

1. 访问 `/ap-health` 端点
2. 配置监控：HTTP(s) → URL → 关键词 `ok:true`

### 11.2 使用 PM2 监控

```bash
pm2 install pm2-server-monit
```

---

**下一步**：阅读 [USER-GUIDE.md](./USER-GUIDE.md) 了解后台操作。
