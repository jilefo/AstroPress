# AstroPress 全插件全功能测试报告（F 轮 · 任务 7）

- 报告生成时间：2026-10-03（任务 8 深排回归后更新）
- 测试批次标识：`fe77bd58`（257 项断言）
- 测试类型：黑盒 API/HTTP 契约测试 + 前台中间件行为验证 + 主题运行时矩阵
- 被测对象：AstroPress monorepo（40 个已启用插件、33 个后台管理页、公开路由与前台中间件、10 个移植主题）
- 执行方式：自动化主控脚本 `scripts/test-f-full.py`（结果落盘 `scripts/.f-full-result.json`），主题矩阵脚本 `scripts/test-f-themes.py`（`scripts/.f-themes-result.json`），可重复执行

## 一、测试结论

**总体结果：257 项功能断言全部通过（PASS 257 / FAIL 0，通过率 100.0%）；10 个移植主题运行时矩阵 10/10 PASS；`verify-sanitize.ts` 消毒器单元回归 33/33 PASS；`turbo typecheck --force` 45/45 通过；静态审计 E:0 W:0 I:14。**

- 文件管理器 13 个端点（列表/查看/编辑/新建/复制/移动/重命名/删除/上传/下载/打包/解压/目录树）全部实测通过，含 zip-slip、路径穿越、防环、受保护目录等攻击负例。
- 所有写接口的 CSRF 同源校验、confirm 二次确认、登录墙、multipart magic-byte 校验、频控、头注入/协议净化均有实测负例覆盖。
- 任务 8 深排共登记并修复 **12 项** 缺陷/加固项（F-T8-01 ~ F-T8-12，详见第九节），其中 **F-T8-12 为严重级未授权任意文件读取**（媒体端点 `%2F` 路径穿越，实测可下载整库 `local.db`），已修复并新增 5 个攻击向量回归。
- 性能基线：公开关键路径（首页/文章/搜索/目录/RSS/robots/sitemap/登录页）avg 3.1–11.5ms；4 路并发 × 15 轮 × 5 端点压力 75/75 OK。
- 两处与 Vite 开发服务器相关的环境差异（OPTIONS 预检占位、page-cache HIT 响应头重建）经核实为设计/环境行为，非缺陷（详见第八节）。

## 二、测试环境

| 项目 | 配置 |
| --- | --- |
| 操作系统 | Windows（PowerShell，路径分隔符 `\`，已专门覆盖分隔符相关用例） |
| 框架/模式 | Astro 4.16，`output: server` SSR，@astrojs/node standalone（dev 模式实测） |
| 数据层 | SQLite（libsql）+ Drizzle ORM，仓库根 `local.db` |
| 工程形态 | pnpm workspace monorepo，turbo 编排；admin `:4321` / web `:4322` |
| 插件状态 | 40 个插件全部启用；启停状态存 `wp_options.astropress_plugin_states` |
| 测试客户端 | Python 3 标准库 urllib（独立登录态/匿名双 opener，multipart 手工组装） |
| 认证方式 | `POST /api/auth/login`（form-urlencoded，Cookie Session） |

## 三、测试范围与方法

**覆盖范围**（40 插件 + 核心 + 主题）：

1. 后台插件 API（前缀 `/admin-ext/api/<slug>/...`）：全部 GET/POST/PUT/DELETE 端点的正常路径与错误路径。
2. 公开路由：`/ap-*`（评论、打点、webhook、相关文章追踪、链接跳转等）、`/ml-asset/*`、`/webdav/*`、`/sitemap.xml`、`/rss.xml`、`/robots.txt`、`/search`、`/directory`。
3. 前台中间件链：page-cache 命中/未命中、html-opt、image-lazy、security-headers、footer、share、related-posts、search FAB、permalink 等注入/改写行为。
4. 33 个后台页面登录态可访问、200 且渲染 HTML。
5. 10 个由 hexothemes 移植的主题：首页/文章/搜索/404 + 7 个插件注入标记 + 3 个安全响应头。

**方法学保障**：

- 每条断言独立记录（插件/功能/通过/实测证据），失败不中断后续用例，用例组级异常单独捕获。
- 所有写操作在 `.f-test-sandbox/` 沙箱或 `f-round-` 前缀数据内进行，文件/附件/评论/链接/密钥等用后即删；实测结束后全仓扫描无残留。
- 设置型插件先快照原值、改值断言、结束统一恢复；前台行为测试后强制 `page-cache purge`。
- 安全负例与正常路径 1:1 配置（CSRF、登录墙、confirm 闸门、路径穿越、盘符/UNC、zip-slip、multipart 伪造、频控、CRLF、危险 SQL、成环重定向、协议净化、枚举/范围夹取）。
- 对插件停用后的传播延迟采用轮询（每 2 秒 purge+MISS，最长 32 秒）验证 15s 进程缓存语义，而非主观 sleep。

**复现方式**：

```bash
pnpm turbo dev            # 启动 admin:4321 / web:4322
python scripts/test-f-full.py        # 全插件全功能（约 2~4 分钟）
python scripts/test-f-themes.py      # 10 主题运行时矩阵
```

## 四、按插件汇总（257 项断言）

| 插件 / 模块 | 断言数 | 通过 | 覆盖要点 |
| --- | --: | --: | --- |
| admin-i18n | 2 | 2 | 语言码/strings 类型校验/未配置 webhook 优雅返回 |
| admin-pages | 1 | 1 | 33 个后台管理页全部 200 渲染 |
| ads-manager | 8 | 8 | 广告位增改/非法 key/重复 key/批量打点/CORS/loader.js + track 请求体 32KB 上限 413（F-T8-05） |
| ai-autofill | 2 | 2 | 空 topic/全空入参确定性 400 |
| ai-chat | 3 | 3 | 提供商列表/未知 action/空 prompt |
| backup | 7 | 7 | 创建/列表/下载/恢复/删除 + 路径穿越·非法包名·非 multipart |
| comments | 15 | 15 | 匿名 JSON·form 双提交/蜜罐/30s3 条频控/字段校验/后台审核·回复·垃圾·删除全链路 + 64KB 请求体 413（F-T8-04） |
| config-io | 6 | 6 | 分区导出/全量导出/回导幂等/非法 JSON/密钥剥离 |
| customer-service | 1 | 1 | 位置枚举/颜色合法性回退 |
| db-console | 15 | 15 | 表清单/表结构/分页浏览/SQL 执行/行内编辑/CSV·SQL 导出 + 多语句·ATTACH 拦截·写确认 + 大结果集 5000 行截断（F-T8-10） |
| db-optimize | 5 | 5 | 库统计/ANALYZE/清修订/非法 action/confirm |
| donation | 2 | 2 | javascript: 链接保存端净化 + DB 直改后前台输出层白名单过滤（F-T8-06 纵深） |
| editor-scripts | 14 | 14 | 7 个编辑器 JS 登录态可加载、匿名被登录墙拦截 |
| editor-tools | 1 | 1 | 翻译目标语言枚举校验 |
| editor-upload | 3 | 3 | 真实 PNG 上传/元数据更新/伪图 magic-byte 拦截/附件清理 |
| error-monitor | 5 | 5 | 匿名 404 落库/计数/单条删除 + 去重 Map 有界化（F-T8-03） |
| file-manager | 32 | 32 | list·read·write·mkdir·rename·copy·move·dirs·download·upload·zip·unzip·delete 全 13 端点 + 路径穿越/zip-slip/受保护目录/防环/同名冲突 |
| footer | 2 | 2 | 存储原文 + 前台输出白名单消毒（F-T8-01，script/onerror/svg 伪协议全剥离，33 例回归） |
| forms | 8 | 8 | 核心公开表单：创建/1MB 巨包 413/非法 JSON 400/字段类型 400/正常提交/超长字段·URL 入库裁尖/IP 频控 429/用后清理（F-T8-07） |
| gist-sync | 4 | 4 | token 掩码/无凭证 400/confirm/历史 |
| git-sync | 5 | 5 | preset 校验/scopes 全关拒绝/confirm/历史 |
| html-opt | 3 | 3 | 注释清除/空白折叠/资源提示注入/MISS 标记头 |
| image-lazy | 2 | 2 | 图片 loading/decoding 注入/skipFirst 夹取 |
| link-directory | 12 | 12 | 分类增删/链接增删审/非法 URL/公开目录页/click 计数跳转 |
| media-av | 2 | 2 | 音视频 magic-byte/扩展名白名单 |
| multilingual | 10 | 10 | 公开 config·panel·switcher/语言码校验/双语切换/译文存取/自链拒绝 |
| page-cache | 3 | 3 | MISS/HIT/Age/Cache-Control/写后失效/参数夹取 |
| permalink | 2 | 2 | 旧链接裸路径重写到文章页 |
| plugin-manager | 14 | 14 | 全量状态/系统插件保护/启停 guard 即时 + 前台零延迟生效（F-T8-02 共享状态缓存）/配置清除 |
| redirect | 9 | 9 | 规则增删查/成环拒绝/重复拒绝/保留前缀/301·302 匿名命中 |
| related-posts | 4 | 4 | 数量夹取/区块注入/追踪像素 |
| search | 2 | 2 | 参数夹取/公开搜索页 |
| security | 7 | 7 | 登录墙/CSRF 同源/非法 JSON/confirm 闸门 + 登录暴力破解 IP 锁定与隔离（F-T8-08）+ 媒体端点 %2F 路径穿越 5 向量全部 404（F-T8-12） |
| security-headers | 2 | 2 | nosniff/Frame/Referrer/HSTS/CSP 注入 + CRLF 防头注入 |
| seo-tools | 4 | 4 | 字段级合并/范围夹取/RSS 开关/robots |
| share | 2 | 2 | enabled 缺省 false 特例/禁用不注入/恢复 |
| sitemap | 3 | 3 | sitemap.xml/禁用 404/重启用恢复 |
| static-html | 4 | 4 | 设置/生成闸门/异步状态轮询/index.html 产物 |
| webdav | 16 | 16 | token/207 PROPFIND/MKCOL/PUT/GET/DELETE/401/路径沙箱/容量统计/OPTIONS |
| webhook | 15 | 15 | 密钥创建/权限分级/Bearer·X-API-Key 恒定时间校验（F-T8-09）/publish 幂等·chunked 5MB 上限/delete/审计日志 |
| **合计** | **257** | **257** | 通过率 **100.0%** |

## 五、主题适配运行时矩阵（任务 6 产物，10/10 PASS）

每个主题执行：重新导入（createPages:false）→ 激活 → 校验首页/文章/搜索/404 状态码 → 校验 7 个插件注入标记（评论、分享、打赏、页脚、客服、搜索 FAB、相关文章追踪）→ 校验 3 个安全响应头；完成后恢复 base-theme。

| 主题 | 首页 | 文章 | 搜索 | 404 | 7 注入标记 | 3 安全头 | 结论 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| Stack | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Ayer | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Butterfly | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Fluid | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Icarus | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Keep | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| MengD | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| NexT | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Redefine | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |
| Volantis | 200 | 200 | 200 | 404 | 7/7 | 3/3 | ✅ PASS |

## 六、安全负例专项

| 类别 | 实测点 | 结果 |
| --- | --- | --- |
| 登录墙 | 匿名访问后台设置 API 无法获得数据（登录页改写/拦截） | PASS |
| CSRF | 跨 Origin POST 后台设置返回 403；webhook/上传/导入等写接口同源校验 | PASS |
| confirm 闸门 | file-manager/db-console 缺 confirm → 403；db-opt/static-html/webdav-token/page-cache 等缺 confirm → 400 | PASS |
| 路径穿越 | file-manager read/write/rename、backup download、webdav `../../` 全部 400/403/404 | PASS |
| 盘符/UNC | `C:\\Windows`、UNC 绝对路径被 resolveSafe 拒绝 | PASS |
| zip-slip | 恶意 zip（`../../.f-zipslip-evil.txt`）解压 400，文件未逃逸沙箱 | PASS |
| 受保护目录 | 写入 `node_modules/` 被拒；`.git/.astro` 同策略 | PASS |
| 文件上传 | 改扩展名伪图/伪音视频 magic-byte 拦截 415；扩展名白名单 415 | PASS |
| SQL 控制台 | 多语句、`ATTACH DATABASE` 拒绝；写操作必须 confirmWrite；表名白名单 | PASS |
| 评论反垃圾 | 蜜罐静默 202 且不计数；同 IP 30 秒窗口第 4 条 429；非法邮箱/`javascript:` website 400 | PASS |
| 重定向 | 成环规则、重复 from、`/admin*` 保留前缀全部拒绝 | PASS |
| 输出消毒 | footer 自定义 HTML 中的 `<script>`、无引号 `onerror=` 在前台输出被剥离（安全标签保留） | PASS（见第九节加固项） |
| 协议/头注入 | donation `javascript:` 链接清空；security-headers CSP 中的 CRLF 被剥离；html-opt preconnect 去 `javascript:`/去重 | PASS |
| Webhook | 无效 key 403、权限分级（只读 key 不可删除）、密钥列表不回显明文/hash | PASS |
| WebDAV | 匿名 401 + WWW-Authenticate: Basic；沙箱外不可达；目录不可 GET | PASS |
| 插件管理 | 系统插件不可禁用/清配置；未知插件 404；被禁插件后台路由即时 404 | PASS |

## 七、关键功能链路证据

- **文件管理器全生命周期（32 项断言）**：沙箱内逐级 mkdir → 同名 409 → write 新建/覆盖（created 真假）→ read 内容一致 → rename（非法目标名拒绝）→ copy 落子目录/同名自动加序号 → move 移文件 → 目录移入自身子孙返回单项失败 done=0/failed=1 → dirs 字符串目录树 → download 文件内容正确/目录拒绝 → upload 同名重命名 → zip 计数 ≥2 → unzip 还原 → zip-slip 拦截 → 缺 confirm 403 → 递归 delete 后 404。
- **评论端到端（14 项）**：匿名 JSON 与 form-urlencoded 双通道提交 201 → 蜜罐 202 → 频控第 3 条放行/第 4 条 429 → 文章不存在/非法协议 400 → 后台 pending 列表命中 → approve → 管理员回复 approved → 空回复/未知 action/空 ids 拒绝 → 全量清理。
- **备份/恢复（7 项）**：创建 .apzip（PK 魔数可下载）→ 穿越下载拒绝 → 非 multipart/不存在备份（合法 `backup-*` 文件名）400/404 → 删除。
- **WebDAV 协议（16 项）**：token 仅一次明文/GET 只回 hasToken/重置需 confirm → 匿名 PROPFIND 401 带 Basic challenge → 207 multistatus → MKCOL 201/已存在 405 → PUT 201/覆盖 204 → GET 内容一致/目录 403 → 沙箱穿越拒绝 → stats files≥1 → DELETE 递归 204。
- **插件启停传播（12 项）**：禁用 html-opt 后后台路由立即 404；前台 MISS 响应经轮询在 15s 缓存过期后确定性失去 X-HTML-Opt；重启用后确定性恢复。
- **静态生成（4 项）**：小参数设置 → 无 confirm 拒绝 → 触发后轮询 `state.running=false/status=ok` → `static-html/index.html` 产出且 >500B。
- **全页缓存（3 项）**：首访 MISS、二访 HIT，HIT 带 Age 与 `Cache-Control: no-cache`，写操作后缓存清空。

## 八、环境差异与设计行为说明（非缺陷）

| 现象 | 核实结论 |
| --- | --- |
| dev 下任意路径的 `OPTIONS` 均返回 `204` + `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`（含不存在路径） | Vite 开发服务器内置 CORS 预检占位，在 Astro 路由之前短路；WebDAV/广告路由自带的 OPTIONS 处理器在 **生产 standalone 构建**中生效（webdav: 200 + `DAV: 1,2`；ads: 204 + `ACAO: *`）。已在 4321/4322 双应用对不存在路径对照验证。 |
| page-cache HIT 响应没有 `X-HTML-Opt` 头 | 设计行为：HIT 响应由缓存层以白名单头（content-type/X-Cache/Age/Cache-Control）重建；安全头由更外层 security-headers 中间件补齐，而 html-opt 位于缓存内层，HIT 不重跑。MISS 响应带头，缓存正文本身是已优化 HTML。 |
| 插件停用后前台最长 ~15s 才生效 | 前台中间件启用状态采用 15s 进程缓存、fail-open（避免每页查库）；后台管理 API 的 guard 为即时生效。 |
| footer 设置接口原样回存含 `<script>` 的 customHtml | 消毒发生在前台**输出端**（中间件注入前），存储端保留原文；已实测前台页面中脚本/事件处理器被剥离。 |
| 链接创建/分类等接口返回 `{ok, cat/link}` 包封、webhook 删除不存在密钥返回 200 `{ok:false}` | 均为契约特例，已按真实契约断言。 |

## 九、缺陷与改进项登记（任务 8 深排，12/12 已修复并回归）

| 编号 | 级别 | 问题 | 修复与验证 |
| --- | --- | --- | --- |
| F-T8-01 | 中（安全） | footer 自定义 HTML 基于正则黑名单消毒，可被 `<svg/onload=...>`、`javascript:` 伪协议、畸形大小写标签绕过。 | 重写为白名单分词消毒器（标签/属性白名单、危险标签连内容丢弃、safeUrl 协议白名单含实体/制表符混淆解码、safeStyle 禁 expression/@import、`target=_blank` 强制 noopener）；`verify-sanitize.ts` 33/33 PASS，全量攻击向量回归通过。 |
| F-T8-02 | 低（性能/一致性） | 11 个前台中间件各自维护 15s 启用状态缓存，重复读同一 option；插件启停后前台最长 15s 才生效。 | 新增 `@astropress/core/plugin-state` 共享缓存（单缓存 + inflight 合并 + fail-open + 变更主动失效），11 中间件收敛；plugin-manager 保存状态后联动 invalidate，本进程零延迟生效，跨进程 ≤15s 兜底；新增 2 条即时生效断言。 |
| F-T8-03 | 低（可用性） | error-monitor 去重 `Map` 无上限，异常路径被高频打点时可无限增长。 | 上限 3000：先清扫过期键，仍超则按插入顺序淘汰最旧；257 项回归通过。 |
| F-T8-04 | 低（安全/DoS） | 公开评论提交端点无请求体上限，超大 JSON 可拖垮解析。 | 64KB 前置 413（content-length + raw.length 双校验），位于频控计数之前不耗配额；70KB 负例 413 实测。 |
| F-T8-05 | 低（安全/DoS） | ads 公开打点端点无请求体上限。 | 32KB 双重 413（content-length 前置 + 解析后 JSON.stringify 长度兜底）；40KB 负例 413 实测。 |
| F-T8-06 | 中（安全纵深） | donation 设置虽有保存端 URL 净化，但 DB 被直改（备份回灌/共享库/其他插件写 option）后 `javascript:` 可直达前台 href/src。 | 前台输出中间件新增 `safeImgUrl`/`safeLinkUrl` 白名单（图片仅 http(s)/站内/data:image，链接仅 http(s)/站内）；测试直改 DB 注入伪协议，前台区块无 `javascript:` 且保留合法爱发电链接。 |
| F-T8-07 | 中（安全/DoS） | 核心公开表单提交 `/api/forms/submit`：无体积上限、非法 JSON 直接 500、无频控、字段无裁尖、条目在 wp_options 单行内无限膨胀（读-改-写 O(n²)）。 | 1MB 请求体双上限 + JSON 解析容错 400 + 字段数/值长/数组项/键长裁尖 + 同 IP×表单 60s10 次频控（有界清扫）+ 单表单 10 万条硬上限 + UA/pageUrl 截断；新增 8 条断言（含 413/400/429/裁尖长度精确校验）。 |
| F-T8-08 | 中（安全） | 登录端点无暴力破解节流；错误信息对「用户不存在/密码错」一致（无枚举问题，保留）。 | 进程内按 IP 节流：15 分钟窗口连续失败 10 次锁定 15 分钟，成功登录清零，惰性清扫有界；新增 2 条断言（锁定后正确密码亦拒、IP 间不连坐，伪造 XFF 桶不污染本机）。 |
| F-T8-09 | 低（安全） | webhook API key 哈希用普通字符串比较，非恒定时间。 | 改用 `crypto.timingSafeEqual`（长度兜底），与 webdav `safeEq` 对齐；webhook 15 项契约回归通过。 |
| F-T8-10 | 低（性能/稳定） | db-console 裸 SELECT 返回全部行，无 LIMIT 的大表/笛卡尔积可打爆响应内存。 | 返回行数封顶 5000，`truncated` 标记并提示加 LIMIT；SQL 长度/单语句/危险 PRAGMA 等既有闸门不变。 |
| F-T8-11 | 低（稳定） | 核心 AI 助手与 ai-autofill/editor-tools 外发 fetch 无总超时（provider 挂起占连接）；Gemini model 未 URL 编码；AI 设置 JSON 损坏时 500。 | 五家 provider 统一 120s `AbortSignal.timeout`，model/key 走 encodeURIComponent，设置解析失败返回明确 500 文案；三处客户端（core + 2 插件）同构修复，typecheck 通过。 |
| F-T8-12 | **严重（安全）** | 公开媒体端点 `/media/[...key]` 直接 `path.join(public/media, key)` 读文件，未校验 `..`；`%2F` 经 Astro 解码为分隔符，**未授权路径穿越任意文件读取——实测 `GET /media/..%2f..%2f..%2f..%2flocal.db` 可下载 942080 字节生产库（SQLite 头确认，含用户密码哈希、会话、webhook/AI 密钥）**。 | 段白名单（仅 `[A-Za-z0-9._-]`、拒 `.`,`..`,反斜杠、空段）+ `resolve` 后 mediaRoot 目录包含双重校验，R2 分支同样适用；修复后 5 个穿越向量（含 `%2e%2e`、子目录穿越）全部 404，合法图片 200 + 正确 MIME；新增安全回归断言。 |

> 任务 7 首轮 241 项测试曾出现 28 项失败，经逐项对照源码契约复核，**全部为测试脚本自身的契约误判/构造错误**，修正后全绿；任务 8 深排在此基础上新增 16 项断言（241 → 257）并修复上表 12 项产品侧缺陷。

## 十、附录：全部 257 项断言明细

<details><summary>展开完整用例表（257 项：插件 / 功能 / 结果 / 实测证据，来源 scripts/.f-full-result.json 批次 fe77bd58）</summary>

| 插件 | 功能断言 | 结果 | 证据 |
| --- | --- | --: | --- |
| security | 匿名访问后台设置 API 被登录墙拦截 | ✅ | 200 |
| security | 跨 Origin POST 触发 CSRF 403 | ✅ | 403 |
| security | 非法 JSON 返回 400 | ✅ | 400 |
| security | 危险操作缺 confirm 被拒 | ✅ | 400 |
| forms | 临时测试表单创建 | ✅ | 200 |
| forms | 提交体超 1MB 返回 413 | ✅ | 413 |
| forms | 非法 JSON 返回 400（原为 500） | ✅ | 400 |
| forms | fields 非对象返回 400 | ✅ | 400 |
| forms | 正常提交 200 | ✅ | 200 |
| forms | 超长字段/URL 入库前裁尖（100KB/2KB） | ✅ | 100000/2000 |
| forms | 同 IP 60s 内超 10 次提交返回 429 | ✅ | 200/429 |
| forms | 临时表单及条目清理 | ✅ | 200 |
| security | 同 IP 连续 10 次失败后登录锁定（即使密码正确） | ✅ | /login?error=invalid -> /login?error=locked |
| security | 锁定按 IP 隔离，其他 IP 不被连坐 | ✅ | /login?error=invalid |
| security | 媒体端点路径穿越向量全部 404 且不泄库 | ✅ | [('/media/..%2f..%2flocal.db', 404, 9), ('/media/..%2f..%2f..%2f..%2flocal.db', 404, 9), ('/media/..%2f..%2f..%2f..%2f..%2fWindows%2fwin.ini', 404, 9), ('/media/%2e%2e/%2e%2e/local.db', 404, 26490), ('/media/sub/..%2f..%2f..%2f..%2flocal.db', 404, 9)] |
| file-manager | list 列出仓库根目录 | ✅ | 200 |
| file-manager | mkdir 父目录不存在时 400 | ✅ | 400 |
| file-manager | mkdir 创建沙箱目录 | ✅ | 200 |
| file-manager | mkdir 同名目录 409 | ✅ | 409 |
| file-manager | mkdir 多级（逐级）创建 | ✅ | 200 |
| file-manager | mkdir 路径穿越被拒 | ✅ | 400 |
| file-manager | mkdir 绝对/盘符路径被拒 | ✅ | 400 |
| file-manager | write 新建文件 | ✅ | 200 {'ok': True, 'path': '.f-test-sandbox/a.txt', 'size': 14, 'created': True} |
| file-manager | write 缺 confirm 403 | ✅ | 403 |
| file-manager | write 覆盖编辑既有文件 | ✅ | {'ok': True, 'path': '.f-test-sandbox/a.txt', 'size': 13, 'created': False} |
| file-manager | read 读取文本内容 | ✅ | 200 |
| file-manager | read 路径穿越被拒 | ✅ | 400 |
| file-manager | write 非文本类型 415/400 | ✅ | 415 |
| file-manager | rename 重命名 | ✅ | 200 |
| file-manager | rename 非法目标名被拒 | ✅ | 400 |
| file-manager | copy 复制文件到子目录 | ✅ | {'ok': True, 'mode': 'copy', 'done': 1, 'failed': 0, 'results': [{'src': '.f-test-sandbox/a-renamed.txt', 'ok': True, 'dest': '.f-test-sandbox/sub/a-renamed.txt'}]} |
| file-manager | copy 同名自动加后缀 | ✅ | {'ok': True, 'mode': 'copy', 'done': 1, 'failed': 0, 'results': [{'src': '.f-test-sandbox/a-renamed.txt', 'ok': True, 'dest': '.f-test-sandbox/sub/a-renamed-1.txt'}]} |
| file-manager | move 移动文件 | ✅ | 200 |
| file-manager | move 目录移入自身子孙（防环）单项失败 | ✅ | b'{"ok":false,"mode":"move","done":0,"failed":1,"results":[{"src":".f-test-sandbox/sub","ok":false,"error":"\xe4\xb8\x8d\xe8\x83\xbd\xe7\xa7\xbb\xe5\x8a\xa8/\xe5' |
| file-manager | dirs 目录树（字符串数组） | ✅ | 200 |
| file-manager | download 下载文件 | ✅ | 200 |
| file-manager | download 目录被拒 | ✅ | 400 |
| file-manager | upload 上传文件 | ✅ | 200 {'ok': True, 'file': 'f-upload.txt', 'path': '.f-test-sandbox/f-upload.txt', 'size': 14, 'renamed': False} |
| file-manager | upload 同名自动重命名 | ✅ | 200 {'ok': True, 'file': 'f-upload-1.txt', 'path': '.f-test-sandbox/f-upload-1.txt', 'size': 5, 'renamed': True} |
| file-manager | zip 打包目录 | ✅ | {'ok': True, 'file': 'sub.zip', 'path': '.f-test-sandbox/sub.zip', 'size': 409, 'count': 3} |
| file-manager | unzip 解压到同名目录 | ✅ | {'ok': True, 'dir': 'sub-extracted', 'count': 3} |
| file-manager | unzip zip-slip 恶意包被拒 | ✅ | 400 |
| file-manager | zip-slip 文件未逃逸到仓库根 | ✅ |  |
| file-manager | 写入受保护目录 node_modules 被拒 | ✅ | 400 |
| file-manager | delete 缺 confirm 403 | ✅ | 403 |
| file-manager | delete 递归删除沙箱 | ✅ | {'ok': True, 'deleted': ['.f-test-sandbox'], 'errors': []} |
| file-manager | 删除后目录不存在 404 | ✅ | 404 |
| db-console | tables 列出表 | ✅ | 200 n=16 |
| db-console | structure 表结构 | ✅ | 200 |
| db-console | structure 非法表名 400 | ✅ | 400 |
| db-console | browse 分页浏览数据 | ✅ | 200 |
| db-console | exec SELECT 查询 | ✅ | None |
| db-console | exec 写操作缺 confirmWrite 403 | ✅ | 403 |
| db-console | exec ATTACH 危险语句 400 | ✅ | 400 |
| db-console | exec 多语句 400 | ✅ | 400 |
| db-console | exec 确认写入（建测试数据） | ✅ | 200 |
| db-console | update 行内编辑单元格 | ✅ | 200 |
| db-console | update 缺 confirm 403 | ✅ | 403 |
| db-console | update 值已落库 | ✅ | [{'ov': 'v2'}] |
| db-console | export CSV 导出（含 BOM） | ✅ | 200 |
| db-console | export SQL 导出建表语句 | ✅ | 200 |
| db-console | export 非法表名 400 | ✅ | 400 |
| backup | list 备份列表 | ✅ | 200 |
| backup | create 创建备份（数据库） | ✅ | 200 {'ok': True, 'entry': {'file': 'backup-20261003-024420.apzip', 'size': 306925, 'sizeMB': 0.29, 'createdAt': '2026-10-02T18:44:20.255Z', 'mediaCount': 4, 'tablesCount': 13, 'skipped': []}} |
| backup | download 下载 .apzip | ✅ | 200 application/zip |
| backup | download 路径穿越 400 | ✅ | 400 |
| backup | restore 非 multipart 400 | ✅ | 400 |
| backup | restore 指定不存在备份 404 | ✅ | 404 |
| backup | delete 删除备份 | ✅ | 200 |
| config-io | export 指定 section | ✅ | 200 |
| config-io | export 非法 section 400 | ✅ | 400 |
| config-io | export 全量导出 | ✅ | 200 622490 |
| config-io | 导出内容已剥离 AUTH_SECRET 密钥 | ✅ |  |
| config-io | import 回导自身导出（幂等） | ✅ | 200 |
| config-io | import 非法 JSON 400 | ✅ | 400 |
| comments | 设置枚举/范围清洗（order→asc, perPage≤100） | ✅ | {'enabled': True, 'autoApprove': False, 'order': 'asc', 'perPage': 100, 'closedTypes': []} |
| comments | 匿名 JSON 提交评论 201 | ✅ | 201 {'ok': True, 'status': 'pending'} |
| comments | 蜜罐命中静默 202 | ✅ | 202 |
| comments | 匿名 form-urlencoded 提交 201 | ✅ | 201 |
| comments | 同 IP 第3条放行、第4条 429（30秒/3条） | ✅ | 201/429 |
| comments | 评论不存在文章 400 | ✅ | 400 |
| comments | 非法 website 协议 400 | ✅ | 400 |
| comments | 超大请求体 413（64KB 上限） | ✅ | 413 |
| comments | list 待审列表含新评论 | ✅ | 3 |
| comments | action 审核通过 | ✅ | 200 |
| comments | reply 回复评论 | ✅ | {'ok': True, 'id': 160, 'status': 'approved'} |
| comments | reply 空内容 400 | ✅ | 400 |
| comments | action 未知动作 400 | ✅ | 400 |
| comments | action 空 ids 400 | ✅ | 400 |
| comments | 测试评论已清理 | ✅ | ids=[159, 158, 157] |
| redirect | list 规则列表 | ✅ | <class 'list'> |
| redirect | 成环规则创建被拒 400 | ✅ | 400 |
| redirect | 重复 from 400 | ✅ | 400 |
| redirect | 保留前缀 400 | ✅ | 400 |
| redirect | 创建合法 302 规则 | ✅ | 200 |
| redirect | 匿名访问命中 302 跳转 | ✅ | 302 /blog/pv-tips |
| redirect | delete 规则 /f-rd-a-fe77bd58 | ✅ | 200 |
| redirect | delete 规则 /f-rd-ok-fe77bd58 | ✅ | 200 |
| redirect | delete 缺 id 400 | ✅ | 400 |
| link-directory | cats 创建分类 | ✅ | {'ok': True, 'cat': {'id': 32, 'name': 'F轮分类fe77bd58', 'slug': 'fcat-fe77bd58', 'sort': 0, 'createdAt': '2026-10-02 18:44:20'}} |
| link-directory | cats 空名称 400 | ✅ | 400 |
| link-directory | links 非法 URL 400 | ✅ | 400 |
| link-directory | links 创建待审链接 | ✅ | 200 {'ok': True, 'link': {'id': 31, 'catId': 32, 'name': 'F轮链接fe77bd58', 'url': 'https://example.com/fround', 'description': '', 'clicks': 0, 'status': 'pending', 'createdAt': '2026-10-02 18:44:20'}} |
| link-directory | click 待审链接不跳转 404 | ✅ | 404 |
| link-directory | links 审核通过 | ✅ | 200 |
| link-directory | click 已审链接 302 跳转 | ✅ | 302 |
| link-directory | click 非法 id 404 | ✅ | 404 |
| link-directory | 公开目录页 /directory 200 | ✅ | 200 |
| link-directory | links 删除链接 | ✅ | 200 |
| link-directory | cats 删除空分类 | ✅ | 200 |
| link-directory | settings 保存往返 | ✅ | 200 |
| ads-manager | slots 新增广告位 | ✅ | 200 |
| ads-manager | slots 非法 key 400 | ✅ | 400 |
| ads-manager | slots 重复 key 400 | ✅ | 400 |
| ads-manager | track 空事件 400 | ✅ | 400 |
| ads-manager | track 超大请求体 413（32KB 上限） | ✅ | 413 |
| ads-manager | track 批量事件（非法项静默跳过）200 | ✅ | 200 |
| ads-manager | track CORS 预检 204（生产带 ACAO:* / dev 为 Vite 占位） | ✅ | 204 {'vary': 'Origin, Access-Control-Request-Headers', 'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', 'content-length': '0', 'date': 'Fri, 02 Oct 2026 18:44:21 GMT', 'connection': 'close'} |
| ads-manager | loader.js 匿名可访问（JS 内容） | ✅ | 200 application/javascript; charset=utf-8 |
| footer | customHtml 原样存储（消毒在输出端） | ✅ | <b>ok</b><script>alert(1)</script><img src=x onerror=alert(1)><svg/onload=alert(1)></svg><a href="javascript:alert(1)">evil</a><a href="https://example.com" target="_blank">safe</a> |
| donation | javascript: URL 被清空 | ✅ |  |
| donation | 前台输出层过滤 DB 直改的 javascript: 且保留合法爱发电链接 | ✅ | 200 block=True |
| customer-service | 非法颜色/位置回退默认 | ✅ | bottom-right #2271b1 |
| related-posts | 数值夹取 0..12 | ✅ | {'enabled': True, 'related': 12, 'random': 0, 'popular': 4, 'heading': '更多阅读', 'css': ''} |
| search | perPage/minChars 夹取 | ✅ | {'enabled': True, 'perPage': 100, 'minChars': 10, 'placeholder': '搜索…', 'injectButton': True} |
| search | 公开搜索页 200 且含搜索表单 | ✅ | 200 |
| seo-tools | feedCount 下限夹取 1 + 字段合并保留标题 | ✅ | {'feedEnabled': True, 'feedCount': 1, 'feedTitle': '', 'feedDescription': '', 'robotsExtra': ''} |
| html-opt | preconnect 净化：去 javascript:/去重/保留合法 | ✅ | ['https://fonts.googleapis.com'] |
| image-lazy | skipFirst 夹取 ≤20 | ✅ | {'enabled': True, 'lazyImages': True, 'lazyIframes': True, 'skipFirst': 20} |
| security-headers | CSP 剥离 CRLF 防头注入 | ✅ | "default-src 'self'X-Evil: 1" |
| page-cache | ttl/maxEntries 夹取 | ✅ | {'enabled': True, 'ttlSec': 86400, 'maxEntries': 10, 'cache404': False, 'cacheWithQuery': False, 'excludes': []} |
| page-cache | 首访 MISS → 二访 HIT | ✅ | MISS/HIT |
| page-cache | HIT 带 Age + Cache-Control:no-cache | ✅ | 0 |
| image-lazy | 正文图片补 loading/decoding | ✅ | 12/12 |
| html-opt | MISS 响应头 X-HTML-Opt: on（HIT 由缓存重建响应，按设计不带此头） | ✅ | on |
| html-opt | head 注入 preconnect 资源提示 | ✅ |  |
| footer | 前台输出白名单消毒（script/onerror/svg onload/javascript: 全剥，留安全标签与外链） | ✅ |  {   margin-top: 8px; } .ap-footer-powered a {   color: inherit;   text-decoration: none; } .ap-footer-powered a:hover {   text-decoration: underline; } </style> <footer id="ap-footer" class="ap-foote |
| security-headers | nosniff/X-Frame-Options/Referrer-Policy/HSTS/CSP | ✅ | {'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'strict-transport-security': 'max-age=31536000; includeSubDomains', 'content-security-policy': "default-src 'self'X-Evil: 1"} |
| related-posts | 相关文章区块注入 | ✅ |  |
| related-posts | track 追踪像素恒 200 GIF | ✅ | 200 |
| related-posts | track 非法 id 仍 200（不报错） | ✅ | 200 |
| share | enabled 缺省按 false 处理（特例语义） | ✅ | False |
| share | 禁用后文章页不注入分享条 | ✅ |  |
| sitemap | sitemap.xml 匿名 200 XML 含文章 | ✅ | 200 |
| sitemap | 禁用后 sitemap 404 | ✅ | 200/404 |
| sitemap | 重新启用后恢复 200 | ✅ | 200 |
| seo-tools | rss.xml 200 且为 RSS 2.0 | ✅ | 200 |
| seo-tools | 关闭 feed 后 rss 404 | ✅ | 404 |
| seo-tools | robots.txt 200 含 Disallow | ✅ | 200 |
| webhook | keys 创建密钥（明文仅返回一次） | ✅ | 200 |
| webhook | keys 空名称 400 | ✅ | 400 |
| webhook | keys 列表不回显密钥/hash | ✅ | [{'id': '164385ebe1f915c8', 'name': 'F轮全权限fe77bd58', 'permissions': ['publish', 'delete'], 'createdAt': 1790966678491, 'lastUsed': None}, {'id': 'ab1c |
| webhook | status 无 key 401 | ✅ | 401 |
| webhook | status 带 key 200 + 权限 | ✅ | 200 |
| webhook | publish 新建草稿 | ✅ | 200 {'ok': True, 'action': 'created', 'postId': 139, 'slug': 'f-round-fe77bd58', 'type': 'post', 'status': 'draft', 'url': '/blog/f-round-fe77bd58'} |
| webhook | publish 同 slug 幂等更新 | ✅ | {'ok': True, 'action': 'updated', 'postId': 139, 'slug': 'f-round-fe77bd58', 'type': 'post', 'status': 'draft', 'url': '/blog/f-round-fe77bd58'} |
| webhook | publish title/content 皆空 400 | ✅ | 400 |
| webhook | publish 无效 key 403 | ✅ | 403 |
| webhook | delete 无权限 403 | ✅ | 403 |
| webhook | delete 有权限删除文章 | ✅ | 200 |
| webhook | delete 再删 404 | ✅ | 404 |
| webhook | logs 审计日志可读 | ✅ | 200 |
| webhook | keys 删除不存在 id 返回 200 ok:false（契约特例） | ✅ | {'ok': False} |
| webhook | 测试密钥已清理 | ✅ |  |
| webdav | token 生成（明文一次） | ✅ | 200 |
| webdav | token GET 仅返回 hasToken 不回显 | ✅ | 200 |
| webdav | token 重置缺 confirm 400 | ✅ | 400 |
| webdav | 匿名 PROPFIND 401 | ✅ | 401 |
| webdav | 401 带 WWW-Authenticate: Basic | ✅ | Basic realm="AstroPress WebDAV", charset="UTF-8" |
| webdav | PROPFIND 根目录 207 multistatus | ✅ | 207 |
| webdav | MKCOL 新建目录 201 | ✅ | 201 |
| webdav | MKCOL 已存在 405 | ✅ | 405 |
| webdav | PUT 新文件 201 | ✅ | 201 |
| webdav | PUT 覆盖 204 | ✅ | 204 |
| webdav | GET 内容一致 | ✅ | 200 |
| webdav | GET 目录 403 | ✅ | 403 |
| webdav | 路径穿越 403/404 | ✅ | 404 |
| webdav | stats 存储统计 files≥1 | ✅ | {'ok': True, 'files': 1, 'bytes': 12, 'dir': 'D:\\Projects\\Blogs\\AstroPress\\webdav-storage'} |
| webdav | DELETE 递归清理目录 204 | ✅ | 204 |
| webdav | OPTIONS DAV 能力头（生产 200+DAV / dev 204 Vite 占位） | ✅ | 204  |
| permalink | 后台设置保存 200 | ✅ | 200 |
| permalink | 单段旧链接 /pv-tips 重写到文章页 200 | ✅ | 200 |
| editor-scripts | /api/ap-wp-editor/wp-editor.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-wp-editor/wp-editor.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-scripts | /api/ap-etools/tools.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-etools/tools.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-scripts | /api/ap-media/editor-upload.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-media/editor-upload.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-scripts | /api/ap-media-av/media-av.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-media-av/media-av.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-scripts | /api/ap-mirror/image-mirror.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-mirror/image-mirror.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-scripts | /api/ap-autofill/script.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-autofill/script.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-scripts | /api/ap-i18n/script.js 登录态 200 | ✅ | 200 |
| editor-scripts | /api/ap-i18n/script.js 匿名拿不到 JS（被登录墙拦截） | ✅ | 200 text/html |
| editor-upload | 真实 1x1 PNG 上传 201 | ✅ | 201 {'id': 140, 'url': 'http://localhost:4321/media/1790966679191-f-round-fe77bd58.png', 'filename': '1790966679191-f-round-fe77bd58.png'} |
| editor-upload | meta 更新附件元数据 | ✅ | 200 |
| editor-upload | 改扩展名伪图 magic-byte 拦截 415 | ✅ | 415 |
| media-av | 伪音频 magic-byte 拦截 415 | ✅ | 415 |
| media-av | 扩展名白名单 415 | ✅ | 415 |
| ai-autofill | write 空 topic 400 | ✅ | 400 |
| ai-autofill | generate 全空 400 | ✅ | 400 |
| editor-tools | translate 非法 target 400 | ✅ | 400 |
| ai-chat | status 提供商列表 | ✅ | 200 |
| ai-chat | login 未知 action 400 | ✅ | 400 |
| ai-chat | send 空 prompt 400 | ✅ | 400 |
| admin-i18n | 非法 target 语言码 400 | ✅ | 400 |
| admin-i18n | test 未配置 webhook 时优雅返回 configured:false | ✅ | 200 |
| gist-sync | settings GET（token 掩码，hasToken 嵌在 settings） | ✅ | 200 |
| gist-sync | push 无 token 400 | ✅ | 400 |
| gist-sync | push 缺 confirm 403 | ✅ | 403 |
| gist-sync | history 可读 | ✅ | 200 |
| git-sync | settings GET | ✅ | 200 |
| git-sync | settings 缺 confirm 403 | ✅ | 403 |
| git-sync | 非法 preset 400 | ✅ | 400 |
| git-sync | scopes 全 false 400 | ✅ | 400 |
| git-sync | history 可读（{ok,history}） | ✅ | 200 |
| static-html | settings 保存（小规模参数） | ✅ | 200 |
| static-html | generate 缺 confirm 400 | ✅ | 400 |
| static-html | generate 触发生成 | ✅ | 200 {'ok': True} |
| static-html | 生成完成且 static-html/index.html 已产出 | ✅ | state={'running': False, 'trigger': 'manual', 'startedAt': '2026-10-02T18:44:40.101Z', 'finishedAt': '2026-10-02T18:44:40.335Z', 'status': 'ok', 'phase': '生成完成', 'pages': 6, 'assets': 0, 'bytes': 302411, 'outputDir': 'static-html', 'errors': [], 'lastAutoAt': None, 'origin': 'http://localhost:4321'} |
| db-optimize | stats 库统计 | ✅ | ['supported', 'dbBytes', 'pageCount', 'pageSize', 'tables', 'autoload', 'revisions'] |
| db-optimize | run 非法 action 400 | ✅ | 400 |
| db-optimize | run 缺 confirm 400 | ✅ | 400 |
| db-optimize | ANALYZE 执行 | ✅ | 200 {'ok': True, 'action': 'analyze', 'bytesBefore': 942080, 'bytesAfter': 942080, 'reclaimed': 0} |
| db-optimize | 清理修订版本 | ✅ | 200 |
| error-monitor | 匿名 404 被记录 | ✅ | 3 rows |
| error-monitor | delete 缺 path 400 | ✅ | 400 |
| error-monitor | delete 缺 confirm 400 | ✅ | 400 |
| error-monitor | delete 删除单条记录 | ✅ | 200 |
| error-monitor | 删除后列表不再含该路径 | ✅ |  |
| multilingual | 公开 config 匿名可读 | ✅ | 200 |
| multilingual | switcher.js 匿名 200 | ✅ | 200 |
| multilingual | panel.js 匿名 200 | ✅ | 200 |
| multilingual | 非法语言码 400 | ✅ | 400 |
| multilingual | 启用中英双语 | ✅ | 200 |
| multilingual | config 反映两种语言 | ✅ | 200 |
| multilingual | strings 非字符串值 400 | ✅ | 400 |
| multilingual | strings 保存译文 | ✅ | 200 |
| multilingual | strings 读取译文 | ✅ | 200 |
| multilingual | 文章自链 400 | ✅ | 400 |
| plugin-manager | state 列出全部 40 插件 | ✅ | 40 |
| plugin-manager | 非法 slug 400 | ✅ | 400 |
| plugin-manager | 系统插件禁禁用 400 | ✅ | seo 400 |
| plugin-manager | 禁用 html-opt | ✅ | 200 |
| plugin-manager | 被禁插件路由立即 404（guard pre） | ✅ | 404 |
| plugin-manager | 禁用后首个前台 MISS 即无 X-HTML-Opt 头（共享缓存即时失效） | ✅ | None |
| plugin-manager | 禁用后前台 MISS 无 X-HTML-Opt 头（≤32s 生效） | ✅ | None |
| plugin-manager | 重新启用 html-opt | ✅ | 200 |
| plugin-manager | 重新启用后路由恢复 | ✅ | 200 |
| plugin-manager | 启用后首个前台 MISS 即恢复 X-HTML-Opt 头（共享缓存即时失效） | ✅ | on |
| plugin-manager | 重新启用后前台 MISS 恢复 X-HTML-Opt 头（≤32s） | ✅ | on |
| plugin-manager | purge 未知插件 404 | ✅ | 404 |
| plugin-manager | purge 系统插件 400 | ✅ | 400 |
| plugin-manager | purge 清除 share 配置 | ✅ | {'ok': True, 'removed': 1} |
| admin-pages | 全部 33 个后台页 200 且渲染 HTML | ✅ | [] |

</details>
