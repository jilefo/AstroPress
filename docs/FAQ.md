# AstroPress 常见问题 FAQ

---

## 部署相关

### Q1: 重装系统后如何快速恢复开发环境？

**A**：本仓库部署脚本已自动识别 `D:\DevTools` 绿色版工具链：

1. 只需安装 Python 3（系统 PATH）
2. 绿色版 Node.js、Git、pnpm 放在 `D:\DevTools` 对应目录
3. 运行部署脚本时自动识别并加入 PATH

详见 [scripts/deploy.py](../scripts/deploy.py) 中的 `setup_env()` 函数。

---

### Q2: `pnpm install` 报 `EPERM` 错误？

**A**：本地 dev server（4321 端口）长期运行会锁定 `turbo.exe`，导致安装失败。

解决：
```powershell
# 查找占用进程
netstat -ano | findstr :4321
# 杀掉进程（替换 PID）
taskkill /F /PID <PID>
# 重新安装
pnpm install
```

---

### Q3: 部署后静态资源 404？

**A**：检查 `wrangler.toml` 中 `[assets] directory = "./dist"` 是否正确，以及是否执行了 `pnpm run build:cf`。

---

### Q4: AI 写作助手返回「未配置 AI 服务」？

**A**：全新实例需在后台「设置 → AI」中手动选择 **Cloudflare AI**（无需 API Key，使用 Workers AI 绑定）。

---

### Q5: 上传图片失败？

**A**：检查 R2 绑定：
1. `wrangler.toml` 中 `[[r2_buckets]] binding = "R2"` 且 `bucket_name = "astropress-media"`
2. Cloudflare Dashboard → R2 → 确认 bucket 存在
3. 后台「设置 → 媒体」查看存储路径配置

---

## 功能相关

### Q6: 如何取消文章 URL 的 `/blog/` 前缀？

**A**：默认已取消（V2.1 轮修复）。如需恢复：

1. 「插件 → 开发者工具 → 固定链接」
2. 取消勾选「启用简洁固定链接」
3. 保存后自动恢复 `/blog/{slug}` 格式

旧链接会 301 重定向到新格式（SEO 友好）。

---

### Q7: 为什么评论提交后前台不显示？

**A**：评论默认需要审核。进入「内容 → 评论 → 待审核」点击「批准」。

如需免审核：「设置 → 讨论」→ 取消勾选「评论必须人工批准」。

---

### Q8: 如何实现文章多语言？

**A**：

1. 「插件 → 多语言套件 → 多语言」启用并添加语言
2. 编辑文章时，右侧边栏点击「添加翻译」
3. 前台自动显示语言切换器

注意：多语言站点的 sitemap 会自动生成 hreflang 标签。

---

### Q9: 如何自定义 404 页面？

**A**：「外观 → 主题编辑器」→ 选择 404 模板 → 拖拽区块编辑。

---

### Q10: 如何批量导入文章？

**A**：使用 Webhook 发布接口：

```bash
curl -X POST https://your-site.workers.dev/ap-webhook/publish \
  -H "Authorization: Bearer YOUR_WEBHOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "文章标题",
    "content": "Markdown 内容",
    "status": "publish"
  }'
```

详见 [docs/API.md](./API.md)。

---

## 性能相关

### Q11: 首次访问较慢？

**A**：这是 Cloudflare Workers 的冷启动特性（< 100ms），加上 D1 首次连接。后续访问会命中页面缓存（< 50ms）。

优化：
1. 「插件 → 缓存套件 → 缓存预热」添加首页和热门文章
2. 「插件 → 缓存套件 → 页面缓存」启用

---

### Q12: 如何查看缓存命中率？

**A**：「仪表盘」→「缓存状态」小卡实时显示。

---

### Q13: 图片加载慢？

**A**：

1. 「插件 → 缓存套件 → 懒加载」启用
2. 上传时使用 WebP 格式（更小体积）
3. 配置 CDN 缓存规则（Cloudflare Dashboard → Caching → Page Rules）

---

## 安全相关

### Q14: 忘记管理员密码？

**A**：

```bash
# 本地重置（需先 wrangler login）
cd apps/admin
npx wrangler d1 execute astropress --command "UPDATE wp_users SET user_pass = '新密码哈希' WHERE user_login = 'admin';"
```

或使用后台「用户 → 个人资料 → 修改密码」。

---

### Q15: 如何防止暴力破解登录？

**A**：已内置防护：
- 登录失败 10 次锁定 15 分钟
- 全局限流 20 次/分钟
- 可选开启 2FA

---

### Q16: 如何限制后台 IP 访问？

**A**：Cloudflare Dashboard → Workers → 你的 Worker → Settings → IP Access Rules，添加白名单。

---

## 数据相关

### Q17: 如何备份数据？

**A**：

1. 自动备份：「插件 → 工具套件 → 备份」配置定时任务（每日/每周）
2. 手动备份：「数据库控制台」→ 导出 SQL
3. 媒体文件：R2 对象存储自动持久化

---

### Q18: 如何迁移到其他平台？

**A**：

1. 导出数据：「数据库控制台」→ 导出 SQL
2. 下载媒体：「备份」→ 下载 R2 文件
3. 部署到新平台后导入 SQL 并上传媒体

---

### Q19: 数据库损坏怎么办？

**A**：D1 是托管服务，Cloudflare 自动备份。如遇问题：

1. Cloudflare Dashboard → D1 → 你的数据库 → Backups
2. 选择恢复点 → Restore

---

## 开发相关

### Q20: 如何开发自定义插件？

**A**：详见 [docs/PLUGIN-DEV.md](./PLUGIN-DEV.md)（插件开发指南）。

简要步骤：
1. `plugins/` 目录下创建插件文件夹
2. 实现 `middleware.ts` / `routes/` / `admin/`
3. 在 `apps/admin/astro.config.ts` 注册
4. 后台「插件管理」启用

---

### Q21: 如何调试生产环境？

**A**：

```bash
# 实时日志
npx wrangler tail

# 查看特定请求
npx wrangler tail --status error
```

---

### Q22: 本地开发如何连接生产数据库？

**A**：**不推荐**（风险高）。如必须：

```bash
# .env
DATABASE_URL="libsql://your-database.turso.io"
```

详见 [docs/deployment.md](./deployment.md#本地连生产-d1)。

---

## 其他

### Q23: 支持哪些浏览器？

**A**：

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

不支持 IE11。

---

### Q24: 免费额度够用吗？

**A**：Cloudflare 免费套餐：
- Workers: 100,000 请求/天
- D1: 500 万行读取/天，10 万行写入/天
- R2: 10GB 存储，1000 万读取/月

中小站点（< 1 万 UV/天）完全够用。

---

### Q25: 如何贡献代码？

**A**：详见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

---

**未找到答案？** 提交 Issue：https://github.com/jilefo/AstroPress/issues
