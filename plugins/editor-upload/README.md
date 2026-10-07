# @astropress/plugin-editor-upload

编辑器上传增强插件（零核心修改，不触碰 BlockEditor/ThemeEditor 源文件）。完整设计见 `docs/plugins/03-editor-upload.md`。

## 架构

- **编辑器增强**（`scripts/editor-upload.js`，经 `injectScript` 注入每个 admin 页面）：
  - **capture 阶段** `paste`/`drop` 事件委托，目标 `.ap-wysiwyg-editor`：文件先经插件处理（`preventDefault + stopImmediatePropagation` 阻断编辑器自带纯文本粘贴分支）→ 队列上传（XHR 进度）→ `execCommand("insertHTML")` 插入。标准 DOM 语义，非 monkey patch。
  - **工具栏增强**（均在工具栏尾部追加，带 data-ap-btn 标记，插件卸载即消失）：
    - `Size` 字号下拉（12–32px）：对选中文字应用内联 `span font-size`（range 包裹，非 execCommand fontSize），选择器抢焦点前后自动保存/恢复选区。
    - `❮❯` HTML 源码视图切换：深色等宽 textarea 覆盖编辑区，输入时**实时镜像**回编辑器（源码模式下保存不丢内容），再次点击应用并切回。
    - `▣` 媒体库按钮：自建媒体模态框（官方 `GET /api/media` 分页/搜索 + 增强上传 + 官方 `DELETE /api/media/[id]`）。
  - **锚点说明**：核心 BlockEditor 的工具栏容器**无任何 class**（仅按钮有 `.ap-wysiwyg-toolbar-btn`），`.ap-wysiwyg-toolbar` 选择器永远匹配不到。因此锚点解析顺序：`.ap-wysiwyg-toolbar` 类 → 编辑器的 `previousElementSibling`（DOM 位置定位）。注入用 600ms 间隔重试直至按钮出现（React island 异步挂载）。
  - 插入 HTML 自带 `alt` / `loading="lazy"` / `decoding="async"`（SEO 友好）。
- **增强上传 API**（`routes/api/upload.ts`）：扩展名白名单、**魔数 MIME 嗅探**、大小限制、SVG 消毒（`sanitizeSvg` 自研零依赖）、会话校验；存储与落库完全复用官方 attachment 约定（R2 / `public/media`、`wp_posts` + `_wp_attached_file`）。
- **元数据 API**（`routes/api/meta.ts`）：title/caption/alt 聚合保存（post_title / post_excerpt / `_wp_attachment_image_alt`）。

## 安装

```ts
// apps/admin/astro.config.ts（web 端无需）
import editorUpload from "@astropress/plugin-editor-upload/integration.admin";
integrations: [..., editorUpload()]

// apps/admin/src/plugins.ts（可选）
import editorUploadPlugin from "@astropress/plugin-editor-upload";
loadPlugin(editorUploadPlugin);
```

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `AP_UPLOAD_MAX_MB` | 25 | 单文件上限 |
| `AP_UPLOAD_CONCURRENCY` | 3 | 上传并发数 |

## 停用恢复（验收标准）

移除装配行 → 注入脚本与增强路由消失：粘贴/拖拽恢复浏览器默认行为，工具栏无 ▣，模态框不存在。已上传文件保留在官方媒体库（标准 attachment 记录），内容中的 `<img>/<a>` 为标准 HTML 不受影响。

## 限制（如实声明）

- `srcset` 响应式依赖部署环境（如 Cloudflare Image Resizing）或未来核心缩略图能力；当前插入单尺寸 + lazy。
- 工具栏按钮依赖 `.ap-wysiwyg-toolbar` 选择器常量（集中定义于脚本头部）。
- ThemeEditor 已有原生 MediaPicker，本插件不重复覆盖（避免功能重叠）。