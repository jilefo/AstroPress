# AstroPress v1.0.3 发布说明

发布日期：2026-10-06
对应线上版本：Cloudflare Workers `fa77bbf7-56e8-48b7-895c-147bf74b9ab0`
校验和：见 [checksums.txt](checksums.txt)（SHA256）

## 本版概要

v1.0.3 是安全与质量加固版，来自对生产站第六轮「每插件每功能真实测试」。
无数据库结构变更，可直接覆盖部署。

本轮首次完成 **11 个已安装主题逐一真实切换渲染**、**后台 HTML 安全响应头
存在性审计**，并用真实浏览器验证了后台侧栏 12 个功能分组与前台桌面/移动端视觉。

## 修复

### 1. 后台所有 HTML 页面缺少安全响应头（安全加固）

安全头插件早期为避免 CSP 误伤后台大量内联脚本，将 `/admin*` 整体排除在
响应头注入之外——导致后台页面既没有 CSP，也没有 nosniff、点击劫持防护与
Referrer 策略，属于过度排除。

现对后台 `text/html` 响应注入安全子集：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

仍不向后台注入 CSP / HSTS / Permissions-Policy（避免阻断后台内联脚本与
嵌入式预览）；注入逻辑异常时 fail-open，不影响任何页面可用性。
前台安全头策略不变，已回归验证。

### 2. 三处插件管理接口英文报错中文化扫尾

- 网站目录分类：`sort must be a number`、`not found`（×2）
  → 「排序值必须是数字」「分类不存在」
- 网站目录链接：`invalid status`、`invalid clicks`、`not found`（×2）
  → 「状态值不合法（pending/approved）」「点击数必须是非负整数」「链接不存在」
- 插件启停：`invalid slug`、`enabled must be boolean`
  → 「插件标识不合法（仅允许小写字母、数字、短横线）」「启用状态必须是布尔值 true/false」

均为纯文案修改，HTTP 状态码与业务逻辑不变。

## 质量验证（生产环境真实测试）

- 11 个主题逐一激活：首页 + 文章页全部 200、样式完整、无错误指纹、无资产 404，测后还原 NexT
- 网站目录分类与链接全生命周期 CRUD 14/14：pending 隔离、批准后前台可见（页面缓存写后自动失效）、
  非空分类拒绝删除、`javascript:` URL 与非法参数中文拦截、测后数据零残留
- 插件管理器启停闭环 11/11：禁用后该插件路由即时 404、前台不受影响、恢复后正常；测试插件已还原启用
- 广告槽位保存往返一致；相关文章追踪像素 GET 返回 1×1 GIF
- sitemap.xml / rss.xml XML 良构，robots.txt 含 Sitemap 声明
- 畸形输入（坏 JSON、非法百分号编码、超长搜索词、非数组事件包）全部返回中文响应，无 5xx
- 真实浏览器：侧栏 12 个功能分组折叠/展开/当前页高亮正常，设置子菜单零插件链接残留；
  前台首页、文章页、网站目录、中文 404 页在桌面与 375px 移动视口下排版正常、无裂图
- 全插件冒烟 108/108；50 个后台页内联脚本语法检查 0 错误

## 部署说明

- Node.js 部署：更新源码后 `pnpm install && pnpm build`。
- Cloudflare 部署：`pnpm run build:cf && pnpm exec wrangler deploy`。
- 无数据迁移。

## 已知平台限制（Cloudflare Workers）

以下 6 个插件在 Cloudflare 部署中被平台能力自动屏蔽（页面 404、入口零痕迹），
Node.js 部署下功能完整：static-html、ai-chat、backup、git-sync、file-manager、webdav。

## 已知小项（不影响安全与使用）

未匹配的 `POST /api/*` 路由当前返回中文兜底 HTML 页（非英文裸错、非 5xx），
后续版本计划在适配器层统一为 404 JSON。
