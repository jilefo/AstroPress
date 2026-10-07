# AstroPress v1.0.4 发布说明（V8 轮，2026-10-07）

## 亮点

### 1. Node.js + SQLite 形态对等验证
- 关键混沌组（认证 / 文章 CRUD / 评论频控 / 重定向 / 原子写）在 Node+SQLite 形态 **54/54 全绿**（`logs/v8_node_chaos_result.json`）
- D1 JSON1 原子写（`json_patch` / `json_set`）在 better-sqlite3 下行为对等，并发启停零覆盖
- 文件管理、WebDAV、Git 同步、备份等 6 个 Cloudflare 平台屏蔽插件在 Node 形态全部可用
- 平台差异显式文档化：生产形态会话 Cookie 恒带 `Secure`，必须 HTTPS 访问（见 `docs/DEPLOY-NODE.md`）；`/ap-health` 的 `storage`/`ai` 检查语义面向 Cloudflare，Node 下不可用属预期

### 2. 页面缓存 epoch 收敛收口
- 跨 isolate 缓存纪元（epoch）进程内 TTL 由 15s 收口至 **2s**：内容写操作后，全局所有 isolate 最长 **≤2s** 收敛（此前 15s）
- 实测收敛耗时 1.56s–3.06s（含轮询间隔），断言窗口 3.5s，双实例（V2 / 主站）各 7/7 通过（`logs/v8_cf_epoch_result_v2.json` / `_old.json`）
- fail-open 语义保持：纪元读取失败时全量视为有效，不产生 5xx
- Durable Object 方案经评估暂不采用：`@astrojs/cloudflare` 11.2.0 不支持自定义 DO 导出，构建链注入风险大，已留档

### 3. 开源发布工程化
- 全仓脱敏：186+ 文件明文凭据清零（测试脚本改环境变量注入），管理员凭据迁至 `.ap-data/credential.txt`（git 与发布包双排除）
- `.gitignore` 补齐：第三方参考物 / 内部工作文档 / 发布包产物不入库
- 新增 `.github/` 开源基建：CI workflow（typecheck → Node 构建 → CF 构建 → 部署脚本语法检查）、Issue 模板、PR 模板、CODEOWNERS、dependabot
- `secret-scan` 复跑零真实泄漏，打包脚本内置强制安全扫描

## 升级注意事项

- 从 v1.0.3 升级无破坏性变更；`package.json` 版本号对齐为 1.0.4
- Node.js 自托管用户请确认已按 `docs/DEPLOY-NODE.md` 配置 HTTPS，否则后台无法登录
