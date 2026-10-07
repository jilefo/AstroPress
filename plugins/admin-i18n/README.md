# @astropress/plugin-admin-i18n

后台界面中文翻译插件。对 AstroPress admin（`/admin/*` 与 `/admin-ext/*`）做客户端 DOM 文本替换翻译：内置 zh-CN 词典即时生效；词典未命中的字符串自动批量发送到你配置的 **n8n webhook** 翻译，结果缓存在浏览器 localStorage，同一字符串只问一次。

零核心修改：不改动 `apps/`、`packages/` 任何源文件，仅通过 Astro integration 装配。

## 工作原理

```
admin 页面 (post 中间件注入 <script src="/api/ap-i18n/script.js" defer>)
    │
    ├─ 内置词典（src/lib/dictionary.ts，816 条，随脚本内嵌下发）
    ├─ localStorage 缓存（ap-i18n-cache-v1，n8n 结果，同串只问一次）
    │
    ├─ TreeWalker 替换文本节点（保留首尾空白）+ placeholder/title/aria-label/data-placeholder
    ├─ MutationObserver 跟随 React 重渲染（120ms 去抖）
    │
    └─ 未命中串 → 1.5s 去抖批量 POST /api/ap-i18n/translate（登录保护代理）
            └─ 服务端转发 n8n webhook（URL 不下发到浏览器）
```

**跳过区域**（不会被翻译）：编辑器内容（`[data-ap-editor]`、`.ap-wysiwyg-editor`、contenteditable、textarea/code/pre）、`script/style/svg`，以及右下角 AI 助手浮窗（`position:fixed` 且 z-index ≥ 9999x 的容器）——聊天内容属用户数据，不参与翻译。

**动态拼接串**：服务端渲染会把 `Howdy, {用户名}` 合并为单个文本节点，整串精确匹配失败，故提供前缀规则（`Howdy, ` → `你好，`、`Welcome, ` → `欢迎，`、`Edit User: ` / `Edit Menu: ` / `Edit Form: ` / `Entries: ` / `Edit: `、`No posts with status` / `No pages with status` / `No files matching` / `Uploading ` 等），只替换稳定前缀、保留动态尾部。

## n8n Webhook 契约

**标准格式**（推荐）：

```
POST <webhook-url>
{ "texts": ["Dashboard", "Add New"], "target": "zh-CN" }

→ 200
{ "translations": { "Dashboard": "仪表盘", "Add New": "新建" } }
```

**兼容格式**：扁平 map、`{"data": {...}}` 包装、行数组 `[{original, translation}]`（键名宽松匹配：original|source|text|key|en|input ↔ translation|translated|target|zh|value|output|result）。仅请求中的原文会被回填，多余内容忽略。

n8n 侧建议：Webhook 节点接收 `{texts, target}` → 接 LLM/翻译表 → Respond to Webhook 返回 `{translations}`。

## Webhook URL 配置

优先级：管理页设置（存 `wp_options.astropress_i18n_settings`）> 环境变量 `AP_N8N_WEBHOOK_URL`。

```
# .env
AP_N8N_WEBHOOK_URL=https://your-n8n.example.com/webhook/translate
```

未配置 webhook 时插件照常工作（仅内置词典生效），未命中串只记录不请求。

## 管理页

`/admin-ext/i18n`（后台侧边栏底部"界面翻译"入口）：

- 启用/禁用翻译、目标语言（BCP-47）、webhook URL 设置
- 一键测试 webhook（显示请求/响应与耗时）
- 查看浏览器缓存条数、未命中串列表（可在 n8n 侧补充后清缓存重试）
- 清空本地缓存（重新询问 n8n）

设置改动保存后，刷新页面即生效（脚本 `Cache-Control: no-store`）。

## 装配（已接入，升级按此核对）

1. `apps/admin/package.json` → `"@astropress/plugin-admin-i18n": "workspace:*"`
2. `apps/admin/astro.config.ts` → `import adminI18nIntegration from "@astropress/plugin-admin-i18n/integration.admin"` + `integrations: [ ..., adminI18nIntegration() ]`
3. `apps/admin/src/plugins.ts` → `import adminI18nPlugin from "@astropress/plugin-admin-i18n"` + `loadPlugin(adminI18nPlugin)`

## 路由

| 路由 | 说明 |
|---|---|
| `/api/ap-i18n/script.js` | 客户端引擎（词典+配置内嵌，no-store） |
| `/api/ap-i18n/translate` | n8n 代理（登录保护、CSRF 校验、≤40 串/批、12s 超时） |
| `/admin-ext/i18n` | 管理页 |
| `/admin-ext/api/i18n/settings` | 设置 GET/PUT |
| `/admin-ext/api/i18n/test` | webhook 测试 POST（GET 返回契约说明） |

## 扩充词典

直接编辑 `src/lib/dictionary.ts`（键为去除首尾空白、连续空白折叠后的原文，值为 zh-CN）。开发时保存即生效（vite 热载）；升级插件不会丢词典，因为词典在本包内。
