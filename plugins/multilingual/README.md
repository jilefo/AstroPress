# @astropress/plugin-multilingual

多语言插件（零核心修改）。完整设计见 `docs/plugins/01-multilingual.md`。

## 架构

- **web**：`integration.ts` — 注入 `/ml-asset/config`、`/api/ml/strings`、`/sitemap.xml`、`/ml/[...path]` 渲染页、切换器脚本（`injectScript`）、head 注入中间件（`addMiddleware("post")`，在根中间件设置 `locals.db` 之后运行）。**注意**：切换器脚本与配置端点刻意放在 `/ml-asset/*` 而非 `/api/*`——核心中间件对 `/api/*` 要求登录会话，匿名访客会拿不到切换器，且 `/ml-asset` 避开了 `/ml/**` 渲染器路由；head 注入保留 `</head>` 闭合标签（下游中间件依赖它）。`/ml` 渲染器解析基准内容时覆盖 `post`/`page` 及全部 `public` 自定义文章类型（经 `getCustomPostTypes()` 动态读取，媒体/菜单自动排除）。
- **admin**：`integration.admin.ts` — 注入 `/admin-ext/multilingual` 管理页与 `/admin-ext/api/ml/*`（该前缀受 admin 中间件会话保护，`middleware.ts` 的 `startsWith("/admin")` 规则）。侧栏语言面板 `postTypes: []`（registry 语义为不限制），因此 post、page、CPT 三类编辑页均可管理翻译组；链接 API 本身按 post-id 运作，与类型无关。
- **编辑页语言面板**：核心编辑器把注册的 sidebar panel 渲染成空盒子（仅 SeoPanel 挂了 island，`MultilingualPanel.tsx` 岛从未被引用），page 编辑器甚至不渲染 panel。故 admin 侧新增 `admin-middleware.ts`（post，注入 `/ml-asset/panel.js`）：脚本在 post/CPT 编辑页填充空 Language 盒子、在 page 编辑器按现有样式创建盒子，用原生 DOM 复刻面板（语言下拉 + 保存 + 翻译组链接管理），数据走同一批 `/admin-ext/api/ml/*` 端点。URL 无数字 post id（如尚未生成草稿 id 的新建页）时自动跳过。
- **数据**：`wp_options.astropress_ml_settings`（语言配置）、`astropress_ml_strings_<code>`（字符串包）、`wp_postmeta._ml_group`/`_ml_lang`（翻译组，每语言一篇独立文章 → 天然继承 SEO 插件 per-post meta）。

## 安装（单应用：web 与 admin 装进同一个 astro.config.ts）

```ts
// apps/admin/astro.config.ts
import mlWebIntegration from "@astropress/plugin-multilingual/integration";
import mlAdminIntegration from "@astropress/plugin-multilingual/integration.admin";
integrations: [..., mlWebIntegration(), mlAdminIntegration()]

// apps/admin/src/plugins.ts（注册侧栏语言面板）
import multilingualPlugin from "@astropress/plugin-multilingual";
loadPlugin(multilingualPlugin);
```

## 使用

1. 访问 `/admin-ext/multilingual`：启用语言、选择 URL 策略（子目录 / 参数）、保存。
2. 翻译组：输入基准文章 ID → 加载 → 输入语言与翻译文章 ID → Link。
3. 前台：`/{lang}/{slug}`（子目录）或 `?lang=`（参数）；`<div data-ml-switcher>` 或自动浮动切换器。
4. SEO：canonical/hreflang/OG 自动注入；`/sitemap.xml` 含 `xhtml:link`。

## 限制（如实声明）

- 后台 UI 本体文案为硬编码英文，无翻译钩子（可后续加 DOM 替换脚本）。
- `/ml/**` 的 block 渲染为精简版（hero/text/image/columns/features/cta/spacer/divider/html）；像素级一致请用经典编辑器翻译。
- 细粒度权限（谁可管理翻译）需核心 capabilities 支持，当前仅登录管理员。

## 卸载

移除装配行即完全停用；数据清理 SQL 见设计文档 §10。