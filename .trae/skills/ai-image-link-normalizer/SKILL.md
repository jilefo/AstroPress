---
name: ai-image-link-normalizer
description: Diagnose and fix AI-generated content containing broken or fabricated external image links instead of real Markdown/HTML images. Use when users report AI 写作助手 returns 图片链接, 裸 URL, example.com image links, or images that fail to render. Do not use for theme or unrelated editor bugs.
---

# AI 图片链接归一化排查

核心原则：模型/用户措辞无法穷举，**不要只在前端意图正则上打补丁**。正确做法是在最终边界
（写库前、API 响应出口）做不可绕过的归一化，并用真实 UI 复测。

## 1. 先盘点全部入口（静态 + 动态证据）

在本项目中，AI 图片可能经过的路径：

1. `AIWidget` 聊天 → `POST /api/ap-autofill/write`（程序层生成实图）。
2. 编辑页底部 autofill 面板 → `/write`（注入脚本 `plugins/ai-autofill/src/scripts/autofill.js`）。
3. 聊天命中动作块 → `POST /api/ai/execute`：动作处理器（`apps/admin/src/lib/ai-actions.ts`，
   如 `updatePost/createPost`）**直接改库**，绕过 `/api/posts/:id` 保存端点，
   `image-mirror` 插件不触发。
4. 客户端动作（`setContent/setTitle/...`，见 AIWidget 中 `CLIENT_SIDE` 与
   `executeClientAction`）在浏览器内直接写入，无服务端调用。
5. `/api/ai/chat` 自由文本 `reply` 原样渲染。

定位事实的方法：读源码契约后，用浏览器注入 fetch 记录器（只 `clone()` 不拦截）抓
`/api/ai/chat`、`/api/ai/execute` 的真实请求/响应体；注意 JSON 动作围栏内引号为
`\"` 转义形态。典型伪造链接形如 `https://example.com/xxx.jpg`。

## 2. 在边界加归一化闸门（插件优先，零核心改动）

- 归一化库：识别三类 token —— `<img src=...>`（兼容转义引号）、Markdown
  `![alt](url)`、裸图片 URL（`png/jpg/jpeg/webp/gif/avif`）。
  - **同源引用一律跳过**；外链前若干张调用 text_to_image 生成真实图片原位替换，
    其余外链 token 直接剥离，内容里绝不保留外部/死链接。
  - URL 去重；替换从后往前避免位移；保留 alt、转义上下文与周边文本；全程 fail-open。
- 参考实现：[plugins/ai-autofill/src/lib/normalize-images.ts](../../../../plugins/ai-autofill/src/lib/normalize-images.ts)。
- 两个闸门接入 post 中间件（[plugins/ai-autofill/src/middleware.ts](../../../../plugins/ai-autofill/src/middleware.ts)）：
  - execute：读取请求体 → 归一化 → `next(new Request(request, { body: newBody }))`，
    删除 `content-length`。Astro 4.16 的 `next()` 运行时支持传 Request。
  - chat：`await next()` 后解析 `{reply}` 归一化，再 `new Response` 返回。
- 图片生成：text_to_image 端点
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt={prompt}&image_size={size}`，
  尺寸 `landscape_16_9` 等；字节落地 R2（key `ai/{YYYYMM}/{id}.jpg`，本地 dev 写
  `public/media`），返回 `{origin}/media/{key}`。参考 `generateAndStore()`。
- 前端 `isWritingRequest()` 可追加意图词让常见措辞走更快的 `/write`，但只是优化，
  闸门必须独立兜底。

## 3. 四层验证（缺一不可）

1. 本地单测：三类 token 检测、同源跳过、非图片链接跳过、转义围栏替换正确。
   本仓库无 tsx 时可用 esbuild 打包后用 node 跑（见 `logs/run_normalize_test.mjs`）。
2. 线上确定性闸门：Python（独立 `.py` 放 `logs/`，禁止 PowerShell 内联）直接向
   execute 提交含假图的动作，断言假域名消失、出现同源 `/media/ai/` 图、正文完整，测后恢复。
3. **真实浏览器 UI**：登录编辑页，分别发图文请求、易漏网的配图措辞，确认成功卡片与正文
   图片；抓包确认无外链。不能只用直接 API 验证就宣布完成。
4. 前台公开文章页：滚动触发懒加载后断言图片 `naturalWidth > 0`，无外部图片。
   注意排除评论表单占位符与 `/ap-related/track` 统计像素。

## 4. 收尾

- 更新 `logs/` 带轮次/日期的报告与根目录 `CHANGELOG.md`；如改动了 `apps/**` 核心文件
  （应尽量避免），必须在 CHANGELOG 逐条显式登记。
- 构建部署：`cd apps/admin && pnpm run build:cf && npx wrangler deploy`；
  环境路径前置 `D:\DevTools\node;D:\DevTools\Git\cmd`。
