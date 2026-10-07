# AstroPress 插件全功能测试报告（B 轮 · 深度回归）

- 测试日期：2026-10-02
- 测试范围：全部已装配插件（30+），重点为本轮新增/修改的 **static-html 静态导出插件**、**文件管理器（编辑器工具栏 + 全部文件操作）**、**客服/打赏等 7 个插件的注册修复**、**插件管理器禁用链路** 与 **前台注入中间件性能**
- 测试环境：Windows + Astro 4.16 SSR 开发服务器（http://localhost:4321，SQLite `local.db`，Node 单实例）
- 测试方式：
  - 自动化 API 黑盒测试（Python 标准库 urllib，登录态 + 匿名双会话，Origin/CSRF 探针）
  - 真实浏览器 UI 交互验证（Chromium 自动化：登录、点击、弹窗、控制台错误收集）
  - TypeScript 编译门禁（所有改动插件目录 `tsc --noEmit` 零错误）+ 编辑器静态诊断零告警
  - 真实端到端静态生成（实际抓取本站 6 个页面并落盘校验 sitemap/rss/资源）
- 测试原则：不破坏真实数据。文件管理器全部写操作在站点根下 `_fmtest_<8位hex>` 沙箱目录进行，经插件自身 delete API 递归清理，并有本地 `shutil.rmtree` 兜底；设置类用例保存前读取原值、结束后还原。
- 测试脚本：
  - `scripts/test-plugins-full.py`（217 项，全量基线）
  - `scripts/test-new-plugins.py`（53 项，第六轮新插件专项，与上者合并写盘）
  - `scripts/test-b-round.py`（**本轮新增，107 项 B 轮深度用例**）
  - 原始结果：`scripts/plugin-test-result.json`（270 项）、`scripts/plugin-test-result-b.json`（107 项）

---

## 一、需求与测试映射

| # | 用户需求 | 交付内容 | 验证方式 | 结论 |
|---|---|---|---|---|
| 1 | 客服/打赏插件无法设置 | 插件管理器 REGISTRY 补注册 7 个插件（customer-service、donation、footer、permalink、share、sitemap、static-html），设置入口/路由/侧边栏/选项键/隐藏选择器全部补齐；permalink 增加禁用闸门 | 13 项注册用例 + 18 项管理器链路用例 + 浏览器截图 | ✅ 通过 |
| 2 | 类 WordPress 的静态 HTML 生成插件，可定时、同时生成 sitemap/RSS | 新插件 `plugins/static-html/`：手动/每小时/每天定点/每周定点计划（WP-Cron 风格调度器）、并发抓取、目录式落盘、同源静态资源、sitemap.xml、rss.xml、运行状态与历史 | 25 项用例 + 2 次真实生成 + 产物逐文件校验 | ✅ 通过 |
| 3 | 文件管理器编辑文件没有工具栏，参考宝塔 | 编辑器弹窗重做：工具栏（保存/重载/撤销/重做/查找替换/转到行/自动换行/字号/语言标识）、行号、状态栏、快捷键 | 42 项 API 用例 + 浏览器 DOM/控制台验证 | ✅ 通过 |
| 4 | 所有插件所有功能一一测试并出 MD 报告 | 270 项基线全量回归 + 107 项 B 轮深度用例；本报告 | 见第二~六章 | ✅ 通过 |
| 5 | 100 轮深入排错优化，尤其性能、降低 BUG 率 | 修复 8 个真实问题（含 1 个 P1 功能阻断、3 个 P2 正确性/性能问题）；禁用闸门与热路径性能优化；全部用例回归 | 第七~八章 | ✅ 通过 |
| 6 | 更新 README / CHANGELOG | 已更新 | 文档复核 | ✅ 通过 |

---

## 二、总体结论

**本轮自动化断言合计 377 项，全部通过（PASS 377 / FAIL 0）。**

| 套件 | 用例数 | 通过 | 失败 | 结果文件 |
|---|---:|---:|---:|---|
| 全量基线 `test-plugins-full.py` | 217 | 217 | 0 | `scripts/plugin-test-result.json` |
| 新插件专项 `test-new-plugins.py` | 53 | 53 | 0 | （合并入同一结果文件，合计 270） |
| **B 轮深度 `test-b-round.py`** | **107** | **107** | **0** | `scripts/plugin-test-result-b.json` |
| **合计** | **377** | **377** | **0** | — |

- 所有写操作接口的 401 鉴权、同源 Origin CSRF、`confirm:true` 二次确认在新增代码上全部复测有效。
- 路径穿越（含 `../../../../Windows/win.ini`、绝对路径、盘符、系统目录）、zip-slip、zip-bomb 防护全部有效。
- 唯一的运行告警为站点数据问题：打赏二维码配置指向尚不存在的 `/media/wx.png`、`/media/ali.png`（后台未上传真实二维码图片），属 404 数据告警而非代码缺陷；上传真实图片后告警自动消失。

---

## 三、B 轮分模块结果（107 项）

| 模块分组 | 用例数 | 通过 | 失败 | 覆盖要点 |
|---|---:|---:|---:|---|
| 测试准备（登录） | 1 | 1 | 0 | username/password 登录态 |
| registry-fix（注册修复） | 13 | 13 | 0 | 7 插件 REGISTRY 元数据、设置页 200、设置 API、sitemap 页内 POST、匿名拦截 |
| plugin-manager（禁用链路） | 18 | 18 | 0 | 7 插件启用/禁用切换、禁用后公开路由 404、启用恢复（customer-service/donation/permalink 实测） |
| injection-gate（注入闸门） | 8 | 8 | 0 | 客服/页脚（全站）、分享/打赏（文章页）启用时注入、管理器禁用后 HTML 零注入 |
| file-manager（文件管理器） | 42 | 42 | 0 | 见第五章功能矩阵 |
| static-html（静态导出） | 25 | 25 | 0 | 见第六章功能矩阵 |
| **合计** | **107** | **107** | **0** | — |

### 270 项基线回归（同日改动后复跑）

基线套件覆盖全部已装配插件的后台 API、公开端点、注入资源与管理页面（分插件明细：db-console 24、redirect 20、comments 18、link-directory 16、webhook-publisher 15、ads-manager 12、webdav 12、donation 11、multilingual 10、share 9、sitemap 9、plugin-manager 8、backup 7、config-io 7、seo-tools 7、customer-service 7、公开页面 7、git-sync 7、related-posts 6、editor-upload 6、ai-chat 5、admin-i18n 5、permalink 5、search 5、gist-sync 4、media-av 3、核心 2、ai-autofill 2、editor-tools 2、wp-editor 1、image-mirror 1、setup 1、file-manager 8、footer 8），结果 **270/270 全部通过**，无回归。

---

## 四、浏览器 UI 验证（需求 1 / 3）

通过真实 Chromium 会话完成（未登录时先在 `/login` 以 admin 登录）：

| 页面 | 验证项 | 结果 |
|---|---|---|
| `/admin-ext/plugin-manager` | 「在线客服」「文章打赏」「页脚设置」「固定链接」「社交分享」「网站地图」「静态HTML生成」7 张卡片均显示「设置」按钮 | ✅ |
| `/admin-ext/files` 编辑弹窗（README.md） | 工具栏 9 个按钮（💾保存、↻重新载入、↶撤销、↷重做、🔍查找替换、⤓转到行、自动换行、A−、A+）、右侧语言标识、左侧行号 gutter、底部状态栏（行列/已选字符/总字符/UTF-8 字节/未保存标记） | ✅ |
| 编辑弹窗查找栏 | 点击「🔍 查找替换」展开查找/替换输入框（`#feFindBar.is-open`），控制台无 error；首次会话出现的 vite 遮罩为 HMR 瞬时重编译提示，二次复现未再出现 | ✅ |
| `/admin-ext/static-html` | 输出目录、定时计划（手动/每小时/每天定点/每周定点 + 时间）、立即生成按钮、实时状态区、生成历史表格（多条记录） | ✅ |

---

## 五、文件管理器全功能矩阵（42 项 API 黑盒，需求 3/4）

沙箱目录 `_fmtest_<hex>` 建在站点根，全部用例后递归删除并二次确认 404。

| 功能 | 用例要点 | 结果 |
|---|---|---|
| 新建目录 mkdir | 根目录、二级子目录、重复创建返回 409 | ✅ |
| 上传 upload（multipart） | 初始 a.txt、upload.txt；同目录上传成功 | ✅ |
| 保存/编辑 write | 编辑已存在文本文件（含中文/Tab/`<>\"'` 特殊符号，字节数正确）；缺 `confirm` 返回 403；编辑不存在文件返回 404（新建文件统一走上传，避免任意路径落盘） | ✅ |
| 查看 read | 内容逐字节一致；不存在 404；读目录 400；`../../../../Windows/win.ini` 穿越被拒 | ✅ |
| 列表 list | `items` 含目录/文件，排序正确 | ✅ |
| 重命名 rename | a.txt→b.txt 成功且内容不变；旧名 404；新名含分隔符 `x/y.txt` 返回 400 | ✅ |
| 复制 copy | b.txt→sub/ 成功、目标内容一致、源仍在；缺 confirm 403 | ✅ |
| 移动 move | b.txt→sub2/：新位 200、旧位 404 | ✅ |
| 打包 zip | sub 目录打包返回文件路径/大小/条目数，zip 真实落盘 | ✅ |
| 解压 unzip | 解压成功且条目数为 1、嵌套目录内文件内容正确；对非 zip 路径解压返回 400；目录冲突自动 `-extracted[-N]`；内置 zip-slip（绝对路径/盘符/`..`/null 字节/受保护路径）与 zip-bomb（256MB 包体/512MB 展开/2 万条目）防护 | ✅ |
| 下载 download | 200 且字节与上传内容一致；带 `Content-Disposition` 附件头 | ✅ |
| 目录树 dirs | API 200，供编辑器/移动选择目录 | ✅ |
| 删除 delete | 缺 confirm 403；单文件删除后 404；沙箱整目录递归删除后 list 404 | ✅ |
| 安全 | 写 `.git` 受保护目录被拒；`node_modules` 建目录被拒；write 穿越被拒；匿名 list 被拦截（401/403/302） | ✅ |
| 编辑器 UI | 工具栏/行号/状态栏/查找栏浏览器实测通过；Ctrl+S、Ctrl+F、Ctrl+G、Tab/Shift+Tab 缩进快捷键代码审查通过；只读「查看」模式禁用保存/撤销/替换 | ✅ |

---

## 六、static-html 静态导出插件全功能矩阵（25 项 + 真实生成，需求 2）

插件包：`plugins/static-html/`（`@astropress/plugin-static-html`，v0.1.0），已在插件管理器注册并经三处装配点接线。

| 分组 | 用例要点 | 结果 |
|---|---|---|
| 设置读取 | 默认结构完整（enabled/outputDir/schedule/scheduleTime/scheduleWeekday/includePages/includeAssets/maxPosts） | ✅ |
| 设置保存 | 全字段 POST 持久化、GET 回读逐字段一致 | ✅ |
| 输入校验 | 非法输出目录/非法计划/`99:99` 时间回退默认；`apps` 系统目录拒绝；`C:\Windows\x` 绝对路径拒绝 | ✅ |
| 安全 | 跨域 Origin POST 设置 403；跨域触发生成 403；匿名 GET status 被拦截；generate 缺 confirm 400；非法 JSON 400；运行中重复触发 409 | ✅ |
| 手动生成 | 触发 200，任务在限时内结束；状态为 ok/warn 且无页面失败 | ✅ |
| 页面产物 | 首页 `index.html`；文章目录式 `blog/{slug}/index.html`（实测 `blog/pv-tips/index.html`）；本次站点 6 页面全部导出 | ✅ |
| sitemap | `sitemap.xml` 存在且为合法 XML，含文章 URL `/blog/...`、lastmod | ✅ |
| RSS | `rss.xml` 存在且合法，含 `<item>` 与文章链接、RFC822 日期 | ✅ |
| 资源抓取 | 同源静态资源白名单（`/_astro/`、`/assets/` + js/css/图片/字体等扩展名），并发 4、单页 20s/资源 30s 超时、资源 2000/错误 50 上限 | ✅ |
| 洁净度 | 导出 HTML 不含 dev-only 标签（`/@vite/`、`/@fs/`、`<astro-dev-toolbar>`、vite 错误浮层）；重新生成已清空旧产物（历史遗留 `@vite/client` 被清除） | ✅ |
| 历史与状态 | 历史记录 ≥1 条（保留最近 20 条）；状态含 phase/pages/assets/bytes/errors；进程互斥（同进程重复触发 409，进程重启后残留 running 自动标记中断） | ✅ |
| 定时调度 | WP-Cron 风格：后台访问驱动 60s tick（timer `unref` 不阻止退出），支持 hourly/daily 定点/weekly + 先落 lastAutoAt 防重复；手动/计划触发均落运行历史 | ✅（代码审查 + isDue 逻辑走查；调度触发依赖访问，属设计特性） |
| 二次生成 | 覆盖生成成功，旧目录先清空再重建 | ✅ |

---

## 七、本轮发现并修复的缺陷

| 级别 | 问题 | 根因 | 修复 |
|---|---|---|---|
| P1（功能阻断） | 客服/打赏等 7 个插件卡片无「设置」按钮，禁用/清理链路不完整 | 未在插件管理器 REGISTRY 注册元数据 | 补全 7 条注册（settingsUrl/routePrefixes/sidebarHrefs/assetPrefixes/frontendHideSelectors/optionKeys），REGISTRY 成为唯一装配事实源 |
| P1（逻辑错误） | permalink 被插件管理器禁用后仍执行 `/blog/` 重写 | 中间件不感知管理器状态 | 增加 15s 缓存的 `pluginDisabled()` 闸门（fail-open） |
| P2（正确性） | 静态生成偶发 EISDIR 且产物被污染（页面链接、dev `/src/*.astro` 被当文件保存） | 通用 `src\|href\|srcset` 正则误抓 `<a href>` 与 dev 模块路径 | 改为标签白名单（script/link/img/source/audio/video/use）+ 扩展名/构建前缀双白名单 |
| P2（产物质量） | 从 dev server 导出的 HTML 含 Vite HMR 客户端与 Astro 调试工具栏（部署后死链/噪音） | 导出未区分 dev/生产注入 | `stripDevOnly()` 导出前剥离 `/@vite/`、`/@fs/` 标签与 `astro-dev-toolbar`/`vite-error-overlay`；资源白名单移除 `/@vite/` |
| P2（陈旧数据） | 重新生成不清空输出目录，已删除页面与上一代资源残留 | 生成只做覆盖写 | 生成前对已校验的输出目录 `rm -rf` + 重建（带 `isSafeOutputDir` 二次防御） |
| P3（性能） | 客服/打赏/分享/页脚被管理器禁用后，仍每请求读设置并 `res.clone().text()` 克隆整页 HTML；related-posts/comments/ads-manager 在自身 enabled 判定**之前**就克隆整页 | 闸门顺序错误 | 6 个中间件统一为「管理器禁用闸门（15s 缓存）→ 自身设置闸门 → 克隆 HTML」；广告插件改为先取广告位缓存（无广告位零克隆） |
| P3（体验） | 文件管理器编辑弹窗无工具栏 | 旧版仅裸 textarea | 宝塔风格工具栏 + 行号 + 状态栏 + 快捷键，零外部依赖原生 JS |
| P3（健壮性） | 生成失败/中断后状态可能长期停留在 running | 无进程级互斥与残留恢复 | 进程内互斥锁 + 启动恢复（残留 running 标记 error 中断） |

---

## 八、性能与安全优化记录（需求 5）

### 性能（热路径）

- **消除禁用插件的整页 HTML 克隆**：`res.clone().text()` 是每个 HTML 请求最重的插件开销。customer-service、donation、share、footer 新增管理器禁用闸门；related-posts、comments 将「设置 enabled 判定」前移到克隆之前；ads-manager 将广告位/广告单元缓存判定前移——未启用/无广告时不克隆响应体。
- 所有禁用/设置状态读取均带 **15s 内存缓存**，正常请求零额外 SQL；缓存失败一律 fail-open，不拖垮页面。
- 静态生成：单 DB 快照收集 URL；页面并发 4、资源并发有上限；进度 1s 节流落库；资源 2000 上限/错误 50 上限/单页 20s 与资源 30s 超时，防止异常站点拖死任务。
- 调度器 60s 单次 tick、`unref()`，无访问时零开销、不阻止进程退出。

### 安全（复测有效）

- 新增 3 个 static-html API 全部具备：`locals.user` 401、同源 Origin CSRF 403、写操作 `confirm:true`、非法 JSON 400、运行中 409。
- 输出目录三重防护：禁绝对路径/盘符/UNC、禁穿越段、禁系统顶层目录（.git/node_modules/apps/packages/plugins/scripts/panel/public/data 等）、禁写站点根。
- 文件管理器既有防线本轮逐项复测：写 confirm、路径沙箱、.git/node_modules 保护、zip-slip、zip-bomb 三上限、下载附件头、匿名拦截。
- 静态导出后台页运行历史全部用 `textContent`/转义渲染，无 XSS sink。

---

## 九、已知限制与后续建议

1. **打赏二维码 404 告警**：站点当前配置的 `/media/wx.png`、`/media/ali.png` 不存在，静态生成因此记 2 条 warn。上传真实二维码后消失（非缺陷）。
2. **禁用状态最长 15s 延迟生效**：为零 SQL 热路径所做的缓存权衡；自动化用例已按缓存周期等待验证。
3. **撤销/重做**使用浏览器 `document.execCommand("undo"/"redo")`：Chromium 系完整可用；该 API 已被标记废弃，未来可替换为自定义历史栈。
4. **定时任务为 WP-Cron 语义**：需要站点有访问才会触发；要求严格准点（无人访问也执行）的场景建议改用系统计划任务调用生成接口。
5. **多 Node 进程并发导出**：互斥锁为进程内；生产环境单实例运行，多实例共享同一输出目录的场景需要文件锁（当前部署形态不涉及）。
6. 建议正式对外静态包从**生产构建**（`astro build`）运行生成，dev-only 注入虽已剥离，生产构建的资源哈希本就更稳定。

---

## 十、复现方式

```powershell
# 1. 启动开发服务器（仓库根）
npm run dev
# 等待 http://localhost:4321 就绪

# 2. 全量基线回归（217 + 53，结果合并写 scripts/plugin-test-result.json）
python scripts/test-plugins-full.py
python scripts/test-new-plugins.py

# 3. B 轮深度测试（107 项，写 scripts/plugin-test-result-b.json）
python scripts/test-b-round.py

# 4. 改动插件的类型门禁（示例）
pushd plugins/static-html; npx tsc --noEmit; popd
```

测试账号使用管理员登录（`username`/`password` 表单字段）；文件管理器用例自创建 `_fmtest_*` 沙箱并自清；static-html 用例结束后还原原设置；默认导出目录 `static-html/` 已加入 `.gitignore`。

---

## 十一、结论

本轮 6 项需求全部交付。377/377 自动化断言通过，浏览器实测 3 个关键页面交互正常，TypeScript 与编辑器诊断零告警，发现的 8 个真实问题全部修复并回归。重点热路径（前台注入中间件）完成「闸门前移」性能优化，新增静态导出插件具备定时调度、sitemap/RSS、安全沙箱与产物洁净度保证。

**测试结论：通过，可进入下一迭代。**
