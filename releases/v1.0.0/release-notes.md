# AstroPress v1.0.0 发布说明

> 首个对外开源版本。发布日期：2026-10-04（V 轮复测后定稿 2026-10-05）。
> 部署版本号（CF Workers Version ID）：`a59fd167-0ae1-4538-b0e0-627a5a936171`

## 亮点

- **WordPress 风格后台**：仪表盘、文章/页面/表单、自定义字段、主题、菜单、用户、设置，全套 WP 习惯迁移零成本。
- **45+ 主题生态**：11 个生产可用主题（Base/Stack/Ayer/Butterfly/Fluid/Icarus/Keep/MengD/NexT/Redefine/Volantis），R 轮线上 11 主题×4 页面（首页/文章/搜索/404）共 44 项零 500 零英文错误标记。
- **50 成员插件合并为 9 大套件**：安全与防护、缓存与性能优化、编辑器增强、AI 与多语言、SEO 与内容、站点互动与营销、同步与备份、运维工具箱、后台增强。左侧栏 WordPress 式可折叠分组，级联启停。
- **Cloudflare Workers + D1 全栈适配**：插件状态跨 isolate 用 `json_patch` 原子合并，后台任务用 `waitUntil` 托管，公开端点统一在 `/api/*` 之外（`/ap-*`、`/ml-asset`），静态资产走 `_headers` 资产层规则。
- **AI 写作助手**：返回 GFM Markdown，支持 5 条输出硬约束 + 劣质回复检测；编辑已有文章时提示词携带原文。
- **AI 一键填写**：发布面板按一下即生成 SEO Title / Meta Description / Focus Keyword / Excerpt / Tags，只填空白字段，发布时可自动触发。

## 本版本关键修复（R 轮生产验收）

| 项 | 修复内容 |
|----|----------|
| redirect 中间件 | `order: "pre"` → `"post"`，确保核心中间件先注入 `locals.db`，再于路由 handler 前拦截 301/302。线上 4 条规则全部命中，循环检测/保留前缀/命中计数全部生效 |
| 测试基建 | R2 深度测试改用「不跟随重定向 opener」验证 302 + Location 头；多语言保存按对象数组契约；DB 浏览参数 `name=wp_posts&page=0`；审计/版本字段契约 `rows`/`items` |

## 平台能力差异

Cloudflare Workers 部署上**通过平台能力屏蔽**的成员（路由 404、菜单隐藏、插件管理页标记不可用）：

- `static-html`（依赖服务器文件系统写静态站）
- `ai-chat`（Playwright 浏览器自动化不兼容 Workers）
- `backup`（`fs` 全量备份不兼容 Workers）
- `git-sync`（`fs` 推送不兼容 Workers）
- `file-manager`（依赖服务器磁盘）
- `webdav`（WebDAV 协议语义无法在 R2/KV 实现原子能力）

Node.js / Docker / VPS 部署时上述 6 个插件**功能完整**。

## 部署

```powershell
# 1. 一键部署脚本（自动识别 D:\DevTools 绿色版 Node/Git/pnpm/wrangler）
python 部署AstroPress到Cloudflare.py

# 2. 手动部署
pnpm install
pnpm run build:cf
$env:XDG_CONFIG_HOME="D:\DevTools\wrangler"
npx wrangler deploy
```

## 升级注意事项

1. 本版本将 redirect 中间件从 `pre` 改为 `post`。**自定义插件**如果重写过 redirect 中间件需跟随调整。
2. R2 测试基线升级到 46/46，构建产物 `dist/_headers` 资产层规则覆盖 `/_astro/*` 与 `/media/*`。
3. 后台左侧栏新增分组折叠状态记忆（localStorage `ap_sb_<group-slug>`），用户首次进入会展开「当前页所在组」。

## 测试报告

- R1 全量冒烟：108/108 PASS（[logs/smoke_report.json](../../logs/smoke_report.json)）
- R2 深度功能：46/46 PASS（重定向 CRUD/循环检测/保留前缀、评论蜜罐+频控、维护模式、限流、页缓、通知、广告、DB 控制台、目录、搜索、多语言、Webhook、审计、版本、仪表盘、固定链接、404 监控、客服、SEO、公开端点安全）
- R3 主题专项：44/44 PASS（11 主题 × 4 页面，零 500 零英文错误标记）
- R4 左侧栏复核：9 分组齐全，36 插件归入，CF 屏蔽插件零痕迹
- V1 全量冒烟（定版复测）：部署前后各 108/108 PASS
- V2 写路径深测：30+ 项 PASS（评论全链路/文章+修订恢复/重定向保存时环检测/目录点击计数/Webhook 全链路/404 监控/页缓 HIT/通知/媒体 R2/DB 控制台确认机制/公开端点模糊 12 项）
- V3 主题与稳定性：主题静态 11/11 + 稳定性边界 27/27 PASS
- 本轮唯一修复：redirect 插件管理 API 8 类报错中文化；全部测试数据零残留

## 校验和

已生成：同目录 `checksums.txt`（SHA256，由打包脚本 [logs/v_package_release.py](../../logs/v_package_release.py) 生成，含强制安全扫描）。
