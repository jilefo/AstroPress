# @astropress/plugin-image-mirror

保存文章时自动把正文里的**外链图片**转存到本地媒体库的插件（零核心修改，不触碰 `BlockEditor.tsx`、保存 API 等任何源文件）。

典型场景：从别的网页复制一篇图文粘贴进 AstroPress 富文本编辑器 → 正文 `<img src>` 是第三方外链（浏览器跨域无法抓取）→ 点保存（或触发 60 秒自动保存）时，由**服务端**逐张下载外链图片、存入媒体库、登记为附件、并把正文/摘要中的 `src` 改写为本地 URL 后落库。保存后编辑器内的图片地址也会自动刷新为本地链接，无需重新打开页面。

## 工作流程

```
粘贴网页图文 → contenteditable 内仍是外链 <img src="https://other.com/a.jpg">
      │
      ▼  PUT /api/posts/:id（或 POST /api/posts）
插件 post 中间件：
  1. clone 请求体（不消费原请求）→ 放行，让官方处理器正常保存
  2. 响应成功后，扫描 content + excerpt 中 <img src> 的 http(s) 外链
     （同源 / 相对路径 / data: / blob: 一律跳过）
  3. 逐张：SSRF 校验 → 跟随最多 3 次重定向（每跳都校验）→ 超时/大小控制
     → 魔数嗅探（只认 png/jpeg/gif/webp/avif）→ putFile 存 R2 或 public/media
     → 建 attachment（wp_posts + _wp_attached_file + _ap_source_url）
  4. 用本地 URL 重写正文/摘要并 update 落库（失败的图片保留原链接，不阻塞保存）
  5. 响应头回传 X-Ap-Mirrored / X-Ap-Mirror-Failed
      │
      ▼
注入脚本（/api/ap-mirror/image-mirror.js）检测到响应头：
  GET /api/posts/:id → 回填 .ap-wysiwyg-editor 的 innerHTML、
  window.__editorContent、#post-excerpt，并在 #save-status 提示
  “已转存 N 张网络图片到媒体库 ✓”
```

回填编辑器是必要的：官方保存接口只返回 `{ok:true}`，且每 60 秒有自动保存；不回填的话下一次自动保存会用旧的外链内容覆盖数据库里已改写的正文。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/index.ts` | `definePlugin` 清单（插件列表可见性） |
| `src/integration.admin.ts` | `injectRoute` 下发客户端脚本 + `addMiddleware(order:"post")` |
| `src/middleware.ts` | 拦截 `POST /api/posts`、`PUT /api/posts/:id`；向 admin HTML 注入 `<script>` |
| `src/lib/mirror.ts` | 转存编排：抽取 URL、去重、并发池、下载、落库、src 改写、二次 update |
| `src/lib/guard.ts` | SSRF 防护（协议/端口/主机名/DNS 解析结果 IP 段校验） |
| `src/lib/sniff.ts` | 图片魔数嗅探（不接受远程 SVG，见限制） |
| `src/lib/storage.ts` | 存储适配：R2 binding 优先，否则本地 `public/media`（与官方/editor-upload 同约定，刻意复制而非跨插件 import） |
| `src/routes/api/image-mirror.js.ts` | 客户端脚本下发路由（`?raw`） |
| `src/scripts/image-mirror.js` | 包装 `window.fetch` 监听保存响应，回填编辑器内容 |

## 安装

本仓库已预装配（workspace 包），三处改动均已就位：

```jsonc
// apps/admin/package.json
"@astropress/plugin-image-mirror": "workspace:*"
```

```ts
// apps/admin/astro.config.ts
import imageMirrorAdminIntegration from "@astropress/plugin-image-mirror/integration.admin";
integrations: [/* ... */, imageMirrorAdminIntegration()];
```

```ts
// apps/admin/src/plugins.ts（清单可见性）
import imageMirrorPlugin from "@astropress/plugin-image-mirror";
loadPlugin(imageMirrorPlugin);
```

克隆/拉取后在仓库根执行一次 `pnpm install` 建立 workspace 链接，然后正常 `pnpm dev` 即可。web 端不需要装配（这是后台编辑功能）。

在其它 AstroPress 项目中安装时，同样完成上面三处装配即可；存储默认写本地 `public/media`，Cloudflare 上配置了 R2 binding 则自动写 R2（与官方媒体库完全一致）。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `AP_MIRROR_MAX_IMAGES` | 20 | 单次保存最多转存张数，超出保留原链接并计入 skipped |
| `AP_MIRROR_MAX_MB` | 10 | 单张图片大小上限；`Content-Length` 超限直接拒绝，流式读取时也做硬截断 |
| `AP_MIRROR_TIMEOUT_MS` | 15000 | 单次请求（每个重定向跳）超时 |
| `AP_MIRROR_CONCURRENCY` | 3 | 单次保存内的下载并发数 |
| `MEDIA_BASE_URL` | 请求 origin | 生成的本地图片 URL 前缀（与官方/editor-upload 共用） |

## 安全设计

- **SSRF 防护**（`guard.ts`，每次请求及每个重定向跳都执行）：
  - 仅允许 `http/https`；拒绝 URL 内嵌账号密码、拒绝 80/443 以外端口；
  - 按名拦截 `localhost`、`.localhost`、`.local`、`.internal`、各大云厂商 metadata 主机名；
  - IP 字面量与 DNS 解析出的**全部地址**均不得落在回环/内网/链路本地/CGNAT/保留段（IPv4 与 IPv6，含 `::ffff:` 映射地址与 NAT64 内嵌 v4），防 DNS rebinding；
  - 重定向使用 `redirect:"manual"` 自行跟随（最多 3 次），每跳重新过 SSRF 校验。
- **内容可信**：以魔数判定真实图片格式（png/jpeg/gif/webp/avif），不信任 URL 后缀与 `Content-Type`；远程 SVG 一律拒绝（远程 SVG 等于在本站源存储第三方活动内容）。
- **身份与数据**：中间件仅在官方保存处理器成功后运行（即已通过登录校验）；附件作者继承自文章作者。

## 失败语义

- 任何单张图片失败（超时、拒绝连接、非图片、SSRF、超限）只记 `console.warn` 并计入 `X-Ap-Mirror-Failed`，**正文保留原外链**，保存照常成功。
- 转存整体异常（如存储不可用）被捕获，不影响保存接口的原始响应。
- 服务端日志可看到 `[image-mirror] failed: <url> (<reason>)`。

## 去重

附件行写入两条 postmeta：`_wp_attached_file`（官方约定）与 `_ap_source_url`（源 URL）。转存前先按 `_ap_source_url` 查既有附件并复用其 `guid`，所以同一外链被多篇文章/多次保存引用时只下载一次。改写同时处理 `&` 与 `&amp;` 两种 HTML 属性编码形式。

## 停用恢复

移除 `astro.config.ts` 中的 integration 装配行（可选同时移除 plugins.ts 与 package.json 依赖）后：中间件、注入脚本、`/api/ap-mirror/image-mirror.js` 路由全部消失，保存行为恢复官方原样。已转存的图片保留在媒体库（标准 attachment 记录），正文中已是标准的本地 `<img src="/media/...">`，不依赖本插件运行。

## 限制（如实声明）

- 只改写 `<img src>`；不处理 CSS 背景图、`<picture><source srcset>`、内联 style 中的外链。
- 不接受 SVG/BMP/ICO：BMP/ICO 不属于现代网页图片格式；远程 SVG 有活动内容风险，需要 SVG 请用 editor-upload 本地上传（含消毒）。
- Node 运行时做完整 DNS 解析校验；Cloudflare Workers 等无 `node:dns` 的边缘运行时跳过 DNS 校验（原始 IP 字面量仍拦截），依赖边缘平台自身的私网出口限制。
- 不转存需要登录/Cookie 鉴权的图片（防盗链站点可能 403，此时保留原链接）。
- 自动保存每 60 秒一次：首次保存即完成转存并回填，后续自动保存发送的已是本地 URL；若回填请求失败，下次打开文章时内容依然正确（数据库已改写）。
