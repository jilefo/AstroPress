# AstroPress 架构与插件开发指南

> 面向开发者的架构说明与插件开发规范。

---

## 一、技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Astro 4 SSR |
| 数据库 | Drizzle ORM + SQLite（本地）/ D1（Cloudflare） |
| 存储 | 本地文件系统 / R2 对象存储 |
| 认证 | Lucia Auth（Session Cookie） |
| AI | Workers AI / OpenAI 兼容端点 |
| 部署 | Cloudflare Workers / Node.js 自托管 |

---

## 二、目录结构

```
astropress/
├── apps/
│   ├── admin/           # 管理后台 + 公开前台（单应用架构）
│   │   ├── src/
│   │   │   ├── pages/   # 路由页面
│   │   │   ├── middleware.ts  # 全局中间件（认证/初始化）
│   │   │   └── plugins.ts     # 插件装配点
│   │   └── wrangler.toml      # Cloudflare 配置
│   └── web/             # 纯前台（可选，与 admin 双副本）
├── packages/
│   ├── core/            # 核心逻辑（数据库、主题、插件系统）
│   ├── auth/            # 认证模块
│   └── blocks/          # 区块编辑器
├── plugins/             # 所有插件（9 大套件）
│   ├── permalink/       # 固定链接
│   ├── page-cache/      # 页面缓存
│   ├── seo-tools/       # SEO 工具
│   ├── ai-chat/         # AI 写作助手
│   └── ...
├── wp-themes/           # 主题包（44 个）
└── docs/                # 官方文档
```

---

## 三、核心设计原则

### 3.1 零核心修改

所有插件**不修改** `apps/`、`packages/` 源文件，仅通过三个装配点接线：

1. `apps/admin/astro.config.ts`——注册插件集成
2. `apps/admin/src/plugins.ts`——插件状态管理
3. `apps/admin/package.json`——声明插件依赖

### 3.2 中间件链顺序

```
securityHeaders → rateLimit → maintenanceMode → pageCache → imageLazy → htmlOpt → assetCache → activityLog → revisions → cacheWarmer → pluginManager
```

**规则**：限流/维护必须早于 page-cache，否则缓存绕过限流。

### 3.3 双运行时兼容

同一份代码同时支持：
- **Cloudflare Workers**（D1 + R2 + Workers AI）
- **Node.js**（SQLite + 本地文件系统 + OpenAI 兼容端点）

通过 `context.locals.runtime.env` 检测环境：

```ts
const isCF = !!(locals.runtime?.env?.DB);
```

---

## 四、插件开发规范

### 4.1 最小插件结构

```
plugins/my-plugin/
├── package.json         # 声明插件元数据
├── src/
│   ├── index.ts         # 入口（可选）
│   ├── middleware.ts    # 中间件（可选）
│   ├── routes/          # 公开路由（可选）
│   ├── admin/           # 后台页面（可选）
│   │   ├── index.astro  # 管理页
│   │   └── api/         # 管理 API
│   └── lib/             # 工具函数
└── README.md            # 插件说明
```

### 4.2 package.json 示例

```json
{
  "name": "@astropress/plugin-my-plugin",
  "version": "1.0.0",
  "astropress": {
    "id": "my-plugin",
    "name": "我的插件",
    "description": "插件描述",
    "category": "tools",
    "icon": "🔧",
    "suite": "tools-suite"
  }
}
```

### 4.3 中间件示例

```ts
// plugins/my-plugin/src/middleware.ts
import type { MiddlewareHandler } from "astro";

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = new URL(ctx.request.url);

  // 仅处理特定路径
  if (!pathname.startsWith("/my-plugin")) {
    return next();
  }

  // 读取数据库
  const db = ctx.locals.db;

  // 注入响应头
  const response = await next();
  response.headers.set("X-My-Plugin", "active");
  return response;
};
```

### 4.4 后台页面示例

```astro
---
// plugins/my-plugin/src/admin/index.astro
import AdminLayout from "@astropress/admin/layouts/AdminLayout.astro";
---

<AdminLayout title="我的插件">
  <div class="card">
    <h2>插件设置</h2>
    <form id="settings-form">
      <label>
        <input type="checkbox" name="enabled" />
        启用功能
      </label>
      <button type="submit">保存</button>
    </form>
  </div>

  <style is:global>
    /* 动态创建元素的样式必须用 is:global */
    .card { padding: 24px; background: white; border-radius: 8px; }
  </style>

  <script>
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/admin-ext/my-plugin/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      if (res.ok) alert('已保存');
    });
  </script>
</AdminLayout>
```

### 4.5 公开 API 路由示例

```ts
// plugins/my-plugin/src/routes/public-endpoint.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;

  // 查询数据
  const rows = await db.all("SELECT * FROM wp_posts LIMIT 10");

  return new Response(JSON.stringify({ ok: true, data: rows }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

---

## 五、插件状态管理

### 5.1 启用/禁用

插件状态存储在 `wp_options` 表（`astropress_plugin_states`），格式：

```json
{
  "my-plugin": true,
  "other-plugin": false
}
```

### 5.2 级联启停

套件插件（如 `cache-suite`）启用时，其成员插件（`page-cache`、`image-lazy` 等）自动启用。

### 5.3 平台能力屏蔽

某些插件在 Cloudflare 不可用（如 file-manager 依赖本地文件系统），通过 `astropress.capabilities` 声明：

```json
{
  "astropress": {
    "capabilities": {
      "cloudflare": false,
      "nodejs": true
    }
  }
}
```

---

## 六、数据库操作

### 6.1 使用 Drizzle ORM

```ts
import { wpPosts } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

// 查询
const posts = await db.select().from(wpPosts).where(eq(wpPosts.postStatus, "publish"));

// 插入
await db.insert(wpPosts).values({ postTitle: "标题", postContent: "内容" });

// 更新
await db.update(wpPosts).set({ postTitle: "新标题" }).where(eq(wpPosts.id, 1));
```

### 6.2 Raw SQL（跨驱动）

D1 与 SQLite 驱动行为差异（D1 的 `db.run()` 不返回行），使用 `packages/core/src/db/raw.ts`：

```ts
import { rawAll, rawGet } from "@astropress/core/db/raw";

const rows = await rawAll(db, "SELECT * FROM wp_posts WHERE id = ?", [1]);
const row = await rawGet(db, "SELECT * FROM wp_posts WHERE id = ?", [1]);
```

---

## 七、安全规范

### 7.1 输入验证

所有用户输入必须验证：

```ts
// 路径参数
if (!/^[a-z0-9-]+$/.test(slug)) {
  return new Response("无效标识", { status: 400 });
}

// JSON body
let body;
try {
  body = await request.json();
} catch {
  return new Response("请求格式错误", { status: 400 });
}
```

### 7.2 CSRF 防护

所有写操作（POST/PUT/DELETE）必须验证 Origin：

```ts
import { sameOrigin } from "@astropress/core/http";

if (!sameOrigin(request)) {
  return new Response("跨站请求被拒绝", { status: 403 });
}
```

### 7.3 路径穿越防护

```ts
import { resolvePath } from "@astropress/core/paths";

const safePath = resolvePath(userInput);
if (!safePath) {
  return new Response("非法路径", { status: 400 });
}
```

---

## 八、性能优化

### 8.1 设置缓存

插件设置读取使用 15 秒缓存 + inflight 合并：

```ts
import { loadPluginSettings } from "@astropress/core/plugin-settings";

const settings = await loadPluginSettings(db, "my-plugin");
```

### 8.2 页面缓存

在 `page-cache` 插件中配置规则，或在代码中标记：

```ts
response.headers.set("X-Cache-Control", "max-age=3600");
```

---

## 九、测试规范

### 9.1 编写测试脚本

在 `logs/` 目录创建测试脚本（Python）：

```python
# logs/my_plugin_test.py
import urllib.request, json

BASE = "https://astropress-v2.nqc715560.workers.dev"

def test_endpoint():
    req = urllib.request.Request(f"{BASE}/my-plugin/endpoint")
    with urllib.request.urlopen(req) as r:
        assert r.status == 200
        print("[PASS] endpoint")

if __name__ == "__main__":
    test_endpoint()
```

### 9.2 运行回归测试

```bash
D:\DevTools\Python\python.exe logs/my_plugin_test.py
```

---

## 十、发布流程

### 10.1 本地测试

```bash
pnpm dev          # 启动 dev server
pnpm build        # 构建
pnpm typecheck    # 类型检查
```

### 10.2 部署

```bash
cd apps/admin
npx wrangler deploy
```

### 10.3 更新文档

- 新增功能：更新 `CHANGELOG.md` + `docs/USER-GUIDE.md`
- 修复缺陷：更新 `CHANGELOG.md`
- 架构变更：更新 `docs/ARCHITECTURE.md`

---

## 十一、最佳实践

1. **避免全局状态**：使用 `context.locals` 传递请求级状态
2. **错误处理**：所有异步操作用 try/catch 包裹
3. **类型安全**：避免 `any`，使用 TypeScript 严格模式
4. **日志记录**：关键操作记录到 `activity-log`
5. **性能优先**：避免 N+1 查询，使用批量查询
6. **向后兼容**：新版本必须兼容旧数据格式

---

## 十二、参考实现

参考现有插件：
- **简单插件**：`plugins/related-posts`
- **中间件插件**：`plugins/page-cache`
- **完整插件**：`plugins/comments`
- **套件插件**：`plugins/perf-suite`
