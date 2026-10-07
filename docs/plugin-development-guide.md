# AstroPress 插件制作步骤方案书

> 本文档为 AstroPress CMS 插件开发提供完整的步骤指南，涵盖项目架构分析、插件系统原理、两种插件类型的开发流程，以及进阶模式和最佳实践。

---

## 一、项目架构概览

AstroPress 是一个基于 Astro 4 SSR + Drizzle ORM + SQLite/Cloudflare D1 构建的 WordPress 兼容 CMS，采用 **pnpm workspace + Turborepo** 单仓架构。

### 1.1 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 单仓管理 | pnpm workspaces + Turborepo | 共享包、智能缓存 |
| 框架 | Astro 4 (SSR) | Islands 架构，默认零 JS |
| 数据库 | SQLite (libsql) / Cloudflare D1 / PostgreSQL | 开发/生产统一 API |
| ORM | Drizzle ORM | 类型安全，SQLite 原生 |
| 数据模型 | WordPress `wp_*` 表 | 成熟数据模型，便于迁移 |
| 认证 | Lucia v3 (`@astropress/auth`) | 轻量会话认证 |
| 编辑器 | `@wordpress/block-editor` (React Island) | 无 WordPress 的 Gutenberg |
| 部署 | Cloudflare Pages + D1 + R2 | 边缘全球，慷慨免费额度 |

### 1.2 目录结构

```
astropress/
├── apps/
│   ├── admin/              # CMS 后台 (端口 4321) — 所有管理 UI + REST API
│   │   └── src/
│   │       ├── middleware.ts       # DB 初始化、认证、插件引导
│   │       ├── plugins.ts         # 插件引导入口 — 在此加载插件
│   │       ├── layouts/           # AdminLayout.astro (侧边栏、顶栏)
│   │       ├── islands/           # React Islands (BlockEditor, FormBuilder 等)
│   │       ├── lib/               # 工具函数 (icons, posts, media 等)
│   │       ├── pages/admin/       # 后台页面
│   │       └── pages/api/         # REST API 端点
│   └── web/                # 公共前台 (端口 4322) — 渲染已发布内容
│       └── src/
│           ├── middleware.ts       # DB 初始化 (无认证)
│           ├── components/        # BlockRenderer.astro
│           ├── layouts/           # BaseLayout.astro
│           └── pages/             # 前台页面路由
├── packages/
│   ├── core/               # Drizzle schema、Registry、查询助手、类型
│   │   └── src/
│   │       ├── index.ts            # 统一导出
│   │       ├── schema/             # wp_* 表定义 (Drizzle)
│   │       ├── registry/           # 内存注册表 (PostType, Taxonomy, SidebarPanel, FieldGroup)
│   │       ├── plugins/            # definePlugin, loadPlugin
│   │       ├── query.ts            # WP 风格查询助手
│   │       ├── db/                 # 数据库驱动工厂
│   │       └── integration.ts      # Astro 集成
│   ├── auth/               # Lucia v3 会话认证
│   ├── api/                # Hono 路由基础
│   └── ui/                 # 共享 React 组件库
├── plugins/                # 第一方插件
│   ├── seo/                # SEO 插件 (参考实现)
│   ├── ads-manager/        # 广告管理插件 (高级示例)
│   ├── editor-upload/      # 编辑器增强上传插件
│   └── multilingual/       # 多语言插件
├── themes/                 # 主题
│   └── default/            # 默认主题
├── pnpm-workspace.yaml     # 工作区配置
└── turbo.json              # Turborepo 管道配置
```

### 1.3 请求生命周期

**Admin 端：**
```
HTTP 请求
  → Astro middleware (apps/admin/src/middleware.ts)
      1. 连接数据库 (单例，跨请求复用)
      2. 从 wp_options 加载自定义文章类型/分类法/字段组到 Registry
      3. 引导插件 (bootstrapPlugins，每进程仅一次)
      4. 检查安装完成状态 (未完成则重定向到 /setup)
      5. 验证会话 Cookie → Astro.locals.user
  → 页面/API 路由处理器
```

**Web 端：**
```
HTTP 请求
  → Astro middleware (apps/web/src/middleware.ts)
      连接数据库
  → 页面处理器
      从 DB 查询文章/页面
      服务端渲染内容
      返回 HTML
```

---

## 二、插件系统架构

AstroPress 插件系统支持两种类型：

| 类型 | 描述 | 分发方式 | 服务端逻辑 | 需要重新构建 |
|------|------|----------|-----------|-------------|
| **Code Plugin** (代码插件) | 完整的 npm 包，可注册类型/分类法/面板/路由/中间件 | 代码安装 + `plugins.ts` 注册 | ✅ 支持 | ✅ 是 |
| **Light Plugin** (轻量插件) | 纯 JSON 配置，仅定义文章类型/分类法/面板 | 上传 `.zip` 文件 | ❌ 不支持 | ❌ 否 |

### 2.1 插件加载机制

```typescript
// packages/core/src/plugins/loader.ts
const plugins = new Map<string, RegisteredPlugin>();

export function definePlugin(config: PluginConfig): PluginConfig {
  return config;
}

export function loadPlugin(config: PluginConfig): void {
  if (plugins.has(config.name)) return;  // 防止重复加载
  plugins.set(config.name, { config, loaded: false });
  try {
    config.register();                     // 执行注册逻辑
    plugins.get(config.name)!.loaded = true;
  } catch (err) {
    console.error(`[astropress] Plugin "${config.name}" failed to register:`, err);
  }
}
```

### 2.2 插件注册 API

插件在 `register()` 函数中可调用以下注册 API：

| API | 功能 | 示例 |
|-----|------|------|
| `registerPostType(slug, config)` | 注册自定义文章类型 | 产品、书籍、事件等 |
| `registerTaxonomy(slug, config)` | 注册自定义分类法 | 产品分类、标签等 |
| `registerSidebarPanel(id, config)` | 注册编辑器侧边栏面板 | SEO 面板、自定义字段面板 |
| `registerFieldGroup(group)` | 注册 ACF 风格字段组 | 书籍详情字段组 |
| `registerAIAction(action)` | 注册 AI 助手动作 | AI 生成内容、AI 优化等 |

### 2.3 数据存储约定

插件数据可存储在以下位置：

| 存储方式 | 用途 | 示例 |
|---------|------|------|
| `wp_postmeta` | 文章元数据 | `_yoast_wpseo_title`、`_ml_group` |
| `wp_options` (JSON blob) | 插件配置/集合 | `astropress_ml_settings`、`astropress_light_plugins` |
| 自定义 API 路由 | 插件专属 CRUD | `/api/ap-ads/track`、`/api/ml/strings` |
| Astro Integration 注入路由 | 插件页面 | `/admin-ext/ads`、`/admin-ext/multilingual` |

---

## 三、Code Plugin 开发步骤（完整 npm 包插件）

### 步骤 1：规划插件功能

在编写代码之前，明确以下问题：

- **插件名称**：使用小写短横线命名，如 `my-plugin`
- **功能范围**：需要注册哪些文章类型/分类法？
- **是否需要管理界面**：是否需要自定义 Admin 页面？
- **是否需要 API 端点**：是否需要自定义 REST API？
- **是否需要前台功能**：是否影响公共网站渲染？
- **数据存储方式**：使用 `wp_postmeta`、`wp_options` 还是两者兼有？

### 步骤 2：创建插件目录结构

```bash
# 在 plugins/ 目录下创建新插件
mkdir -p plugins/my-plugin/src
```

**基础目录结构（简单插件）：**
```
plugins/my-plugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts          # definePlugin 导出
```

**完整目录结构（高级插件，含 Admin/Web 集成）：**
```
plugins/my-plugin/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                    # definePlugin 导出
    ├── integration.admin.ts        # Admin 端 Astro 集成 (注入路由/中间件)
    ├── integration.ts              # Web 端 Astro 集成 (注入路由/中间件)
    ├── middleware.ts               # Web 端中间件 (可选)
    ├── install.ts                  # 安装/数据迁移逻辑 (可选)
    ├── admin/                      # Admin 页面 (可选)
    │   ├── index.astro             # 管理页面
    │   └── api/                    # Admin API
    │       └── handler.ts
    ├── routes/                     # Web 端路由 (可选)
    │   └── api/
    │       └── handler.ts
    ├── scripts/                    # 客户端脚本 (可选)
    │   └── client.js
    ├── lib/                        # 内部工具库
    │   ├── types.ts
    │   └── helpers.ts
    └── types/                      # 类型声明 (可选)
        └── raw.d.ts
```

### 步骤 3：创建 `package.json`

```json
{
  "name": "@astropress/plugin-my-plugin",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@astropress/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

**如果插件需要 Astro 集成（注入路由/中间件），添加额外导出和依赖：**

```json
{
  "name": "@astropress/plugin-my-plugin",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./integration": "./src/integration.ts",
    "./integration.admin": "./src/integration.admin.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@astropress/core": "workspace:*",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "astro": "^4.0.0",
    "typescript": "^5.4.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

### 步骤 4：创建 `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

> 注意：如果项目根目录没有 `tsconfig.base.json`，可参考其他插件的配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### 步骤 5：编写插件入口 `src/index.ts`

#### 5.1 简单插件（仅注册类型/面板）

```typescript
// plugins/my-plugin/src/index.ts
import { definePlugin, registerPostType, registerTaxonomy, registerSidebarPanel } from "@astropress/core";

export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",
  description: "我的自定义插件 — 注册产品文章类型和分类法",

  register() {
    // 注册自定义文章类型
    registerPostType("product", {
      label: "产品",
      pluralLabel: "产品",
      icon: "bag",
      public: true,
      showInMenu: true,
      hierarchical: false,
      supports: ["title", "editor", "thumbnail", "custom-fields"],
      custom: true,
    });

    // 注册自定义分类法
    registerTaxonomy("product_category", {
      label: "产品分类",
      pluralLabel: "产品分类",
      hierarchical: true,
      postTypes: ["product"],
      public: true,
      custom: true,
    });

    // 注册编辑器侧边栏面板
    registerSidebarPanel("product-price", {
      id: "product-price",
      title: "产品价格",
      postTypes: ["product"],
      // componentId 必须匹配 apps/admin/src/islands/ 中的 React Island 文件名
      componentId: "ProductPricePanel",
    });
  },
});
```

#### 5.2 高级插件（含 Astro 集成）

```typescript
// plugins/my-plugin/src/index.ts
import { definePlugin, registerPostType } from "@astropress/core";
import { ensureMyPluginInstalled } from "./install";

/**
 * 我的插件 — 包含 Admin 管理页面和 Web 端功能。
 * 运行时逻辑在 Astro 集成中处理：
 *   ./integration        → Web 端 (公共路由 + 中间件)
 *   ./integration.admin  → Admin 端 (管理 UI + API)
 */
export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",
  description: "高级插件示例，包含自定义路由、管理界面和中间件。零核心修改。",

  register() {
    // 注册自定义文章类型
    registerPostType("my_type", {
      label: "我的类型",
      pluralLabel: "我的类型",
      icon: "folder",
      public: true,
      showInMenu: true,
      supports: ["title", "editor", "custom-fields"],
      custom: true,
    });

    // 其他注册逻辑...
  },
});

export { ensureMyPluginInstalled };
```

### 步骤 6：编写 Astro 集成（高级插件）

#### 6.1 Admin 端集成 `src/integration.admin.ts`

```typescript
// plugins/my-plugin/src/integration.admin.ts
import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin 端集成：在 /admin-ext/ 下注入管理页面和 API。
 * /admin-ext/* 路径自动受 apps/admin middleware 的会话保护。
 */
export default function myPluginAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-my-plugin-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 注入 Admin 管理页面
        injectRoute({
          pattern: "/admin-ext/my-plugin",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });

        // 注入 Admin API 端点
        injectRoute({
          pattern: "/admin-ext/api/my-plugin/items",
          entrypoint: p("admin", "api", "items.ts"),
          prerender: false,
        });

        // 可选：注入 Admin 中间件
        // addMiddleware({ entrypoint: p("middleware.admin.ts"), order: "post" });
      },
    },
  };
}
```

#### 6.2 Web 端集成 `src/integration.ts`

```typescript
// plugins/my-plugin/src/integration.ts
import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Web 端集成：公共 API 端点 + 渲染中间件。
 * 零核心文件修改 — 全部通过 Astro Integration API 注入。
 */
export default function myPluginIntegration(): AstroIntegration {
  return {
    name: "astropress-my-plugin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 注入公共 API 路由
        injectRoute({
          pattern: "/api/my-plugin/data",
          entrypoint: p("routes", "api", "data.ts"),
          prerender: false,
        });

        // 注入 Web 端中间件 (例如：注入 head 标签、修改响应)
        addMiddleware({
          entrypoint: p("middleware.ts"),
          order: "post",
        });
      },
    },
  };
}
```

### 步骤 7：编写 Admin 管理页面

```astro
<!-- plugins/my-plugin/src/admin/index.astro -->
---
// Admin 管理页面示例
// 注意：/admin-ext/* 路径自动受会话保护
const db = Astro.locals.db;
if (!Astro.locals.user || !db) return Astro.redirect("/login");
---

<html>
<head>
  <title>我的插件管理</title>
</head>
<body>
  <h1>我的插件管理页面</h1>
  <!-- 管理界面内容 -->
</body>
</html>
```

### 步骤 8：编写 API 端点

```typescript
// plugins/my-plugin/src/admin/api/items.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 使用 wp_options 存储插件数据
  // 或者使用 Drizzle ORM 直接查询
  const data = { items: [] };

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  // 处理数据...

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

### 步骤 9：编写 Web 端中间件（可选）

```typescript
// plugins/my-plugin/src/middleware.ts
import type { MiddlewareResponseHandler } from "astro";

const handler: MiddlewareResponseHandler = async (context, next) => {
  // 前置处理
  const response = await next();

  // 后置处理 — 例如注入 <head> 标签
  // 注意：仅在 HTML 响应时操作
  if (response.headers.get("content-type")?.includes("text/html")) {
    let html = await response.text();
    // 修改 HTML...
    return new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  }

  return response;
};

export const onRequest = handler;
```

### 步骤 10：编写安装/数据迁移逻辑（可选）

```typescript
// plugins/my-plugin/src/install.ts
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";

/**
 * 确保插件数据已初始化。
 * 在 middleware 或 integration 中调用。
 */
export async function ensureMyPluginInstalled(db: any): Promise<void> {
  // 检查是否已安装
  const existing = await db
    .select()
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "my_plugin_installed"))
    .get();

  if (existing) return;

  // 初始化插件数据
  await db.insert(wpOptions).values({
    optionName: "my_plugin_settings",
    optionValue: JSON.stringify({
      enabled: true,
      apiKey: "",
    }),
    autoload: "yes",
  });

  await db.insert(wpOptions).values({
    optionName: "my_plugin_installed",
    optionValue: "1",
    autoload: "yes",
  });
}
```

### 步骤 11：编写 React Island 组件（侧边栏面板）

如果插件注册了 `registerSidebarPanel`，需要在 `apps/admin/src/islands/` 创建对应的 React Island 组件：

```tsx
// apps/admin/src/islands/ProductPricePanel.tsx
import { useState, useEffect } from "react";

interface ProductPricePanelProps {
  postId: number;
}

export default function ProductPricePanel({ postId }: ProductPricePanelProps) {
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 加载现有值
  useEffect(() => {
    fetch(`/api/posts/${postId}/meta`)
      .then((r) => r.json())
      .then((data) => {
        setPrice(data._product_price || "");
        setLoading(false);
      });
  }, [postId]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/posts/${postId}/meta`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _product_price: price }),
    });
    setSaving(false);
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div style={{ padding: "12px" }}>
      <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
        产品价格
      </label>
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{ width: "100%", padding: "6px", border: "1px solid #ddd", borderRadius: "4px" }}
        placeholder="输入价格"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: "8px",
          padding: "6px 16px",
          background: "#2271b1",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {saving ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
```

### 步骤 12：注册插件到系统

#### 12.1 在 `apps/admin/src/plugins.ts` 中加载插件

```typescript
// apps/admin/src/plugins.ts
import { loadPlugin } from "@astropress/core";
import seoPlugin from "@astropress/plugin-seo";
import myPlugin from "@astropress/plugin-my-plugin";  // ← 添加导入

let bootstrapped = false;

export function bootstrapPlugins(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  loadPlugin(seoPlugin);
  loadPlugin(myPlugin);  // ← 加载插件
}
```

#### 12.2 添加 workspace 依赖

在 `apps/admin/package.json` 中添加：

```json
{
  "dependencies": {
    "@astropress/plugin-my-plugin": "workspace:*"
  }
}
```

#### 12.3 如果插件有 Astro 集成，在 `astro.config.ts` 中注册

```typescript
// apps/admin/astro.config.ts
import myPluginAdminIntegration from "@astropress/plugin-my-plugin/integration.admin";

export default defineConfig({
  // ...
  integrations: [
    react(),
    astropress({ /* ... */ }),
    myPluginAdminIntegration(),  // ← 添加 Admin 集成
  ],
});
```

```typescript
// apps/web/astro.config.ts (如果插件有 Web 端集成)
import myPluginIntegration from "@astropress/plugin-my-plugin/integration";

export default defineConfig({
  // ...
  integrations: [
    astropress({ /* ... */ }),
    myPluginIntegration(),  // ← 添加 Web 集成
  ],
});
```

#### 12.4 安装依赖

```bash
# 从项目根目录运行
pnpm install
```

### 步骤 13：添加侧边栏菜单链接（可选）

如果插件需要在 Admin 侧边栏添加链接，编辑 `apps/admin/src/layouts/AdminLayout.astro`，在侧边栏导航中添加：

```astro
<a href="/admin-ext/my-plugin" class="sidebar-link">
  <Fragment set:html={getIcon("plugin-icon")} />
  <span>我的插件</span>
</a>
```

> 注意：图标需先在 `apps/admin/src/lib/icons.ts` 中注册。

### 步骤 14：测试与调试

```bash
# 启动开发服务器
pnpm dev

# 访问 Admin
# http://localhost:4321/admin

# 类型检查
pnpm typecheck

# 仅检查插件包
cd plugins/my-plugin && pnpm typecheck
```

---

## 四、Light Plugin 开发步骤（上传式轻量插件）

Light Plugin 是纯 JSON 配置，无需编写代码或重新构建，通过 Admin 后台上传 `.zip` 文件安装。

### 步骤 1：创建 `plugin.json`

```json
{
  "name": "my-light-plugin",
  "version": "1.0.0",
  "type": "light",
  "description": "轻量插件示例",
  "postTypes": [
    {
      "slug": "book",
      "label": "书籍",
      "pluralLabel": "书籍",
      "icon": "book",
      "public": true,
      "showInMenu": true,
      "hierarchical": false,
      "supports": ["title", "editor", "thumbnail", "custom-fields"],
      "custom": true
    }
  ],
  "taxonomies": [
    {
      "slug": "book_genre",
      "label": "书籍类型",
      "pluralLabel": "书籍类型",
      "hierarchical": true,
      "postTypes": ["book"],
      "public": true,
      "custom": true
    }
  ],
  "panels": [
    {
      "id": "book-details",
      "title": "书籍详情",
      "postTypes": ["book"],
      "componentId": "CustomFieldsPanel"
    }
  ]
}
```

### 步骤 2：打包为 `.zip`

```bash
# 确保 plugin.json 在 zip 根目录
cd my-light-plugin
zip -r ../my-light-plugin.zip plugin.json
```

### 步骤 3：通过 Admin 上传

1. 访问 **Admin → Plugins → Add New**
2. 选择 **Upload Plugin** 标签
3. 上传 `.zip` 文件
4. 点击 **Install** → **Activate**

### Light Plugin 限制

- ❌ 不能包含自定义代码逻辑
- ❌ 不能添加自定义 API 路由
- ❌ 不能添加 Admin 管理页面
- ❌ 不能添加中间件
- ✅ 可以注册自定义文章类型
- ✅ 可以注册自定义分类法
- ✅ 可以注册侧边栏面板（仅限内置 `componentId`）

---

## 五、插件 API 参考

### 5.1 `definePlugin(config)`

定义插件配置。

```typescript
interface PluginConfig {
  name: string;          // 插件唯一标识，小写短横线
  version: string;       // 语义化版本号
  description?: string;  // 插件描述
  register(): void;      // 注册函数，启动时调用一次
}
```

### 5.2 `registerPostType(slug, config)`

注册自定义文章类型。

```typescript
interface PostTypeConfig {
  label: string;           // 单数标签，如 "产品"
  pluralLabel: string;     // 复数标签，如 "产品"
  description?: string;    // 描述
  icon?: string;           // 图标名称 (来自 lib/icons.ts)
  public?: boolean;        // 是否公开 (默认 true)
  showInMenu?: boolean;    // 是否显示在侧边栏
  hierarchical?: boolean;  // 是否分层 (如页面)
  hasArchive?: boolean;    // 是否有归档页
  showInRest?: boolean;    // 是否在 REST API 中可见
  excludeFromSearch?: boolean;  // 是否从搜索中排除
  menuPosition?: number;   // 菜单位置
  supports?: Array<"title" | "editor" | "thumbnail" | "excerpt" | "custom-fields" | "author" | "comments" | "revisions">;
  custom?: boolean;        // 标记为自定义类型
}
```

**示例：**
```typescript
registerPostType("event", {
  label: "活动",
  pluralLabel: "活动",
  icon: "calendar",
  public: true,
  showInMenu: true,
  hierarchical: false,
  supports: ["title", "editor", "thumbnail", "custom-fields"],
  custom: true,
});
```

### 5.3 `registerTaxonomy(slug, config)`

注册自定义分类法。

```typescript
interface TaxonomyConfig {
  label: string;           // 单数标签
  pluralLabel: string;     // 复数标签
  description?: string;
  hierarchical?: boolean;  // true = 分类 (如 category)，false = 标签 (如 tag)
  postTypes: string[];     // 关联的文章类型
  public?: boolean;
  showInRest?: boolean;
  custom?: boolean;
}
```

**示例：**
```typescript
registerTaxonomy("event_category", {
  label: "活动分类",
  pluralLabel: "活动分类",
  hierarchical: true,
  postTypes: ["event"],
  public: true,
  custom: true,
});
```

### 5.4 `registerSidebarPanel(id, config)`

注册编辑器侧边栏面板。

```typescript
interface SidebarPanelConfig {
  id: string;              // 面板唯一 ID
  title: string;           // 面板标题
  postTypes: string[];     // 显示在哪些文章类型的编辑器中 (空数组 = 全部)
  componentId?: string;    // React Island 组件 ID (匹配 islands/ 中的文件名)
}
```

**示例：**
```typescript
registerSidebarPanel("event-details", {
  id: "event-details",
  title: "活动详情",
  postTypes: ["event"],
  componentId: "EventDetailsPanel",
});
```

### 5.5 `registerFieldGroup(group)`

注册 ACF 风格字段组。

```typescript
interface FieldGroup {
  id: string;
  key: string;             // group_xxxxxxxx
  title: string;
  fields: ACFField[];
  location: FieldGroupLocation[][];  // OR of AND 规则
  menuOrder: number;
  position: "normal" | "side" | "acf_after_title";
  labelPlacement: "top" | "left";
  instructionPlacement: "label" | "field";
  hideOnScreen: string[];
  active: boolean;
}
```

**支持的字段类型：**
`text`, `textarea`, `number`, `range`, `email`, `url`, `password`, `image`, `file`, `wysiwyg`, `oembed`, `gallery`, `select`, `checkbox`, `radio`, `button_group`, `true_false`, `link`, `post_object`, `page_link`, `relationship`, `taxonomy`, `user`, `google_map`, `date_picker`, `date_time_picker`, `time_picker`, `color_picker`, `message`, `accordion`, `tab`, `group`, `repeater`, `flexible_content`, `clone`

**示例：**
```typescript
registerFieldGroup({
  id: "event-fields",
  key: "group_event_fields",
  title: "活动信息",
  active: true,
  fields: [
    {
      id: "f1",
      key: "field_event_date",
      name: "event_date",
      label: "活动日期",
      type: "date_picker",
      instructions: "选择活动日期",
      required: true,
      conditionalLogic: false,
      wrapper: { width: "", class: "", id: "" },
    },
    {
      id: "f2",
      key: "field_event_location",
      name: "event_location",
      label: "活动地点",
      type: "text",
      instructions: "",
      required: false,
      conditionalLogic: false,
      wrapper: { width: "", class: "", id: "" },
    },
  ],
  location: [[{ param: "post_type", operator: "==", value: "event" }]],
  menuOrder: 0,
  position: "normal",
  labelPlacement: "top",
  instructionPlacement: "label",
  hideOnScreen: [],
});
```

### 5.6 `registerAIAction(action)`

注册 AI 助手动作。

```typescript
// 在 apps/admin/src/plugins.ts 中
import { registerAIAction } from "../lib/ai-registry";

registerAIAction({
  type: "myPlugin:doSomething",
  description: "动作描述 — 显示给 AI",
  example: '{"type":"myPlugin:doSomething","param":"value"}',
  serverSide: true,
  handler: async (params, db, userId) => {
    // 使用 db 执行操作
    return { success: true, message: "完成。", navigate: "/admin/..." };
  },
});
```

---

## 六、进阶模式

### 6.1 使用 `wp_options` 存储插件配置

```typescript
import { getOption, updateOption } from "@astropress/core/query";

// 读取插件配置
const settings = await getOption(db, "my_plugin_settings");
const config = settings ? JSON.parse(settings) : { enabled: true };

// 更新插件配置
await updateOption(db, "my_plugin_settings", JSON.stringify(config), "yes");
```

### 6.2 使用 `wp_postmeta` 存储文章元数据

```typescript
import { getField, updatePostMeta } from "@astropress/core/query";

// 读取文章元数据
const price = await getField(db, postId, "_product_price");

// 更新文章元数据
await updatePostMeta(db, postId, "_product_price", "99.99");
```

### 6.3 客户端脚本注入

插件可以通过中间件在 Admin 页面注入客户端脚本：

```typescript
// plugins/my-plugin/src/middleware.admin.ts
import type { MiddlewareResponseHandler } from "astro";

const handler: MiddlewareResponseHandler = async (context, next) => {
  const response = await next();

  if (
    response.headers.get("content-type")?.includes("text/html") &&
    context.url.pathname.startsWith("/admin")
  ) {
    let html = await response.text();
    // 在 </head> 前注入脚本
    html = html.replace(
      "</head>",
      `<script src="/api/my-plugin/client.js"></script></head>`
    );
    return new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  }

  return response;
};

export const onRequest = handler;
```

### 6.4 数据查询助手

在 `.astro` 页面中使用查询助手：

```astro
---
import { queryPosts, getField, getPostTerms, getSiteInfo } from "@astropress/core/query";

const db = Astro.locals.db;

// 类似 WP_Query
const { posts, total, pages } = await queryPosts(db, {
  type: "product",
  perPage: 12,
  orderBy: "title",
  order: "asc",
});

// 类似 ACF get_field
const price = await getField(db, post.id, "price");

// 类似 get_the_terms
const categories = await getPostTerms(db, post.id, "product_category");

// 类似 get_bloginfo
const site = await getSiteInfo(db);
---
```

| 函数 | WordPress 等价 |
|------|---------------|
| `queryPosts(db, args)` | `WP_Query` |
| `getPost(db, idOrSlug, type?)` | `get_post()` |
| `getPostById(db, id)` | `get_post()` |
| `getPostBySlug(db, slug, type?)` | `get_page_by_path()` |
| `getField(db, postId, key)` | ACF `get_field()` |
| `getFields(db, postId)` | 所有 meta 为 `Record<string,string>` |
| `getTerms(db, taxonomy, args?)` | `get_terms()` |
| `getPostTerms(db, postId, taxonomy)` | `get_the_terms()` |
| `getOption(db, name, fallback?)` | `get_option()` |
| `getSiteInfo(db)` | `get_bloginfo()` |

---

## 七、现有插件参考

| 插件 | 类型 | 复杂度 | 主要功能 |
|------|------|--------|---------|
| `seo` | 简单 Code Plugin | ⭐ | 注册侧边栏面板，使用 `wp_postmeta` 存储 SEO 数据 |
| `ads-manager` | 高级 Code Plugin | ⭐⭐⭐ | 注册文章类型 + Admin 管理页面 + Web 端追踪 API + 中间件 |
| `editor-upload` | 高级 Code Plugin | ⭐⭐ | 注入客户端脚本 + 自定义上传端点 + 中间件 |
| `multilingual` | 高级 Code Plugin | ⭐⭐⭐⭐ | Admin 管理界面 + Web 端多语言渲染 + sitemap + 中间件 |

---

## 八、最佳实践

### 8.1 命名规范

- **插件名称**：小写短横线，如 `my-plugin`、`ads-manager`
- **包名**：`@astropress/plugin-my-plugin`
- **文章类型 slug**：小写下划线，如 `product`、`event`
- **分类法 slug**：小写下划线，如 `product_category`
- **wp_postmeta key**：下划线前缀，如 `_product_price`
- **wp_options key**：插件前缀，如 `my_plugin_settings`

### 8.2 零核心修改原则

- ✅ 使用 Astro Integration API (`injectRoute`, `addMiddleware`) 注入路由和中间件
- ✅ 使用 Registry API 注册类型和面板
- ✅ 使用 `wp_options` 和 `wp_postmeta` 存储数据
- ❌ 不要修改 `packages/core` 中的代码
- ❌ 不要修改 `apps/admin` 或 `apps/web` 中的核心文件（除 `plugins.ts` 和 `astro.config.ts`）

### 8.3 数据存储建议

| 数据类型 | 推荐存储方式 |
|---------|-------------|
| 插件全局配置 | `wp_options` (JSON blob) |
| 每篇文章的元数据 | `wp_postmeta` |
| 插件集合数据 | `wp_options` (JSON array) |
| 大量结构化数据 | 考虑自定义 API + `wp_options` |

### 8.4 安全注意事项

- 所有 Admin API 端点必须验证 `locals.user`（会话认证）
- `/admin-ext/*` 路径自动受 Admin 中间件保护
- 公共 API 端点（如 `/api/forms/submit`）需要在 middleware 中白名单
- 文件上传需进行 MIME 类型检测和扩展名白名单验证
- SVG 上传需进行消毒处理

### 8.5 图标使用

- 文章类型的 `icon` 字段存储图标名称字符串（如 `"bag"`），不是 emoji
- 新图标需先在 `apps/admin/src/lib/icons.ts` 中注册
- 管理界面使用 `getIcon(name)` 或 `adminIcons` 对象

### 8.6 前端链接

- Admin 中所有指向前台站点的链接必须使用 `siteUrl`（从 `wp_options` 读取）
- 不要使用相对路径如 `/${slug}`
- 使用 `getSiteUrl(db)` 获取站点 URL

---

## 九、完整示例：产品目录插件

以下是一个完整的产品目录插件示例，展示所有关键模式：

### 目录结构
```
plugins/product-catalog/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── integration.admin.ts
    ├── install.ts
    ├── admin/
    │   ├── index.astro
    │   └── api/
    │       ├── settings.ts
    │       └── products.ts
    └── lib/
        └── types.ts
```

### `package.json`
```json
{
  "name": "@astropress/plugin-product-catalog",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./integration.admin": "./src/integration.admin.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@astropress/core": "workspace:*",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "astro": "^4.0.0",
    "typescript": "^5.4.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

### `src/index.ts`
```typescript
import { definePlugin, registerPostType, registerTaxonomy, registerSidebarPanel } from "@astropress/core";

export default definePlugin({
  name: "product-catalog",
  version: "1.0.0",
  description: "产品目录管理 — 自定义文章类型、分类法、价格面板",

  register() {
    registerPostType("product", {
      label: "产品",
      pluralLabel: "产品",
      icon: "bag",
      public: true,
      showInMenu: true,
      hierarchical: false,
      supports: ["title", "editor", "thumbnail", "custom-fields"],
      custom: true,
    });

    registerTaxonomy("product_category", {
      label: "产品分类",
      pluralLabel: "产品分类",
      hierarchical: true,
      postTypes: ["product"],
      public: true,
      custom: true,
    });

    registerTaxonomy("product_tag", {
      label: "产品标签",
      pluralLabel: "产品标签",
      hierarchical: false,
      postTypes: ["product"],
      public: true,
      custom: true,
    });

    registerSidebarPanel("product-price", {
      id: "product-price",
      title: "产品价格",
      postTypes: ["product"],
      componentId: "CustomFieldsPanel",
    });
  },
});
```

---

## 十、常见问题

### Q1: 插件加载顺序有影响吗？
插件按 `plugins.ts` 中 `loadPlugin()` 的调用顺序加载。`loadPlugin` 内部有去重保护，同一插件不会重复注册。

### Q2: 插件可以在运行时动态安装吗？
Code Plugin 需要修改代码并重新构建。Light Plugin 可以通过 Admin 后台上传 `.zip` 文件动态安装，无需重新构建。

### Q3: 如何调试插件？
1. 使用 `console.log` 在 `register()` 函数中输出调试信息
2. 检查 `pnpm dev` 的终端输出
3. 使用浏览器开发者工具查看 API 请求
4. 运行 `pnpm typecheck` 检查类型错误

### Q4: 插件可以依赖其他插件吗？
可以。在 `register()` 函数中使用 `isPluginLoaded(name)` 检查依赖插件是否已加载：

```typescript
import { isPluginLoaded } from "@astropress/core";

register() {
  if (!isPluginLoaded("seo")) {
    console.warn("my-plugin: SEO plugin is recommended but not loaded.");
  }
  // ...
}
```

### Q5: 如何在前台渲染自定义文章类型？
前台 `apps/web` 使用 `queryPosts` 查询文章，支持 `type` 参数。自定义文章类型会自动出现在查询结果中：

```astro
---
import { queryPosts } from "@astropress/core/query";
const db = Astro.locals.db;
const { posts } = await queryPosts(db, { type: "product", perPage: 12 });
---
```

### Q6: 如何添加自定义图标？
在 `apps/admin/src/lib/icons.ts` 中添加 SVG 图标：

```typescript
export const adminIcons = {
  // ... 现有图标
  "my-icon": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><!-- SVG 内容 --></svg>`,
};
```

---

## 十一、开发工作流总结

```
1. 规划功能 → 确定插件类型 (Code / Light)
2. 创建目录 → plugins/my-plugin/
3. 编写 package.json → 配置包名、导出、依赖
4. 编写 index.ts → definePlugin + register()
5. [高级] 编写 integration.admin.ts → Admin 集成
6. [高级] 编写 integration.ts → Web 集成
7. [高级] 编写 Admin 页面和 API
8. [高级] 编写 React Island 组件
9. 注册插件 → plugins.ts + package.json + astro.config.ts
10. 安装依赖 → pnpm install
11. 测试 → pnpm dev + pnpm typecheck
12. 文档 → README.md
```

---

*本文档最后更新：2026-09-11*