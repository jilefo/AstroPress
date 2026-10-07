# AstroPress v1.0.1 发布说明

发布日期：2026-10-05
对应线上版本：Cloudflare Workers `a9f37862-204f-4945-88b7-ba2e67ec9bba`
校验和：见 [checksums.txt](checksums.txt)（SHA256）

## 本版概要

v1.0.1 是 v1.0.0 之后的质量修复版，基于对生产站连续多轮「每插件每功能真实测试」的结果。无数据库结构变更，可直接覆盖部署。

## 修复

### 1. 通知铃铛全站脚本语法错误（影响全部后台页）

通知中心注入到每个后台页的铃铛脚本因模板字符串内引号转义错误，浏览器一律报
`SyntaxError: Unexpected identifier 'padding'`，导致铃铛永不渲染、后续脚本中断。
修复引号写法，并将铃铛插入位置调整到用户区块之前（避免被顶栏 flex 布局挤出视口）。

### 2. 媒体上传端点异常吞没

`/api/media/upload` 收到非 multipart/form-data 请求时，底层解析异常未捕获，
服务端返回 `200 + 英文 HTML 错误页`。现改为正确返回 `400` 与中文 JSON 提示。

### 3. 全站 API 报错中文化（305 处 / 83 个文件）

对所有启用插件的管理端 API、公开端点及两个核心端点的错误提示做系统性中文化，
包括登录过期、CSRF 校验、非法 JSON、确认操作、参数缺失、2FA、多语言、广告位、
编辑器翻译等场景。仅修改提示文案，不改变任何业务逻辑与 HTTP 状态码。

## 质量验证（生产环境真实测试）

- 全插件冒烟：108/108 通过
- 后台 50 个页面全部内联脚本语法检查：0 错误
- 17 个外部注入脚本语法与 content-type 检查：17/17
- 前端代码引用的 74 个 fetch 端点 HTTP 契约核对：无路由缺失、无 HTML 冒充 JSON
- 25 个写操作端点异常入参探测：修复后 17/17 返回中文 JSON 校验错误
- 浏览器真实交互：登录、仪表盘、铃铛点击、通知面板、控制台零错误

## 部署说明

- Node.js 部署：更新源码后 `pnpm install && pnpm build` 即可。
- Cloudflare 部署：`pnpm run build:cf && pnpm exec wrangler deploy`。
- 本版不涉及数据迁移；D1 / R2 数据保持不变。

## 已知平台限制（Cloudflare Workers）

以下 6 个插件在 Cloudflare 部署中被平台能力自动屏蔽（页面 404、入口零痕迹），
Node.js 部署下功能完整：static-html、ai-chat、backup、git-sync、file-manager、webdav。
原因均为 Workers 无持久文件系统/无子进程，属客观平台限制，非缺陷。
