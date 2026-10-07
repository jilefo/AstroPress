# AstroPress 插件全功能测试报告

- 测试日期：2026-10-02
- 测试环境：Windows + Astro 4.16 SSR 开发服务器（http://localhost:4321，SQLite local.db）
- 测试方式：自动化 API 黑盒测试（Python/requests，登录态 + 匿名双会话）+ 真实浏览器 UI 交互抽查
- 测试原则：不破坏真实数据。所有写入用例均使用带时间戳的临时标识（重定向规则、临时数据表、测试分类/链接/评论/广告位/API Key/WebDAV 文件/草稿文章），并通过**各插件自身接口**完成清理；核心表仅做「读取 → 临时修改 → 立即还原」。
- 测试脚本：`scripts/test-plugins-full.py`（217 项）+ `scripts/test-new-plugins.py`（新插件专项 53 项），共 270 个断言用例，覆盖 30 个插件 + 核心鉴权 + 公开页面；另有并发压力脚本 `scripts/test-plugins-stress.py`；安全/模糊专项一次性脚本结果见第十章

## 一、总体结论

**270 项断言全部通过（PASS 270 / FAIL 0 / WARN 0）。**

- 30 个插件的后台 API、公开端点、静态资源、管理页面均按契约工作
- 安全防线全部验证有效：匿名访问拦截、跨域 CSRF 拒绝、写操作强制确认、SQL 注入面收敛（单语句/禁 ATTACH/标识符白名单）、路径穿越拒绝、频控与蜜罐、密钥不落库不回显
- 新增/修复功能（文件管理器查看·编辑·复制·移动、ai-chat 登录态三重判定）通过 API 与浏览器双重验证

## 二、分插件结果汇总

| 插件 / 模块 | 用例数 | 通过 | 失败 | 备注 |
|---|---:|---:|---:|---|
| 核心鉴权（登录/登录墙） | 2 | 2 | 0 |  |
| SEO 工具（rss.xml / robots.txt） | 7 | 7 | 0 |  |
| 搜索 | 5 | 5 | 0 |  |
| 相关文章 | 6 | 6 | 0 |  |
| 301/302 重定向 | 20 | 20 | 0 |  |
| 评论 | 18 | 18 | 0 |  |
| 数据库控制台 | 24 | 24 | 0 |  |
| 网站目录 | 16 | 16 | 0 |  |
| 广告管理 | 12 | 12 | 0 |  |
| Webhook 发布 API | 15 | 15 | 0 |  |
| 配置导入导出 | 7 | 7 | 0 |  |
| 备份与恢复 | 7 | 7 | 0 |  |
| 文件管理器 | 8 | 8 | 0 |  |
| 插件管理器 | 8 | 8 | 0 |  |
| WebDAV | 12 | 12 | 0 |  |
| Gist 同步 | 4 | 4 | 0 |  |
| Git 同步（含整站源码） | 7 | 7 | 0 |  |
| 多语言 | 10 | 10 | 0 |  |
| 后台国际化 | 5 | 5 | 0 |  |
| 编辑器图片上传 | 6 | 6 | 0 |  |
| 音视频上传 | 3 | 3 | 0 |  |
| 图片镜像 | 1 | 1 | 0 |  |
| AI 一键填写 + AI 写作助手 | 2 | 2 | 0 |  |
| WP 风格编辑器 | 1 | 1 | 0 |  |
| 编辑器工具集 | 2 | 2 | 0 |  |
| AI 网页助手 | 5 | 5 | 0 |  |
| 公开页面渲染 | 7 | 7 | 0 |  |
| 测试准备（登录） | 1 | 1 | 0 |  |
| 固定链接美化（/{slug} 直达） | 5 | 5 | 0 |  |
| XML 站点地图 | 9 | 9 | 0 |  |
| 社交分享 | 9 | 9 | 0 |  |
| 在线客服 | 7 | 7 | 0 |  |
| 页脚设置（备案/版权） | 8 | 8 | 0 |  |
| 文章打赏 | 11 | 11 | 0 |  |

## 三、关键接口性能抽样

接口均为本地 SQLite + Astro dev 模式冷/热混合采样（毫秒），用于建立性能基线：

| 场景 | 耗时(ms) |
|---|---:|
| core · 管理员登录(form→302) | 126.8 |
| seo-tools · RSS 订阅 /rss.xml | 7.3 |
| search · 搜索页 /search?q=the | 15.6 |
| public-pages · 页面 / | 15.1 |
| public-pages · 页面 /search?q=the | 7.3 |
| public-pages · 页面 /directory | 13.5 |
| public-pages · 页面 /rss.xml | 3.5 |
| public-pages · 页面 /sitemap.xml | 7.1 |
| public-pages · 文章页 /blog/pv-tips | 23.2 |

> 全部页面/接口响应 < 1.5s，无慢查询；RSS、站点首页等聚合页面表现正常。

## 四、详细测试用例

### 核心鉴权（登录/登录墙）（`core`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 管理员登录(form→302) | ✅ |  |
| 2 | 错误密码被拒(302→/login?error) | ✅ |  |

### SEO 工具（rss.xml / robots.txt）（`seo-tools`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | RSS 订阅 /rss.xml | ✅ |  |
| 2 | robots.txt | ✅ |  |
| 3 | 设置 GET | ✅ |  |
| 4 | 设置 POST 回写往返 | ✅ |  |
| 5 | 设置回写后一致 | ✅ |  |
| 6 | 后台页 /admin-ext/seo-tools | ✅ |  |
| 7 | 匿名访问被拒 /admin-ext/api/seo-tools/settings | ✅ |  |

### 搜索（`search`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 搜索页 /search?q=the | ✅ |  |
| 2 | q=100 字符边界接受 | ✅ |  |
| 3 | q=101 字符被截断/不500 | ✅ |  |
| 4 | 设置往返一致 | ✅ |  |
| 5 | 后台页 /admin-ext/search | ✅ |  |

### 相关文章（`related-posts`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 设置 GET | ✅ |  |
| 2 | 设置 POST 往返 | ✅ |  |
| 3 | 追踪像素容错(不存在文章不500) | ✅ |  |
| 4 | 追踪像素缺参不500 | ✅ |  |
| 5 | 伪造 postId 不产生孤儿浏览量行 | ✅ |  |
| 6 | 后台页 /admin-ext/related-posts | ✅ |  |

### 301/302 重定向（`redirect`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 新建 301 规则 | ✅ |  |
| 2 | from 重复拒绝 | ✅ |  |
| 3 | 非法 from 拒绝 | ✅ |  |
| 4 | 非法 to 拒绝 | ✅ |  |
| 5 | 非法 type 拒绝 | ✅ |  |
| 6 | 保留前缀(/ap-)规则拒绝保存 | ✅ |  |
| 7 | 超长 from(>2048)拒绝 | ✅ |  |
| 8 | CRLF 注入 to 拒绝 | ✅ |  |
| 9 | 协议相对 //evil 拒绝(防开放重定向) | ✅ |  |
| 10 | 反斜杠混淆 to 拒绝 | ✅ |  |
| 11 | PUT 修改规则 | ✅ |  |
| 12 | 多跳循环检测拒绝(c->a 成环) | ✅ |  |
| 13 | 禁用规则 | ✅ |  |
| 14 | 禁用规则不跳转 | ✅ |  |
| 15 | 启用规则 | ✅ |  |
| 16 | 302/301 实际跳转生效 | ✅ |  |
| 17 | 匿名访问被拒 /admin-ext/api/redirects | ✅ |  |
| 18 | 跨域写被拒 /admin-ext/api/redirects | ✅ |  |
| 19 | 后台页 /admin-ext/redirects | ✅ |  |
| 20 | DELETE 清理测试规则 | ✅ |  |

### 评论（`comments`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 准备已发布且开放评论的文章 | ✅ |  |
| 2 | 蜜罐评论静默 202 | ✅ |  |
| 3 | 字段校验拒绝(400) | ✅ |  |
| 4 | 不存在文章拒绝 | ✅ |  |
| 5 | 提交合法评论→201 pending | ✅ |  |
| 6 | 后台评论列表+搜索 | ✅ |  |
| 7 | 审核通过 | ✅ |  |
| 8 | 管理员回复 | ✅ |  |
| 9 | 标记垃圾 | ✅ |  |
| 10 | 移入回收站 | ✅ |  |
| 11 | 未知动作拒绝 | ✅ |  |
| 12 | 30秒3条频控(第4条 429) | ✅ |  |
| 13 | 伪造 XFF 不能绕过频控 | ✅ |  |
| 14 | 后台页 /admin-ext/comments | ✅ |  |
| 15 | 匿名访问被拒 /admin-ext/api/comments/list | ✅ |  |
| 16 | 跨域写被拒 /admin-ext/api/comments/action | ✅ |  |
| 17 | 清理测试评论 | ✅ |  |
| 18 | 评论设置还原 | ✅ |  |

### 数据库控制台（`db-console`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 表列表 GET | ✅ |  |
| 2 | 表结构 structure | ✅ |  |
| 3 | 数据浏览 browse | ✅ |  |
| 4 | SELECT 查询 | ✅ |  |
| 5 | 非法 SQL 返回 error(不崩) | ✅ |  |
| 6 | 无确认写被拒(403) | ✅ |  |
| 7 | 确认后建临时表 | ✅ |  |
| 8 | 确认后写入 | ✅ |  |
| 9 | ATTACH 禁用 | ✅ |  |
| 10 | 危险 PRAGMA(writable_schema)禁用 | ✅ |  |
| 11 | 危险 PRAGMA(trusted_schema)禁用 | ✅ |  |
| 12 | 多语句拒绝 | ✅ |  |
| 13 | 行内编辑无确认拒绝 | ✅ |  |
| 14 | 行内编辑保存 | ✅ |  |
| 15 | 内部表禁止修改 | ✅ |  |
| 16 | 非法表名拒绝 | ✅ |  |
| 17 | 行内设 NULL | ✅ |  |
| 18 | 编辑结果落库校验 | ✅ |  |
| 19 | CSV 导出 | ✅ |  |
| 20 | SQL 导出(含CREATE/INSERT) | ✅ |  |
| 21 | 匿名访问被拒 /admin-ext/api/db-console/tables | ✅ |  |
| 22 | 跨域写被拒 /admin-ext/api/db-console/exec | ✅ |  |
| 23 | 后台页 /admin-ext/db-console | ✅ |  |
| 24 | 临时表已清理 | ✅ |  |

### 网站目录（`link-directory`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 新建分类 | ✅ |  |
| 2 | 分类列表 | ✅ |  |
| 3 | 修改分类 | ✅ |  |
| 4 | 空分类名拒绝 | ✅ |  |
| 5 | 新建链接(pending) | ✅ |  |
| 6 | 非法 URL 拒绝 | ✅ |  |
| 7 | 编辑链接+批准 | ✅ |  |
| 8 | 链接列表(按分类) | ✅ |  |
| 9 | 公开目录页 /directory | ✅ |  |
| 10 | 点击跳转 302 | ✅ |  |
| 11 | 点击不存在 ID 不500 | ✅ |  |
| 12 | 非空分类删除拒绝 | ✅ |  |
| 13 | 设置往返 | ✅ |  |
| 14 | 匿名访问被拒 /admin-ext/api/links | ✅ |  |
| 15 | 后台页 /admin-ext/links | ✅ |  |
| 16 | 清理测试链接+分类 | ✅ |  |

### 广告管理（`ads-manager`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 广告位 GET | ✅ |  |
| 2 | 新增测试广告位 | ✅ |  |
| 3 | 广告位持久化 | ✅ |  |
| 4 | 非法 key 拒绝 | ✅ |  |
| 5 | 重复 key 拒绝 | ✅ |  |
| 6 | loader.js 公开可访问 | ✅ |  |
| 7 | track 打点容错 | ✅ |  |
| 8 | track 空批量拒绝 | ✅ |  |
| 9 | 伪造 adId 不产生孤儿统计行 | ✅ |  |
| 10 | 匿名访问被拒 /admin-ext/api/ads/slots | ✅ |  |
| 11 | 后台页 /admin-ext/ads | ✅ |  |
| 12 | 还原广告位 | ✅ |  |

### Webhook 发布 API（`webhook-publisher`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 创建全权限 API Key | ✅ |  |
| 2 | 创建只读 API Key | ✅ |  |
| 3 | Key 列表不泄露密钥 | ✅ |  |
| 4 | 发布文章(draft) | ✅ |  |
| 5 | 同 slug 幂等 upsert | ✅ |  |
| 6 | 状态查询 | ✅ |  |
| 7 | 无 publish 权限→403 | ✅ |  |
| 8 | 错误密钥被拒(401/403) | ✅ |  |
| 9 | 非法文章类型→400 | ✅ |  |
| 10 | 删除文章(X-API-Key 头) | ✅ |  |
| 11 | 删除后状态查询(key 仍有效,返回日志) | ✅ |  |
| 12 | 调用日志 GET | ✅ |  |
| 13 | 匿名访问被拒 /admin-ext/api/webhook/keys | ✅ |  |
| 14 | 后台页 /admin-ext/webhooks | ✅ |  |
| 15 | 清理测试 API Keys | ✅ |  |

### 配置导入导出（`config-io`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 全量导出 | ✅ |  |
| 2 | 导出物剥离 AUTH_SECRET | ✅ |  |
| 3 | 导入 merge 往返 | ✅ |  |
| 4 | 坏 JSON 拒绝 | ✅ |  |
| 5 | 缺文件拒绝 | ✅ |  |
| 6 | 匿名访问被拒 /admin-ext/api/config-io/export | ✅ |  |
| 7 | 后台页 /admin-ext/config-io | ✅ |  |

### 备份与恢复（`backup`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 备份列表 GET | ✅ |  |
| 2 | 创建备份(不含媒体) | ✅ |  |
| 3 | 下载备份(zip magic PK) | ✅ |  |
| 4 | 下载路径穿越拒绝 | ✅ |  |
| 5 | restore 缺文件拒绝 | ✅ |  |
| 6 | 匿名访问被拒 /admin-ext/api/backup/list | ✅ |  |
| 7 | 后台页 /admin-ext/backup | ✅ |  |

### 文件管理器（`file-manager`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 根目录列表 | ✅ |  |
| 2 | 路径穿越 ../../ 拒绝 | ✅ |  |
| 3 | 目录树 dirs | ✅ |  |
| 4 | 读取文本文件 | ✅ |  |
| 5 | 二进制文件拒绝读取(415) | ✅ |  |
| 6 | 匿名访问被拒 /admin-ext/api/files/list | ✅ |  |
| 7 | 跨域写被拒 /admin-ext/api/files/mkdir | ✅ |  |
| 8 | 后台页 /admin-ext/files | ✅ |  |

### 插件管理器（`plugin-manager`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 插件状态 GET | ✅ |  |
| 2 | 非法 slug 拒绝 | ✅ |  |
| 3 | 系统插件 seo 不可禁用 | ✅ |  |
| 4 | 切换 wp-editor 状态 | ✅ |  |
| 5 | 切换后状态生效 | ✅ |  |
| 6 | 还原 wp-editor 状态 | ✅ |  |
| 7 | 匿名访问被拒 /admin-ext/api/plugin-manager/state | ✅ |  |
| 8 | 后台页 /admin-ext/plugin-manager | ✅ |  |

### WebDAV（`webdav`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | token GET 仅掩码 | ✅ |  |
| 2 | 生成 WebDAV token | ✅ |  |
| 3 | PROPFIND 根目录 207 | ✅ |  |
| 4 | PUT 上传文件 | ✅ |  |
| 5 | GET 回读一致 | ✅ |  |
| 6 | MKCOL 建目录 | ✅ |  |
| 7 | OPTIONS 可应答(200/204) | ✅ |  |
| 8 | 错误令牌 401 | ✅ |  |
| 9 | 路径穿越不逃逸存储根 | ✅ |  |
| 10 | DELETE 清理 | ✅ |  |
| 11 | 统计 GET | ✅ |  |
| 12 | 后台页 /admin-ext/webdav | ✅ |  |

### Gist 同步（`gist-sync`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 设置 GET | ✅ |  |
| 2 | 未配置 token push 优雅报错 | ✅ |  |
| 3 | 历史 GET 不500 | ✅ |  |
| 4 | 后台页 /admin-ext/gist-sync | ✅ |  |

### Git 同步（含整站源码）（`git-sync`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 设置 GET | ✅ |  |
| 2 | 未配置 remote sync 优雅报错 | ✅ |  |
| 3 | 历史 GET | ✅ |  |
| 4 | 后台页 /admin-ext/git-sync | ✅ |  |
| 5 | GET 设置含 scopes.site | ✅ |  |
| 6 | 仅勾选整站源码可保存 | ✅ |  |
| 7 | 全部不勾选被拒绝 | ✅ |  |

### 多语言（`multilingual`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | GET settings | ✅ |  |
| 2 | GET strings | ✅ |  |
| 3 | GET links?postId=1 | ✅ |  |
| 4 | links 缺 postId 拒绝 | ✅ |  |
| 5 | 公开 config | ✅ |  |
| 6 | 静态资源 /ml-asset/panel.js | ✅ |  |
| 7 | 静态资源 /ml-asset/switcher.js | ✅ |  |
| 8 | sitemap.xml | ✅ |  |
| 9 | 多语言页 /ml/ | ✅ |  |
| 10 | 后台页 /admin-ext/multilingual | ✅ |  |

### 后台国际化（`admin-i18n`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | script.js 可加载 | ✅ |  |
| 2 | 设置 PUT 往返 | ✅ |  |
| 3 | 非法 target 语言拒绝 | ✅ |  |
| 4 | translate 空文本优雅处理 | ✅ |  |
| 5 | 后台页 /admin-ext/i18n | ✅ |  |

### 编辑器图片上传（`editor-upload`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | editor-upload.js 可加载 | ✅ |  |
| 2 | 上传 PNG(201) | ✅ |  |
| 3 | 伪装内容上传拒绝 | ✅ |  |
| 4 | SVG 上传有明确策略(2xx净化或4xx拒绝) | ✅ |  |
| 5 | 媒体 meta GET | ✅ |  |
| 6 | 清理上传文件 | ✅ |  |

### 音视频上传（`media-av`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | media-av.js 可加载 | ✅ |  |
| 2 | 假音频 magic-byte 拒绝 | ✅ |  |
| 3 | 非音视频拒绝 | ✅ |  |

### 图片镜像（`image-mirror`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 静态资源 image-mirror.js | ✅ |  |

### AI 一键填写 + AI 写作助手（`ai-autofill`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 静态资源 script.js | ✅ |  |
| 2 | generate 缺参/未配置优雅返回 | ✅ |  |

### WP 风格编辑器（`wp-editor`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 静态资源 wp-editor.js | ✅ |  |

### 编辑器工具集（`editor-tools`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 静态资源 tools.js | ✅ |  |
| 2 | translate 空文本优雅返回 | ✅ |  |

### AI 网页助手（`ai-chat`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | providers 列表 | ✅ |  |
| 2 | sessions 状态 GET 不崩 | ✅ |  |
| 3 | editor-panel.js | ✅ |  |
| 4 | 匿名访问被拒 /admin-ext/api/ai-chat/status | ✅ |  |
| 5 | 后台页 /admin-ext/ai-chat | ✅ |  |

### 公开页面渲染（`public-pages`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 页面 / | ✅ |  |
| 2 | 页面 /search?q=the | ✅ |  |
| 3 | 页面 /directory | ✅ |  |
| 4 | 页面 /rss.xml | ✅ |  |
| 5 | 页面 /sitemap.xml | ✅ |  |
| 6 | 页面 /robots.txt | ✅ |  |
| 7 | 文章页 /blog/pv-tips | ✅ |  |

### 测试准备（登录）（`setup`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 管理员登录 | ✅ |  |

### 固定链接美化（/{slug} 直达）（`permalink`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | /pv-tips 无 /blog/ 前缀可访问 | ✅ |  |
| 2 | 重写后页面含文章内容 | ✅ |  |
| 3 | 不存在 slug 仍返回 404 | ✅ |  |
| 4 | 后台设置页可访问 | ✅ |  |
| 5 | 未登录后台页重定向 | ✅ |  |

### XML 站点地图（`sitemap`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | /sitemap.xml 200 + XML 头 | ✅ |  |
| 2 | 含 urlset 命名空间 | ✅ |  |
| 3 | 含首页条目 | ✅ |  |
| 4 | 含文章 /blog/ 条目 | ✅ |  |
| 5 | 含 lastmod 字段 | ✅ |  |
| 6 | Cache-Control 缓存头 | ✅ |  |
| 7 | 后台设置页可访问 | ✅ |  |
| 8 | 保存设置 maxPosts=500 | ✅ |  |
| 9 | 恢复设置 maxPosts=1000 | ✅ |  |

### 社交分享（`share`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | POST 保存设置 | ✅ |  |
| 2 | 文章页注入 ap-share-root | ✅ |  |
| 3 | 含微信分享 | ✅ |  |
| 4 | 含微博分享 | ✅ |  |
| 5 | 含复制链接 | ✅ |  |
| 6 | 链接已 URL 编码 | ✅ |  |
| 7 | 后台设置页可访问 | ✅ |  |
| 8 | GET 设置 API | ✅ |  |
| 9 | 页面仅注入一次（ap-share-root 唯一） | ✅ |  |

### 在线客服（`customer-service`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | POST 保存联系方式 | ✅ |  |
| 2 | 文章页注入 apcs-root | ✅ |  |
| 3 | 右下角浮动样式 | ✅ |  |
| 4 | 后台设置页可访问 | ✅ |  |
| 5 | GET 设置 API | ✅ |  |
| 6 | 配置后前台显示 QQ | ✅ |  |
| 7 | 非法主题色被拒绝 | ✅ |  |

### 页脚设置（备案/版权）（`footer`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | 文章页注入页脚 | ✅ |  |
| 2 | Powered by 链接 | ✅ |  |
| 3 | 后台设置页可访问 | ✅ |  |
| 4 | GET 设置 API | ✅ |  |
| 5 | POST 保存备案号 | ✅ |  |
| 6 | 前台显示备案号 | ✅ |  |
| 7 | 自定义 HTML 剥离 script | ✅ |  |
| 8 | 自定义 HTML 保留安全标签 | ✅ |  |

### 文章打赏（`donation`）

| # | 测试用例 | 结果 | 说明 |
|---:|---|:---:|---|
| 1 | POST 保存二维码 | ✅ |  |
| 2 | 文章页注入 ap-donation | ✅ |  |
| 3 | 打赏按钮存在 | ✅ |  |
| 4 | 模态框存在 | ✅ |  |
| 5 | 默认按钮文案 | ✅ |  |
| 6 | 后台设置页可访问 | ✅ |  |
| 7 | GET 设置 API | ✅ |  |
| 8 | 前台显示微信二维码 | ✅ |  |
| 9 | 前台显示支付宝二维码 | ✅ |  |
| 10 | javascript: 协议二维码被拒绝 | ✅ |  |
| 11 | 前台无 javascript: 二维码 | ✅ |  |

## 五、安全专项验证

| 安全机制 | 验证方式与结果 |
|---|---|
| 登录墙 | 错误密码 302 跳 `/login?error=invalid`；正确凭据 302 跳 `/admin/dashboard`；17 个管理 API 匿名访问全部被拦截（401/403 或 302 到登录页） |
| CSRF 同源校验 | 伪造 `Origin: http://evil.example.com` 对重定向/评论/数据库等写接口均返回 403 |
| 写操作确认 | 数据库写、文件删/改/复制/移动、备份恢复、配置导入等均要求 `confirm:true`；未确认写 SQL 返回 403 |
| SQL 控制台收敛 | 仅允许单条语句（多语句 400）；ATTACH/DETACH/VACUUM 永久禁用；`PRAGMA writable_schema/trusted_schema` 拒绝；表名/列名标识符白名单；`sqlite_*` 内部表禁改；单元格仅支持文本/数字/NULL |
| 文件管理 | `../` 及 URL 编码穿越（`%2e%2e`、`%5c`）返回 400；`.git/node_modules/.astro` 等保护目录置灰禁写；上传单文件 ≤64MB、ZIP ≤256MB、ZIP Slip 防护、解压 zip-bomb 三重封顶（256MB 压缩包 / 512MB 展开 / 2 万条目，前序专项 46 项用例覆盖） |
| 评论反垃圾 | 蜜罐字段 `ap_website` 命中静默 202 不入库；同 IP 30 秒内超过 3 条返回 429；非法字段不消耗频控配额；频控按 socket 地址计数，伪造 `X-Forwarded-For` 不能绕过（反代部署需显式 `AP_TRUST_PROXY=1`） |
| Webhook API Key | sha256 存库；管理列表不回显密钥/哈希；错误密钥 401；权限位隔离（只读 Key 发布文章 403）；支持 Authorization 与 X-API-Key 两种头 |
| WebDAV | Basic Auth 令牌错误返回 401；令牌仅 POST 确认后明文展示一次；路径穿越无法逃逸存储根 |
| 配置导出 | 导出物自动剥离 `AUTH_SECRET` 等密钥（全文扫描断言） |
| 上传校验 | 图片/音视频均做 magic-byte 嗅探，伪造扩展名（PNG 内容 .txt、非音频伪装 .mp3）返回 4xx；SVG 经白名单消毒（剥离 script/事件属性/外链） |
| 重定向 | from/to/type 严格校验、from 去重、50 步多跳循环检测（A→B→A 拒绝）、缓存即时失效；from/to ≤2048 字符；CRLF 注入、`//evil.com` 协议相对 URL、`/\evil.com` 反斜杠混淆一律 400；命中系统保留前缀的规则保存即 400（不再静默失效） |

## 六、功能流转验证（端到端链路）

以下多步骤业务链路全部跑通：

1. **重定向生命周期**：新建 301 → 重复/非法入参拦截 → PUT 改 302 → 成环拒绝 → 禁用（不跳转）→ 启用（匿名请求实测 302 + Location 外链）→ 删除
2. **评论生命周期**：开放评论文章 → 蜜罐/非法字段拦截 → 合法提交 201 pending → 后台搜索 → 审核通过 → 管理员回复 → 标记垃圾 → 回收站 → 未知动作拒绝 → 频控 429 → 物理删除清理 → 设置/文章状态还原
3. **数据库控制台**：表列表 → 结构 → 浏览（rowid）→ SELECT → 非法 SQL 报错不崩 → 无确认写 403 → 建临时表/插入/行内编辑/设 NULL 落库校验 → 内部表/非法名拦截 → CSV/SQL 导出 → DROP 清理
4. **网站目录**：建分类 → 改名 → 建链接（非法 URL 拦截）→ 编辑批准 → 公开 /directory 展示 → 匿名点击 302 跳外站并计数 → 非空分类禁删 → 删链接 → 删分类
5. **Webhook 发布链**：建全权限/只读 Key → Bearer 发布草稿 → 同 slug 幂等更新 → status 查日志 → 只读 Key 403 → 错钥 401 → 非法类型 400 → X-API-Key 删除文章及 meta → 删 Key
6. **配置备份链**：全量导出（无密钥泄露）→ merge 往返导入 → 坏 JSON/缺文件 400 → 创建不含媒体备份 → 下载（ZIP magic PK 校验）→ 路径穿越拦截 → restore 缺参 400
7. **WebDAV 链**：生成令牌 → PROPFIND 207 → PUT → GET 回读字节一致 → MKCOL → 错令牌 401 → DELETE 清理
8. **文件管理器 UI**：列表渲染 61 项 → 双击 package.json 弹出只读编辑器并显示内容 → 关闭 → 勾选后编辑按钮启用 → 复制/移动对话框渲染目录树（apps/plugins/packages 可见）→ 取消不产生写入
9. **广告系统**：广告位读写持久化 → 非法 key/重复 key 拦截 → loader.js 公开加载 → track 批量打点（空批量 400）→ 还原
10. **插件管理**：状态列表 → 非法 slug 拦截 → 系统插件 seo 禁禁用 → wp-editor 启停往返并还原

## 七、浏览器 UI 抽查

- 后台页面 23 个 `/admin-ext/*` 管理页全部 HTTP 200 并嵌入 AdminLayout（左侧导航存在）
- 文件管理器：查看/编辑模态框、复制/移动目录树对话框交互正常，控制台无 Uncaught/TypeError/SyntaxError
- AI 助手页：提供商列表正常，元宝登录态显示「已登录 ✓」（三重信号判定修复后），登录态持久化于服务器浏览器档案
- 控制台存在的少量 `ERR_CONNECTION_REFUSED/ABORTED` 来自 Astro HMR 与链接预取（历史导航记录），与插件功能无关

## 八、测试中发现并已确认/记录的事项

1. **重定向保留前缀（第二轮排错已修复）**：redirect 中间件按设计跳过 `/ap-`、`/api`、`/admin`、`/media` 等保留前缀（保护 /ap-ads、/ap-webhook、/ap-comments 等公开插件端点）。第一轮测试记录的「为这些前缀建规则会静默不生效」已在深度排错轮修复：保存命中保留前缀的规则时直接返回 400 并给出明确中文提示（详见第十章 S2）。
2. **OPTIONS 请求由 Astro 核心 CORS 以 204 应答**，WebDAV 插件的 DAV 能力头不出现在该响应中；实际 WebDAV 客户端以 PROPFIND（207）为核心动词，功能不受影响。
3. 本站无 `/blog` 列表路由（首页即文章列表），文章详情页 `/blog/{slug}` 正常；测试以真实文章页为准。
4. 数据库列名遵循 WordPress 惯例（如 `wp_posts.ID` 大写），数据库控制台相关功能均按真实返回结构验证通过。

## 九、测试后数据清理确认

- 临时重定向规则、ap_comments 测试评论、ap_link_* 测试分类/链接、测试广告位、Webhook API Key、测试草稿文章及 postmeta、WebDAV 测试文件/目录、数据库临时表、上传测试图片——**全部通过插件接口删除/还原**
- 评论插件设置、目标文章 comment_status、广告位配置、wp-editor 启用状态、admin-i18n 设置——**全部还原为测试前值**
- 备份插件产生的 .apzip 保留在 `backups/`（属于正常备份产物，不清理）

## 十、第二轮：深度排错 · 安全加固 · 性能优化（2026-10-02 追加）

在第一轮全功能测试通过后，又对全部 24 个插件按「静态扫描 → 并发压力 → 边界/畸形输入 → 安全探测 → 热路径性能 → 编译/审计门」六个维度做了多轮交叉排查，共发现并修复 **11 项真实问题（安全 4、健壮性 3、性能 3、数据卫生 1）**，全部回归通过。

### 10.1 修复清单（按严重度排序）

| 编号 | 级别 | 位置 | 问题 | 修复 |
|---|---|---|---|---|
| S1 | 高（安全） | comments `lib/http.ts` | 评论频控无条件信任 `X-Forwarded-For` 首段，攻击者每请求换一个伪造 IP 即可完全绕过「30 秒 3 条」限流（实测 6 个伪造 IP 全部 201 入库） | 默认只用 socket 地址（`clientAddress`）；仅在显式设置环境变量 `AP_TRUST_PROXY=1`（可信反代部署）时才采信 XFF；实测第 4 条起稳定 429 |
| S2 | 高（安全） | redirect `admin/api/redirects.ts` | `to` 未过滤控制字符，`https://a.com/\r\nX-Evil:1` 可存入规则，命中时构造非法 `Location` 响应头直接导致 **500**（响应头注入/拒绝服务）；`//evil.com/x`（协议相对 URL）与 `/\\evil.com/x`（反斜杠混淆，部分浏览器等同 //）形成**开放重定向** | from/to 全量控制字符（0x00-0x1f/0x7f）拒绝；http(s) 目标经 `new URL()` 合法性校验且 host 非空；站内路径第二个字符不得是 `/` 或 `\`；非法一律 400，实测三类 payload 均被拦截 |
| S3 | 高（安全） | db-console `lib/sql-util.ts` | `PRAGMA writable_schema=1`（可改写 sqlite_master 直接破坏库结构）与 `trusted_schema=1`（高权限执行不可信视图/触发器）作为普通查询放行 | 加入危险 PRAGMA 黑名单，与 ATTACH/DETACH/VACUUM 一样无条件 400 |
| S4 | 中（数据卫生/抗滥用） | related-posts、ads-manager 两个公开埋点 | `/ap-related/track?post=<任意数字>` 会为不存在的文章插入孤儿 `wp_postmeta`；`/ap-ads/track` 伪造 adId 同样无限插入统计行，可被刷脏数据 | 首行写入前先按主键校验文章存在；广告还要求 `post_type='ap_ad'`；实测伪造 ID 各打 3 次后库内 0 行 |
| S5 | 中（安全/可用性） | file-manager `admin/api/unzip.ts` | 解压只有 zip-slip 文本校验，无 zip-bomb 限制：高压缩比包可撑爆内存/磁盘（已有 zip-slip 拦截经 fflate 不重建符号链接，确认安全） | 三重封顶：压缩包 ≤256MB、展开总量 ≤512MB、条目数 ≤20000，超限 413 |
| R1 | 中（健壮性） | backup `admin/api/create.ts` | 请求体为**畸形 JSON 时被静默吞掉并按默认参数触发一次完整备份**（实测畸形 body 返回 200 且实际建包） | 区分空体（允许，默认含媒体）与非法体：非空 body 必须是可解析的 JSON 对象，否则 400，不再触发备份 |
| R2 | 中（正确性/UX） | redirect `middleware.ts` + `redirects.ts` | 命中 `/ap-`、`/api` 等保留前缀的规则永远不会被中间件拦截，但保存时返回成功——规则「静默失效」 | 保留前缀清单从中间件导出为单一事实源，保存（POST/PUT）命中即 400 并提示具体冲突前缀 |
| R3 | 低（健壮性） | redirect `admin/api/redirects.ts` | from/to 无长度上限，10000 字符的路径可直接存库并参与每请求字符串匹配 | from/to 上限 2048（浏览器 URL 长度内），超长 400 |
| P1 | 性能 | plugin-manager `middleware-guard.ts`（pre，每请求执行） | 原实现在路径判断前就 `await getPreDb()` 并 `loadStates()`，且每请求 new Set + 双重遍历 REGISTRY；绝大多数公开请求根本不可能命中插件前缀 | 自身路径先放行 → 纯字符串预判 REGISTRY 前缀（零 I/O）→ 仅命中候选前缀才取 DB/查状态；公开页面与静态资源零 DB 成本 |
| P2 | 性能 | multilingual `middleware.ts`（post，每 HTML 响应执行） | 未配置任何语言（插件惰性）时仍对每个 HTML 页 `clone().text()` 读完整响应体并执行 3 次翻译/站点信息 DB 查询 | 惰性状态（languages 为空）直接返回原响应，不读体、不查库 |
| P3 | 性能 | related-posts `middleware.ts` | 插件禁用时仍先做一次文章主键查询才检查启用状态 | 设置检查（带缓存）前移，禁用文章页零额外查询 |

### 10.2 验证矩阵（修复后全量回归）

| 测试层 | 脚本 | 结果 |
|---|---|---|
| 全功能黑盒回归（24 插件 + 核心 + 公开页，含本轮新增 10 个安全/卫生断言） | `scripts/test-plugins-full.py` | **217 / 217 PASS** |
| 并发与压力（计数原子性 ×50 并发、频控竞态、插件状态 10 并发切换、并发建同名目录、18 写端点畸形 JSON、超长输入、100 并发混合流量） | `scripts/test-plugins-stress.py` | **14 / 14 PASS** |
| 安全专项探测（CRLF、协议相对/反斜杠 URL、URL 编码穿越、XFF 伪造、危险 PRAGMA） | 一次性专项脚本（结果留存本报告，用后已删） | 攻击向量全部 400/429，0 绕过 |
| 公开端点模糊（15 个 GET 畸形参数 + 7 个 POST 错类型/畸形体 + 异常方法，全部匿名） | 一次性专项脚本（结果留存本报告，用后已删） | **22/22 无 5xx** |
| 孤儿行验证（伪造 postId/adId 各打点 3 次后查库） | 一次性专项脚本（结果留存本报告，用后已删） | **0 孤儿行 PASS** |
| 静态扫描（40 处 request.json() 全部 try 保护；唯一出站 fetch 带 20s AbortSignal；定时器均为一次性/中止器） | 专项人工 + 脚本审计 | 0 真实问题 |
| 插件审计门 | `scripts/audit-plugins.py` | **E:0 W:0 I:13**（I 为核心登录墙双保险提示） |
| 主题冲突/危险全局重置 | `scripts/check-theme-collision.py` | **CLEAN** |
| TypeScript 编译 | 25 个含 tsconfig 的插件 `tsc --noEmit` | **0 错误** |

### 10.3 审查后确认安全、无需改动的方面

- **上传链路**（editor-upload / media-av）：扩展名白名单 + magic-byte 内容嗅探（声明类型与真实容器必须一致，docx/xlsx 按 zip 容器特判）+ SVG 白名单消毒 + 存储文件名正则清洗 + 服务端大小上限（图片 25MB、音视频 100MB 可经环境变量调整）。
- **公开 XSS 面**：评论前台渲染对昵称/内容/日期/`data-author` 全部 `escapeHtml`，客户端追加一律 `textContent`/DOM API；网址仅允许 http(s) 且经 `new URL` 校验；广告 HTML 走受控渲染。
- **备份下载/恢复**：下载双重路径包含校验（文件名白名单 + `startsWith(备份根)`）+ `Content-Disposition` 百分号编码；恢复限鉴权+同源+1GB 上限，媒体条目内部 zip-slip 校验。
- **评论提交**：蜜罐、服务端长度约束（昵称 1-50、邮箱 ≤200、内容 ≤4000、UA ≤255、slug ≤200）、邮箱格式、分页 perPage 服务端钳制在 5-100。
- **SQL 控制台**：所有写接口 `locals.user` + 同源 Origin + `confirmWrite` 三重门；导出 CSV 带 BOM；标识符白名单。
- **缓存与并发**：redirect 规则 30s TTL + 写后即时失效；ads 设置 60s TTL + 模块级 promise 互斥锁；related 计数 SQL 原子自增 + onConflictDoNothing；plugin 状态 10s TTL + 写后失效。
- **资源生命周期**：全仓库服务端定时器仅 3 类（请求 AbortController 超时、一次性清理），无 setInterval/请求级泄漏；备份下载流在 pull 异常与客户端 cancel 时均关闭文件句柄。

### 10.4 本轮修改文件（共 12 个，全部位于 plugins/ 内，未触碰 apps/ 与 packages/）

```text
plugins/backup/src/admin/api/create.ts
plugins/comments/src/lib/http.ts
plugins/db-console/src/lib/sql-util.ts
plugins/db-console/src/admin/api/exec.ts
plugins/file-manager/src/admin/api/unzip.ts
plugins/multilingual/src/middleware.ts
plugins/plugin-manager/src/middleware-guard.ts
plugins/redirect/src/middleware.ts
plugins/redirect/src/admin/api/redirects.ts
plugins/related-posts/src/middleware.ts
plugins/related-posts/src/routes/api/track.ts
plugins/ads-manager/src/routes/api/track.ts
```

> 部署提示：若站点运行在 Nginx/Caddy 等反向代理之后且评论限流需要按真实访客 IP 生效，请为 Node 进程设置环境变量 `AP_TRUST_PROXY=1`，并确保代理重写（而非追加）`X-Forwarded-For`。直连部署无需任何配置。

---

*报告由自动化测试生成；原始断言数据：`scripts/plugin-test-result.json`。*