# AstroPress 官方部署指南

> **目标**：从零基础到上线，15 分钟内部署一个功能完整的 CMS。
>
> **双实例参考**：
> - **V2（生产实例）** https://astropress-v2.nqc715560.workers.dev（版本 `442c51b0`）
> - **OLD（历史实例）** https://astropress.nqc715560.workers.dev（版本 `a67875e6`）
> - 两者均已配置 D1、R2、AI 绑定

---

## 一、部署前准备

### 1.1 注册 Cloudflare 账号

访问 [cloudflare.com](https://cloudflare.com) 注册免费账号（免费套餐即可运行本系统）。

### 1.2 安装 Wrangler CLI

```bash
# 方法 1：通过 npm（推荐）
npm install -g wrangler

# 方法 2：Windows 用户可直接使用绿色版（本仓库部署脚本已识别 D:\DevTools）
# 详见 docs/FAQ.md#重装系统后绿色工具链识别
```

### 1.3 登录 Cloudflare

```bash
wrangler login
```

> 如果浏览器跳转失败，请检查是否已安装 Chrome/Edge。也可使用 `wrangler login --no-browser` 复制链接手动授权。

---

## 二、一键部署（Cloudflare Workers）

### 2.1 克隆仓库

```bash
git clone https://github.com/jilefo/AstroPress.git
cd AstroPress
pnpm install
```

### 2.2 初始化资源

```bash
# 创建 D1 数据库（记录返回的 database_id）
wrangler d1 create astropress

# 创建 R2 存储桶
wrangler r2 bucket create astropress-media
```

### 2.3 配置 `wrangler.toml`

编辑 `apps/admin/wrangler.toml`：

```toml
name = "astropress-v2"              # Worker 名称（可自定义）
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
database_name = "astropress"        # 与上面创建的 D1 名称一致
database_id = "<YOUR_DATABASE_ID>"  # 从 wrangler d1 create 输出中复制

[[r2_buckets]]
binding = "R2"
bucket_name = "astropress-media"    # 与上面创建的 R2 名称一致

# Workers AI — 开启 AI 写作助手
[ai]
binding = "AI"
```

> **注意**：`[ai]` 绑定在部署时自动携带，无需在控制台手动添加。

### 2.4 构建并部署

```bash
cd apps/admin
npx wrangler deploy
```

构建过程会自动执行 `pnpm run build:cf`（包括 Astro 构建、静态资源打包、UTF-8 编码守卫注入等）。

部署成功后，输出示例：

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

## 三、首次启动与初始化

### 3.1 访问 Setup 向导

打开 `https://your-worker.workers.dev/setup`，按向导创建管理员账号。

> **重要**：setup 向导只创建 admin 账号和基础选项，**不会自动激活主题**（这是已知行为，见下方 3.2）。

### 3.2 激活主题

1. 登录后台 `/admin`
2. 进入「外观 → 主题」
3. 选择一个主题（如 AIYA-CMS）点击「激活」

### 3.3 配置 AI 写作助手（可选但推荐）

进入「设置 → AI」，选择 **Cloudflare AI**（无需 API Key，使用 Workers AI 绑定）。

### 3.4 安装主题包（可选）

如需导入更多主题（44 个主题包已预置在 `wp-themes/` 目录），可通过「外观 → 主题 → 导入」批量导入。

---

## 四、部署者自检清单

部署完成后，请按顺序验证：

```bash
# 1. 健康检查（所有绑定就绪）
curl https://your-worker.workers.dev/ap-health
# 期望：{"ok":true,"checks":{"database":"ok","storage":"ok","ai":"ok","setupComplete":true}}

# 2. 首页可访问
curl -I https://your-worker.workers.dev/

# 3. 登录页可访问
curl -I https://your-worker.workers.dev/login

# 4. 后台登录（替换用户名密码）
curl -c cookies.txt -X POST https://your-worker.workers.dev/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=your-password"

# 5. 认证后访问仪表盘
curl -b cookies.txt https://your-worker.workers.dev/admin/dashboard
```

全部通过即部署成功。

---

## 五、常见问题

| 问题 | 解决方案 |
|---|---|
| `wrangler deploy` 报 `Failed to fetch auth token` | 运行 `wrangler login` 重新授权 |
| 首次访问 `/` 返回 404 | 主题未激活，进入后台激活一个主题 |
| AI 端点返回「未配置 AI 服务」 | 在「设置 → AI」中选择 Cloudflare AI |
| 上传图片失败 | 检查 R2 绑定名称是否为 `astropress-media` |
| 部署后静态资源 404 | 确认 `wrangler.toml` 中 `[assets] directory = "./dist"` |

更多问题见 [docs/FAQ.md](./FAQ.md)。

---

## 六、下一步

- 阅读 [docs/USER-GUIDE.md](./USER-GUIDE.md) 了解后台操作
- 配置自定义域名：Cloudflare Dashboard → Worker → Triggers → Custom Domains
- 开启自动备份：后台「插件 → Backup」配置定时任务

---

## 七、部署架构图

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
│  │ Workers AI  │  ← AI 写作助手（无需 API Key）                │
│  └─────────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

**优势**：
- 全球边缘节点，毫秒级响应
- Serverless，零服务器维护
- 免费额度足够中小站点运行
- 所有数据在 Cloudflare 生态内闭环，无外部依赖
