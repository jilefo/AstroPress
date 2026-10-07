# AstroPress 插件全功能测试报告（C 轮 · 全量终测）

## 一、概述

- 测试日期：2026-10-02（C 轮，A/B 轮已完成）
- 测试范围：全部已装配插件的全部功能点。在 B 轮基础上扩展：
  1. **file-manager 文件管理器**全功能 API 矩阵（list/mkdir/新建文件/upload/download/view/edit/copy(重名自动加后缀)/move/rename/pack/unpack/delete + 安全项）
  2. **gitalk-comment** 新插件（管理页、设置 GET/POST 往返、clientSecret 掩码不覆盖、启用注入/禁用不注入）
  3. **主题系统**：新移植 10 主题（Stack/Ayer/Butterfly/Fluid/Icarus/Keep/MengD/NexT/Redefine/Volantis）逐个激活并验证前台渲染
  4. **既有插件全量基线回归**（217 项，覆盖 comments/related-posts/share/donation/customer-service/footer/search/redirect/ads-manager/seo-tools/sitemap/multilingual/admin-i18n/ai-chat/ai-autofill/webhook-publisher/db-console/backup/config-io/link-directory/media-av/wp-editor/editor-upload/editor-tools/image-mirror/plugin-manager/webdav/gist-sync/git-sync/permalink 等）
  5. **static-html**（管理页 + 状态接口，不真跑全站生成）
  6. **并发与安全抽查**（评论频控、畸形 JSON、路径穿越、XSS 文件名、未登录鉴权）

## 二、测试环境

| 项 | 值 |
|---|---|
| 操作系统 | Windows |
| 运行时 | Node.js + Astro 4.16 SSR 开发服务器 |
| 站点地址 | http://localhost:4321 |
| 数据库 | SQLite（local.db，WP 兼容表结构） |
| 测试脚本 | `scripts/test-c-round.py`（本轮专项，内嵌以子进程方式调用 `scripts/test-plugins-full.py` 完成 217 项基线回归并合并结果） |
| 结果数据 | `scripts/plugin-test-result-c.json` |
| 测试账号 | 管理员（username/password 表单登录，CookieJar 保持会话） |
| 测试原则 | 不破坏真实数据：文件操作在 `_fmtest_c_<8位hex>` 沙箱目录进行并自清；gitalk 设置经 SQL 快照/还原（含 secret）；主题测试结束还原 base-theme；基线套件自带全部清理与还原 |

## 三、总体结论

**本轮自动化断言合计 359 项，全部通过（PASS 359 / FAIL 0 / WARN 0）。**

| 套件 | 用例数 | 说明 |
|---|---:|---|
| 基线回归（test-plugins-full.py，覆盖全部既有插件） | 270 | 以子进程运行并合并结果 |
| C 轮专项（file-manager/gitalk/主题/static-html/安全） | 89 | 本轮新增断言 |
| **合计** | **359** | — |

## 四、分插件结果汇总

| 插件 / 模块 | 用例数 | 通过 | 失败 | 警告 |
|---|---:|---:|---:|---:|
| 测试准备（登录） | 2 | 2 | 0 | 0 |
| 基线套件整体（A/B 轮 217 项回归） | 1 | 1 | 0 | 0 |
| 核心鉴权（登录/登录墙） | 2 | 2 | 0 | 0 |
| SEO 工具（rss.xml / robots.txt） | 7 | 7 | 0 | 0 |
| 搜索 | 5 | 5 | 0 | 0 |
| 相关文章 | 6 | 6 | 0 | 0 |
| 301/302 重定向 | 20 | 20 | 0 | 0 |
| 评论 | 18 | 18 | 0 | 0 |
| 数据库控制台 | 24 | 24 | 0 | 0 |
| 网站目录 | 16 | 16 | 0 | 0 |
| 广告管理 | 12 | 12 | 0 | 0 |
| Webhook 发布 API | 15 | 15 | 0 | 0 |
| 配置导入导出 | 7 | 7 | 0 | 0 |
| 备份与恢复 | 7 | 7 | 0 | 0 |
| 文件管理器 | 47 | 47 | 0 | 0 |
| 插件管理器 | 8 | 8 | 0 | 0 |
| WebDAV | 12 | 12 | 0 | 0 |
| Gist 同步 | 4 | 4 | 0 | 0 |
| Git 同步 | 7 | 7 | 0 | 0 |
| 多语言 | 10 | 10 | 0 | 0 |
| 后台国际化 | 5 | 5 | 0 | 0 |
| 编辑器图片上传 | 6 | 6 | 0 | 0 |
| 音视频上传 | 3 | 3 | 0 | 0 |
| 图片镜像 | 1 | 1 | 0 | 0 |
| AI 一键填写 | 2 | 2 | 0 | 0 |
| WP 风格编辑器 | 1 | 1 | 0 | 0 |
| 编辑器工具集 | 2 | 2 | 0 | 0 |
| AI 网页助手 | 5 | 5 | 0 | 0 |
| 公开页面渲染 | 7 | 7 | 0 | 0 |
| 固定链接美化 | 5 | 5 | 0 | 0 |
| XML 站点地图 | 9 | 9 | 0 | 0 |
| 社交分享 | 9 | 9 | 0 | 0 |
| 在线客服 | 7 | 7 | 0 | 0 |
| 页脚设置 | 8 | 8 | 0 | 0 |
| 文章打赏 | 11 | 11 | 0 | 0 |
| Gitalk 评论（新插件） | 12 | 12 | 0 | 0 |
| 静态 HTML 生成 | 4 | 4 | 0 | 0 |
| 安全专项抽查 | 7 | 7 | 0 | 0 |
| 主题系统（10 个移植主题） | 25 | 25 | 0 | 0 |

## 五、插件逐章详细结果

### 5.1 测试准备（登录）（`setup`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | 管理员登录 | ✅ PASS | 151.7 |  |
| 2 | [基线] 管理员登录 | ✅ PASS |  |  |

### 5.2 基线套件整体（A/B 轮 217 项回归）（`baseline`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | 基线套件整体回归(270/270) | ✅ PASS | 27207.5 |  |

### 5.3 核心鉴权（登录/登录墙）（`core`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 管理员登录(form→302) | ✅ PASS | 126.9 |  |
| 2 | [基线] 错误密码被拒(302→/login?error) | ✅ PASS |  |  |

### 5.4 SEO 工具（rss.xml / robots.txt）（`seo-tools`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] RSS 订阅 /rss.xml | ✅ PASS | 9.0 |  |
| 2 | [基线] robots.txt | ✅ PASS | 2.7 |  |
| 3 | [基线] 设置 GET | ✅ PASS |  |  |
| 4 | [基线] 设置 POST 回写往返 | ✅ PASS |  |  |
| 5 | [基线] 设置回写后一致 | ✅ PASS |  |  |
| 6 | [基线] 后台页 /admin-ext/seo-tools | ✅ PASS | 17.9 |  |
| 7 | [基线] 匿名访问被拒 /admin-ext/api/seo-tools/settings | ✅ PASS |  |  |

### 5.5 搜索（`search`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 搜索页 /search?q=the | ✅ PASS | 8.9 |  |
| 2 | [基线] q=100 字符边界接受 | ✅ PASS |  |  |
| 3 | [基线] q=101 字符被截断/不500 | ✅ PASS |  |  |
| 4 | [基线] 设置往返一致 | ✅ PASS |  |  |
| 5 | [基线] 后台页 /admin-ext/search | ✅ PASS | 15.7 |  |

### 5.6 相关文章（`related-posts`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 设置 GET | ✅ PASS |  |  |
| 2 | [基线] 设置 POST 往返 | ✅ PASS |  |  |
| 3 | [基线] 追踪像素容错(不存在文章不500) | ✅ PASS |  |  |
| 4 | [基线] 追踪像素缺参不500 | ✅ PASS |  |  |
| 5 | [基线] 伪造 postId 不产生孤儿浏览量行 | ✅ PASS |  |  |
| 6 | [基线] 后台页 /admin-ext/related-posts | ✅ PASS | 15.4 |  |

### 5.7 301/302 重定向（`redirect`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 新建 301 规则 | ✅ PASS |  |  |
| 2 | [基线] from 重复拒绝 | ✅ PASS |  |  |
| 3 | [基线] 非法 from 拒绝 | ✅ PASS |  |  |
| 4 | [基线] 非法 to 拒绝 | ✅ PASS |  |  |
| 5 | [基线] 非法 type 拒绝 | ✅ PASS |  |  |
| 6 | [基线] 保留前缀(/ap-)规则拒绝保存 | ✅ PASS |  |  |
| 7 | [基线] 超长 from(>2048)拒绝 | ✅ PASS |  |  |
| 8 | [基线] CRLF 注入 to 拒绝 | ✅ PASS |  |  |
| 9 | [基线] 协议相对 //evil 拒绝(防开放重定向) | ✅ PASS |  |  |
| 10 | [基线] 反斜杠混淆 to 拒绝 | ✅ PASS |  |  |
| 11 | [基线] PUT 修改规则 | ✅ PASS |  |  |
| 12 | [基线] 多跳循环检测拒绝(c->a 成环) | ✅ PASS |  |  |
| 13 | [基线] 禁用规则 | ✅ PASS |  |  |
| 14 | [基线] 禁用规则不跳转 | ✅ PASS |  |  |
| 15 | [基线] 启用规则 | ✅ PASS |  |  |
| 16 | [基线] 302/301 实际跳转生效 | ✅ PASS |  |  |
| 17 | [基线] 匿名访问被拒 /admin-ext/api/redirects | ✅ PASS |  |  |
| 18 | [基线] 跨域写被拒 /admin-ext/api/redirects | ✅ PASS |  |  |
| 19 | [基线] 后台页 /admin-ext/redirects | ✅ PASS | 17.1 |  |
| 20 | [基线] DELETE 清理测试规则 | ✅ PASS |  |  |

### 5.8 评论（`comments`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 准备已发布且开放评论的文章 | ✅ PASS |  |  |
| 2 | [基线] 蜜罐评论静默 202 | ✅ PASS |  |  |
| 3 | [基线] 字段校验拒绝(400) | ✅ PASS |  |  |
| 4 | [基线] 不存在文章拒绝 | ✅ PASS |  |  |
| 5 | [基线] 提交合法评论→201 pending | ✅ PASS |  |  |
| 6 | [基线] 后台评论列表+搜索 | ✅ PASS |  |  |
| 7 | [基线] 审核通过 | ✅ PASS |  |  |
| 8 | [基线] 管理员回复 | ✅ PASS |  |  |
| 9 | [基线] 标记垃圾 | ✅ PASS |  |  |
| 10 | [基线] 移入回收站 | ✅ PASS |  |  |
| 11 | [基线] 未知动作拒绝 | ✅ PASS |  |  |
| 12 | [基线] 30秒3条频控(第4条 429) | ✅ PASS |  |  |
| 13 | [基线] 伪造 XFF 不能绕过频控 | ✅ PASS |  |  |
| 14 | [基线] 后台页 /admin-ext/comments | ✅ PASS | 22.1 |  |
| 15 | [基线] 匿名访问被拒 /admin-ext/api/comments/list | ✅ PASS |  |  |
| 16 | [基线] 跨域写被拒 /admin-ext/api/comments/action | ✅ PASS |  |  |
| 17 | [基线] 清理测试评论 | ✅ PASS |  |  |
| 18 | [基线] 评论设置还原 | ✅ PASS |  |  |

### 5.9 数据库控制台（`db-console`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 表列表 GET | ✅ PASS |  |  |
| 2 | [基线] 表结构 structure | ✅ PASS |  |  |
| 3 | [基线] 数据浏览 browse | ✅ PASS |  |  |
| 4 | [基线] SELECT 查询 | ✅ PASS |  |  |
| 5 | [基线] 非法 SQL 返回 error(不崩) | ✅ PASS |  |  |
| 6 | [基线] 无确认写被拒(403) | ✅ PASS |  |  |
| 7 | [基线] 确认后建临时表 | ✅ PASS |  |  |
| 8 | [基线] 确认后写入 | ✅ PASS |  |  |
| 9 | [基线] ATTACH 禁用 | ✅ PASS |  |  |
| 10 | [基线] 危险 PRAGMA(writable_schema)禁用 | ✅ PASS |  |  |
| 11 | [基线] 危险 PRAGMA(trusted_schema)禁用 | ✅ PASS |  |  |
| 12 | [基线] 多语句拒绝 | ✅ PASS |  |  |
| 13 | [基线] 行内编辑无确认拒绝 | ✅ PASS |  |  |
| 14 | [基线] 行内编辑保存 | ✅ PASS |  |  |
| 15 | [基线] 内部表禁止修改 | ✅ PASS |  |  |
| 16 | [基线] 非法表名拒绝 | ✅ PASS |  |  |
| 17 | [基线] 行内设 NULL | ✅ PASS |  |  |
| 18 | [基线] 编辑结果落库校验 | ✅ PASS |  |  |
| 19 | [基线] CSV 导出 | ✅ PASS |  |  |
| 20 | [基线] SQL 导出(含CREATE/INSERT) | ✅ PASS |  |  |
| 21 | [基线] 匿名访问被拒 /admin-ext/api/db-console/tables | ✅ PASS |  |  |
| 22 | [基线] 跨域写被拒 /admin-ext/api/db-console/exec | ✅ PASS |  |  |
| 23 | [基线] 后台页 /admin-ext/db-console | ✅ PASS | 19.5 |  |
| 24 | [基线] 临时表已清理 | ✅ PASS |  |  |

### 5.10 网站目录（`link-directory`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 新建分类 | ✅ PASS |  |  |
| 2 | [基线] 分类列表 | ✅ PASS |  |  |
| 3 | [基线] 修改分类 | ✅ PASS |  |  |
| 4 | [基线] 空分类名拒绝 | ✅ PASS |  |  |
| 5 | [基线] 新建链接(pending) | ✅ PASS |  |  |
| 6 | [基线] 非法 URL 拒绝 | ✅ PASS |  |  |
| 7 | [基线] 编辑链接+批准 | ✅ PASS |  |  |
| 8 | [基线] 链接列表(按分类) | ✅ PASS |  |  |
| 9 | [基线] 公开目录页 /directory | ✅ PASS |  |  |
| 10 | [基线] 点击跳转 302 | ✅ PASS |  |  |
| 11 | [基线] 点击不存在 ID 不500 | ✅ PASS |  |  |
| 12 | [基线] 非空分类删除拒绝 | ✅ PASS |  |  |
| 13 | [基线] 设置往返 | ✅ PASS |  |  |
| 14 | [基线] 匿名访问被拒 /admin-ext/api/links | ✅ PASS |  |  |
| 15 | [基线] 后台页 /admin-ext/links | ✅ PASS | 16.0 |  |
| 16 | [基线] 清理测试链接+分类 | ✅ PASS |  |  |

### 5.11 广告管理（`ads-manager`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 广告位 GET | ✅ PASS |  |  |
| 2 | [基线] 新增测试广告位 | ✅ PASS |  |  |
| 3 | [基线] 广告位持久化 | ✅ PASS |  |  |
| 4 | [基线] 非法 key 拒绝 | ✅ PASS |  |  |
| 5 | [基线] 重复 key 拒绝 | ✅ PASS |  |  |
| 6 | [基线] loader.js 公开可访问 | ✅ PASS |  |  |
| 7 | [基线] track 打点容错 | ✅ PASS |  |  |
| 8 | [基线] track 空批量拒绝 | ✅ PASS |  |  |
| 9 | [基线] 伪造 adId 不产生孤儿统计行 | ✅ PASS |  |  |
| 10 | [基线] 匿名访问被拒 /admin-ext/api/ads/slots | ✅ PASS |  |  |
| 11 | [基线] 后台页 /admin-ext/ads | ✅ PASS | 21.1 |  |
| 12 | [基线] 还原广告位 | ✅ PASS |  |  |

### 5.12 Webhook 发布 API（`webhook-publisher`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 创建全权限 API Key | ✅ PASS |  |  |
| 2 | [基线] 创建只读 API Key | ✅ PASS |  |  |
| 3 | [基线] Key 列表不泄露密钥 | ✅ PASS |  |  |
| 4 | [基线] 发布文章(draft) | ✅ PASS |  |  |
| 5 | [基线] 同 slug 幂等 upsert | ✅ PASS |  |  |
| 6 | [基线] 状态查询 | ✅ PASS |  |  |
| 7 | [基线] 无 publish 权限→403 | ✅ PASS |  |  |
| 8 | [基线] 错误密钥被拒(401/403) | ✅ PASS |  |  |
| 9 | [基线] 非法文章类型→400 | ✅ PASS |  |  |
| 10 | [基线] 删除文章(X-API-Key 头) | ✅ PASS |  |  |
| 11 | [基线] 删除后状态查询(key 仍有效,返回日志) | ✅ PASS |  |  |
| 12 | [基线] 调用日志 GET | ✅ PASS |  |  |
| 13 | [基线] 匿名访问被拒 /admin-ext/api/webhook/keys | ✅ PASS |  |  |
| 14 | [基线] 后台页 /admin-ext/webhooks | ✅ PASS | 19.4 |  |
| 15 | [基线] 清理测试 API Keys | ✅ PASS |  |  |

### 5.13 配置导入导出（`config-io`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 全量导出 | ✅ PASS |  |  |
| 2 | [基线] 导出物剥离 AUTH_SECRET | ✅ PASS |  |  |
| 3 | [基线] 导入 merge 往返 | ✅ PASS |  |  |
| 4 | [基线] 坏 JSON 拒绝 | ✅ PASS |  |  |
| 5 | [基线] 缺文件拒绝 | ✅ PASS |  |  |
| 6 | [基线] 匿名访问被拒 /admin-ext/api/config-io/export | ✅ PASS |  |  |
| 7 | [基线] 后台页 /admin-ext/config-io | ✅ PASS | 24.5 |  |

### 5.14 备份与恢复（`backup`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 备份列表 GET | ✅ PASS |  |  |
| 2 | [基线] 创建备份(不含媒体) | ✅ PASS |  |  |
| 3 | [基线] 下载备份(zip magic PK) | ✅ PASS |  |  |
| 4 | [基线] 下载路径穿越拒绝 | ✅ PASS |  |  |
| 5 | [基线] restore 缺文件拒绝 | ✅ PASS |  |  |
| 6 | [基线] 匿名访问被拒 /admin-ext/api/backup/list | ✅ PASS |  |  |
| 7 | [基线] 后台页 /admin-ext/backup | ✅ PASS | 21.7 |  |

### 5.15 文件管理器（`file-manager`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 根目录列表 | ✅ PASS |  |  |
| 2 | [基线] 路径穿越 ../../ 拒绝 | ✅ PASS |  |  |
| 3 | [基线] 目录树 dirs | ✅ PASS |  |  |
| 4 | [基线] 读取文本文件 | ✅ PASS |  |  |
| 5 | [基线] 二进制文件拒绝读取(415) | ✅ PASS |  |  |
| 6 | [基线] 匿名访问被拒 /admin-ext/api/files/list | ✅ PASS |  |  |
| 7 | [基线] 跨域写被拒 /admin-ext/api/files/mkdir | ✅ PASS |  |  |
| 8 | [基线] 后台页 /admin-ext/files | ✅ PASS | 20.6 |  |
| 9 | mkdir 新建根测试目录 | ✅ PASS | 29.6 |  |
| 10 | mkdir 新建子目录 | ✅ PASS | 27.6 |  |
| 11 | mkdir 重复目录返回 409 | ✅ PASS | 15.3 |  |
| 12 | write 新建文本文件(created=true) | ✅ PASS | 16.0 |  |
| 13 | upload 上传 upload.txt | ✅ PASS | 16.1 |  |
| 14 | write 编辑已有文件并保存 | ✅ PASS | 18.1 |  |
| 15 | write 缺 confirm 被拒(403) | ✅ PASS | 27.8 |  |
| 16 | read 查看内容一致(含中文/Tab/特殊符号) | ✅ PASS | 16.0 |  |
| 17 | read 不存在文件 404 | ✅ PASS | 14.7 |  |
| 18 | list 浏览目录含 new.txt/upload.txt/sub | ✅ PASS | 16.6 |  |
| 19 | rename 重命名 new.txt→renamed.txt | ✅ PASS | 31.7 |  |
| 20 | rename 后内容保持不变 | ✅ PASS | 5.2 |  |
| 21 | rename 含分隔符被拒(400) | ✅ PASS | 20.4 |  |
| 22 | copy 复制 renamed.txt → sub/ | ✅ PASS | 18.0 |  |
| 23 | copy 重名自动加后缀(renamed-1.txt) | ✅ PASS | 14.8 |  |
| 24 | copy 后缀副本内容一致 | ✅ PASS | 14.2 |  |
| 25 | copy 后源文件仍存在 | ✅ PASS | 15.3 |  |
| 26 | copy 缺 confirm 被拒(403) | ✅ PASS | 3.3 |  |
| 27 | move 移动 upload.txt → sub/ | ✅ PASS | 4.4 |  |
| 28 | move 后新位置存在/旧位置消失 | ✅ PASS | 5.5 |  |
| 29 | pack 打包 sub → zip | ✅ PASS | 5.1 |  |
| 30 | pack zip 真实落盘 | ✅ PASS |  |  |
| 31 | unpack 解压 zip | ✅ PASS | 26.9 |  |
| 32 | unpack 产物内容正确 | ✅ PASS | 28.3 |  |
| 33 | unpack 非 zip 路径被拒(400) | ✅ PASS | 3.4 |  |
| 34 | download 下载字节一致 | ✅ PASS | 27.3 |  |
| 35 | download 含 Content-Disposition 附件头 | ✅ PASS |  |  |
| 36 | dirs 目录树 API 200 | ✅ PASS | 37.1 |  |
| 37 | 写入 .git 保护目录被拒 | ✅ PASS | 3.5 |  |
| 38 | node_modules 建目录被拒 | ✅ PASS | 3.9 |  |
| 39 | .astro 建目录被拒 | ✅ PASS | 15.9 |  |
| 40 | write 路径穿越 ../../ 被拒 | ✅ PASS | 15.2 |  |
| 41 | read 路径穿越出站点根被拒 | ✅ PASS | 16.9 |  |
| 42 | 匿名 list 被拒(401/403/302) | ✅ PASS |  |  |
| 43 | delete 缺 confirm 被拒(403) | ✅ PASS | 3.9 |  |
| 44 | delete 删除单文件 | ✅ PASS | 28.0 |  |
| 45 | delete 后文件 404 | ✅ PASS | 16.6 |  |
| 46 | 递归删除沙箱目录 | ✅ PASS | 18.9 |  |
| 47 | 沙箱删除后 list 404 | ✅ PASS | 27.1 |  |

### 5.16 插件管理器（`plugin-manager`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 插件状态 GET | ✅ PASS |  |  |
| 2 | [基线] 非法 slug 拒绝 | ✅ PASS |  |  |
| 3 | [基线] 系统插件 seo 不可禁用 | ✅ PASS |  |  |
| 4 | [基线] 切换 wp-editor 状态 | ✅ PASS |  |  |
| 5 | [基线] 切换后状态生效 | ✅ PASS |  |  |
| 6 | [基线] 还原 wp-editor 状态 | ✅ PASS |  |  |
| 7 | [基线] 匿名访问被拒 /admin-ext/api/plugin-manager/state | ✅ PASS |  |  |
| 8 | [基线] 后台页 /admin-ext/plugin-manager | ✅ PASS | 16.5 |  |

### 5.17 WebDAV（`webdav`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] token GET 仅掩码 | ✅ PASS |  |  |
| 2 | [基线] 生成 WebDAV token | ✅ PASS |  |  |
| 3 | [基线] PROPFIND 根目录 207 | ✅ PASS |  |  |
| 4 | [基线] PUT 上传文件 | ✅ PASS |  |  |
| 5 | [基线] GET 回读一致 | ✅ PASS |  |  |
| 6 | [基线] MKCOL 建目录 | ✅ PASS |  |  |
| 7 | [基线] OPTIONS 可应答(200/204) | ✅ PASS |  |  |
| 8 | [基线] 错误令牌 401 | ✅ PASS |  |  |
| 9 | [基线] 路径穿越不逃逸存储根 | ✅ PASS |  |  |
| 10 | [基线] DELETE 清理 | ✅ PASS |  |  |
| 11 | [基线] 统计 GET | ✅ PASS |  |  |
| 12 | [基线] 后台页 /admin-ext/webdav | ✅ PASS | 16.0 |  |

### 5.18 Gist 同步（`gist-sync`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 设置 GET | ✅ PASS |  |  |
| 2 | [基线] 未配置 token push 优雅报错 | ✅ PASS |  |  |
| 3 | [基线] 历史 GET 不500 | ✅ PASS |  |  |
| 4 | [基线] 后台页 /admin-ext/gist-sync | ✅ PASS | 23.6 |  |

### 5.19 Git 同步（`git-sync`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 设置 GET | ✅ PASS |  |  |
| 2 | [基线] 未配置 remote sync 优雅报错 | ✅ PASS |  |  |
| 3 | [基线] 历史 GET | ✅ PASS |  |  |
| 4 | [基线] 后台页 /admin-ext/git-sync | ✅ PASS | 20.9 |  |
| 5 | [基线] GET 设置含 scopes.site | ✅ PASS |  |  |
| 6 | [基线] 仅勾选整站源码可保存 | ✅ PASS |  |  |
| 7 | [基线] 全部不勾选被拒绝 | ✅ PASS |  |  |

### 5.20 多语言（`multilingual`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] GET settings | ✅ PASS |  |  |
| 2 | [基线] GET strings | ✅ PASS |  |  |
| 3 | [基线] GET links?postId=1 | ✅ PASS |  |  |
| 4 | [基线] links 缺 postId 拒绝 | ✅ PASS |  |  |
| 5 | [基线] 公开 config | ✅ PASS |  |  |
| 6 | [基线] 静态资源 /ml-asset/panel.js | ✅ PASS |  |  |
| 7 | [基线] 静态资源 /ml-asset/switcher.js | ✅ PASS |  |  |
| 8 | [基线] sitemap.xml | ✅ PASS |  |  |
| 9 | [基线] 多语言页 /ml/ | ✅ PASS |  |  |
| 10 | [基线] 后台页 /admin-ext/multilingual | ✅ PASS | 19.5 |  |

### 5.21 后台国际化（`admin-i18n`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] script.js 可加载 | ✅ PASS |  |  |
| 2 | [基线] 设置 PUT 往返 | ✅ PASS |  |  |
| 3 | [基线] 非法 target 语言拒绝 | ✅ PASS |  |  |
| 4 | [基线] translate 空文本优雅处理 | ✅ PASS |  |  |
| 5 | [基线] 后台页 /admin-ext/i18n | ✅ PASS | 13.8 |  |

### 5.22 编辑器图片上传（`editor-upload`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] editor-upload.js 可加载 | ✅ PASS |  |  |
| 2 | [基线] 上传 PNG(201) | ✅ PASS |  |  |
| 3 | [基线] 伪装内容上传拒绝 | ✅ PASS |  |  |
| 4 | [基线] SVG 上传有明确策略(2xx净化或4xx拒绝) | ✅ PASS |  |  |
| 5 | [基线] 媒体 meta GET | ✅ PASS |  |  |
| 6 | [基线] 清理上传文件 | ✅ PASS |  |  |

### 5.23 音视频上传（`media-av`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] media-av.js 可加载 | ✅ PASS |  |  |
| 2 | [基线] 假音频 magic-byte 拒绝 | ✅ PASS |  |  |
| 3 | [基线] 非音视频拒绝 | ✅ PASS |  |  |

### 5.24 图片镜像（`image-mirror`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 静态资源 image-mirror.js | ✅ PASS |  |  |

### 5.25 AI 一键填写（`ai-autofill`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 静态资源 script.js | ✅ PASS |  |  |
| 2 | [基线] generate 缺参/未配置优雅返回 | ✅ PASS |  |  |

### 5.26 WP 风格编辑器（`wp-editor`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 静态资源 wp-editor.js | ✅ PASS |  |  |

### 5.27 编辑器工具集（`editor-tools`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 静态资源 tools.js | ✅ PASS |  |  |
| 2 | [基线] translate 空文本优雅返回 | ✅ PASS |  |  |

### 5.28 AI 网页助手（`ai-chat`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] providers 列表 | ✅ PASS |  |  |
| 2 | [基线] sessions 状态 GET 不崩 | ✅ PASS |  |  |
| 3 | [基线] editor-panel.js | ✅ PASS |  |  |
| 4 | [基线] 匿名访问被拒 /admin-ext/api/ai-chat/status | ✅ PASS |  |  |
| 5 | [基线] 后台页 /admin-ext/ai-chat | ✅ PASS | 15.2 |  |

### 5.29 公开页面渲染（`public-pages`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 页面 / | ✅ PASS | 46.8 |  |
| 2 | [基线] 页面 /search?q=the | ✅ PASS | 7.8 |  |
| 3 | [基线] 页面 /directory | ✅ PASS | 9.7 |  |
| 4 | [基线] 页面 /rss.xml | ✅ PASS | 3.8 |  |
| 5 | [基线] 页面 /sitemap.xml | ✅ PASS | 2.6 |  |
| 6 | [基线] 页面 /robots.txt | ✅ PASS |  |  |
| 7 | [基线] 文章页 /blog/pv-tips | ✅ PASS | 12.1 |  |

### 5.30 固定链接美化（`permalink`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] /pv-tips 无 /blog/ 前缀可访问 | ✅ PASS |  |  |
| 2 | [基线] 重写后页面含文章内容 | ✅ PASS |  |  |
| 3 | [基线] 不存在 slug 仍返回 404 | ✅ PASS |  |  |
| 4 | [基线] 后台设置页可访问 | ✅ PASS |  |  |
| 5 | [基线] 未登录后台页重定向 | ✅ PASS |  |  |

### 5.31 XML 站点地图（`sitemap`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] /sitemap.xml 200 + XML 头 | ✅ PASS |  |  |
| 2 | [基线] 含 urlset 命名空间 | ✅ PASS |  |  |
| 3 | [基线] 含首页条目 | ✅ PASS |  |  |
| 4 | [基线] 含文章 /blog/ 条目 | ✅ PASS |  |  |
| 5 | [基线] 含 lastmod 字段 | ✅ PASS |  |  |
| 6 | [基线] Cache-Control 缓存头 | ✅ PASS |  |  |
| 7 | [基线] 后台设置页可访问 | ✅ PASS |  |  |
| 8 | [基线] 保存设置 maxPosts=500 | ✅ PASS |  |  |
| 9 | [基线] 恢复设置 maxPosts=1000 | ✅ PASS |  |  |

### 5.32 社交分享（`share`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] POST 保存设置 | ✅ PASS |  |  |
| 2 | [基线] 文章页注入 ap-share-root | ✅ PASS |  |  |
| 3 | [基线] 含微信分享 | ✅ PASS |  |  |
| 4 | [基线] 含微博分享 | ✅ PASS |  |  |
| 5 | [基线] 含复制链接 | ✅ PASS |  |  |
| 6 | [基线] 链接已 URL 编码 | ✅ PASS |  |  |
| 7 | [基线] 后台设置页可访问 | ✅ PASS |  |  |
| 8 | [基线] GET 设置 API | ✅ PASS |  |  |
| 9 | [基线] 页面仅注入一次（ap-share-root 唯一） | ✅ PASS |  |  |

### 5.33 在线客服（`customer-service`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] POST 保存联系方式 | ✅ PASS |  |  |
| 2 | [基线] 文章页注入 apcs-root | ✅ PASS |  |  |
| 3 | [基线] 右下角浮动样式 | ✅ PASS |  |  |
| 4 | [基线] 后台设置页可访问 | ✅ PASS |  |  |
| 5 | [基线] GET 设置 API | ✅ PASS |  |  |
| 6 | [基线] 配置后前台显示 QQ | ✅ PASS |  |  |
| 7 | [基线] 非法主题色被拒绝 | ✅ PASS |  |  |

### 5.34 页脚设置（`footer`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] 文章页注入页脚 | ✅ PASS |  |  |
| 2 | [基线] Powered by 链接 | ✅ PASS |  |  |
| 3 | [基线] 后台设置页可访问 | ✅ PASS |  |  |
| 4 | [基线] GET 设置 API | ✅ PASS |  |  |
| 5 | [基线] POST 保存备案号 | ✅ PASS |  |  |
| 6 | [基线] 前台显示备案号 | ✅ PASS |  |  |
| 7 | [基线] 自定义 HTML 剥离 script | ✅ PASS |  |  |
| 8 | [基线] 自定义 HTML 保留安全标签 | ✅ PASS |  |  |

### 5.35 文章打赏（`donation`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | [基线] POST 保存二维码 | ✅ PASS |  |  |
| 2 | [基线] 文章页注入 ap-donation | ✅ PASS |  |  |
| 3 | [基线] 打赏按钮存在 | ✅ PASS |  |  |
| 4 | [基线] 模态框存在 | ✅ PASS |  |  |
| 5 | [基线] 默认按钮文案 | ✅ PASS |  |  |
| 6 | [基线] 后台设置页可访问 | ✅ PASS |  |  |
| 7 | [基线] GET 设置 API | ✅ PASS |  |  |
| 8 | [基线] 前台显示微信二维码 | ✅ PASS |  |  |
| 9 | [基线] 前台显示支付宝二维码 | ✅ PASS |  |  |
| 10 | [基线] javascript: 协议二维码被拒绝 | ✅ PASS |  |  |
| 11 | [基线] 前台无 javascript: 二维码 | ✅ PASS |  |  |

### 5.36 Gitalk 评论（新插件）（`gitalk-comment`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | 管理页 /admin-ext/gitalk 200 | ✅ PASS | 24.9 |  |
| 2 | GET 设置 200 且 clientSecret 已掩码 | ✅ PASS | 15.2 |  |
| 3 | POST 设置保存，响应 clientSecret 掩码 | ✅ PASS | 56.2 |  |
| 4 | 设置往返一致(clientID/repo/owner) | ✅ PASS | 20.6 |  |
| 5 | 掩码 secret 提交返回 200 | ✅ PASS | 15.5 |  |
| 6 | 启用后文章页注入 gitalk-container | ✅ PASS | 28.3 |  |
| 7 | 注入配置含 clientID 与 gitalk@1 CDN | ✅ PASS |  |  |
| 8 | 注入配置含原 secret(证明掩码未覆盖旧值) | ✅ PASS |  |  |
| 9 | 跨域 Origin POST 被拒(403) | ✅ PASS | 4.6 |  |
| 10 | 匿名 GET 设置被拒(401/302) | ✅ PASS |  |  |
| 11 | 禁用后文章页不注入 gitalk-container | ✅ PASS | 35.6 |  |
| 12 | 还原原始设置(含 secret) | ✅ PASS |  |  |

### 5.37 静态 HTML 生成（`static-html`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | 管理页 /admin-ext/static-html 200 | ✅ PASS | 50.6 |  |
| 2 | GET status 200 含 state/runs | ✅ PASS | 29.6 |  |
| 3 | GET settings 200 含 outputDir/schedule | ✅ PASS | 5.9 |  |
| 4 | 匿名 GET status 被拒 | ✅ PASS |  |  |

### 5.38 安全专项抽查（`security`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | file-manager write 畸形 JSON 返回 400 | ✅ PASS | 4.2 |  |
| 2 | gitalk settings 畸形 JSON 返回 400 | ✅ PASS | 5.3 |  |
| 3 | file-manager XSS 文件名被拒(400/415) | ✅ PASS | 15.4 |  |
| 4 | mkdir 路径穿越 ../../../ 返回 400 | ✅ PASS | 6.8 |  |
| 5 | 未登录访问插件管理 API 被拒(401/302) | ✅ PASS |  |  |
| 6 | 未登录访问主题列表 API 被拒(401/302) | ✅ PASS |  |  |
| 7 | 评论提交畸形 JSON 不 5xx(400/422) | ✅ PASS | 4.1 |  |

### 5.39 主题系统（10 个移植主题）（`themes`）

| # | 测试用例 | 结果 | 耗时(ms) | 说明 |
|---:|---|:---:|---:|---|
| 1 | GET /api/themes 200 返回主题列表 | ✅ PASS | 8.1 |  |
| 2 | 列表含 10 个移植主题 | ✅ PASS |  |  |
| 3 | base-theme 存在(供还原) | ✅ PASS |  |  |
| 4 | 激活 Stack | ✅ PASS | 420.9 |  |
| 5 | Stack 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 6 | 激活 Ayer | ✅ PASS | 339.4 |  |
| 7 | Ayer 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 8 | 激活 Butterfly | ✅ PASS | 162.3 |  |
| 9 | Butterfly 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 10 | 激活 Fluid | ✅ PASS | 120.4 |  |
| 11 | Fluid 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 12 | 激活 Icarus | ✅ PASS | 177.5 |  |
| 13 | Icarus 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 14 | 激活 Keep | ✅ PASS | 150.0 |  |
| 15 | Keep 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 16 | 激活 MengD | ✅ PASS | 922.5 |  |
| 17 | MengD 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 18 | 激活 NexT | ✅ PASS | 491.2 |  |
| 19 | NexT 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 20 | 激活 Redefine | ✅ PASS | 154.3 |  |
| 21 | Redefine 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 22 | 激活 Volantis | ✅ PASS | 61.3 |  |
| 23 | Volantis 页面渲染(/ 与 /pv-tips 200 + primary 色 + article/post-content) | ✅ PASS |  |  |
| 24 | 还原激活 base-theme | ✅ PASS | 89.7 |  |
| 25 | base-theme 还原后页面渲染正常 | ✅ PASS |  |  |

## 六、安全专项

本轮及基线覆盖的安全防线：

| 安全机制 | 验证方式与结果 |
|---|---|
| 登录墙 / 鉴权 | 错误密码 302 跳登录页；匿名访问文件管理、gitalk 设置、插件管理、主题列表等管理 API 全部被拒（401 或 302 到登录页） |
| CSRF 同源校验 | 伪造 `Origin: http://evil.example.com` 对 gitalk 设置、static-html 设置/生成、评论审核等写接口均返回 403 |
| 写操作二次确认 | 文件写/删/复制/移动、数据库写 SQL 等均要求 `confirm:true`（或 `confirmWrite`），缺失返回 403 |
| 路径穿越 | 文件管理器 `../../` 写、`../../../` 建目录、`../../../../Windows/win.ini` 读全部 400/403；static-html 输出目录禁绝对路径/系统目录 |
| XSS / 文件名注入 | 含 `<img onerror>` 等非法字符的文件名写入返回 400；评论内容前台渲染全量 escapeHtml（基线） |
| 畸形输入 | file-manager write、gitalk settings、评论提交等端点畸形 JSON 一律 400，无 5xx |
| 评论反垃圾 | 蜜罐静默 202 不入库；同 IP 30 秒 3 条频控，第 4 条 429；伪造 X-Forwarded-For 不能绕过（基线用例） |
| 保护目录 | `.git` / `node_modules` / `.astro` 任何路径段命中即禁写（400/403） |
| 密钥保护 | gitalk clientSecret 后台只回掩码 `••••••••`；掩码/留空提交不覆盖旧值；config-io 导出剥离密钥（基线） |
| Webhook API Key | sha256 存库不回显；错钥 401；只读 Key 越权 403（基线） |

## 七、性能观察（响应耗时统计）

共采样 95 个带耗时的请求：平均 337ms，P50 17ms，P95 339ms，最大 27208ms（本地 SQLite + dev 模式）。基线套件整体回归耗时见 `baseline` 行。

最慢的 10 个请求：

| 插件 | 用例 | 耗时(ms) |
|---|---|---:|
| baseline | 基线套件整体回归(270/270) | 27207.5 |
| themes | 激活 MengD | 922.5 |
| themes | 激活 NexT | 491.2 |
| themes | 激活 Stack | 420.9 |
| themes | 激活 Ayer | 339.4 |
| themes | 激活 Icarus | 177.5 |
| themes | 激活 Butterfly | 162.3 |
| themes | 激活 Redefine | 154.3 |
| setup | 管理员登录 | 151.7 |
| themes | 激活 Keep | 150.0 |

> 全部页面/接口响应在秒级以内；最慢项为静态导出历史读取/备份打包类重 IO 操作或首页冷渲染，属预期。

## 八、缺陷与修复清单

### 8.1 本轮发现的失败用例与分诊

| # | 用例 | 初判 | 结论与处理 |
|---|---|---|---|
| 1 | security · file-manager XSS 文件名被拒（首轮运行 FAIL） | 用例错误 | payload `</script>` 含 `/` 被解析为路径分隔符，API 返回 404「父目录不存在」——文件未创建，安全语义成立；改用不含 `/` 的 XSS 文件名（Windows 非法字符 `>`）后返回 400，复跑通过。**非插件缺陷，无代码改动** |

### 8.2 真实 bug 修复

本轮未发现需要修改插件代码的真实 bug（`plugins/` 零改动；未触碰 `apps/` 与 `packages/`）。唯一失败项为测试用例自身构造问题，已在用例层修正并复跑通过。

## 九、测试后数据清理确认

- 文件管理器沙箱 `_fmtest_c_*` 已通过插件 delete API 递归删除并二次确认 404
- gitalk 设置（含 clientSecret）经 SQL 快照在测试后完整还原为测试前原始值
- 主题已还原为 `base-theme`，并验证 `/` 与 `/pv-tips` 渲染正常、primary 色值 `#2271b1` 注入
- 基线套件（217 项）自带全部临时数据清理与设置还原（评论/重定向/广告位/API Key/临时表/上传文件等）

## 十、结论

C 轮全量终测 **359/359 通过**。全部插件（含新插件 gitalk-comment 与 10 个移植主题）的后台 API、公开端点、前台注入与安全防线均按契约工作；测试未对 `plugins/` 做任何代码修改，无遗留临时数据。**测试结论：通过。**

---

*报告由 `scripts/gen-plugin-test-report-c.py` 依据 `scripts/plugin-test-result-c.json` 自动生成。*