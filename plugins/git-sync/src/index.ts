import { definePlugin } from "@astropress/core";

/**
 * Git Sync — 云端容灾备份
 *
 * 不依赖本机 git 命令行，通过各 Git 托管平台的 REST API（Contents API）
 * 把站点数据推送到远端仓库：
 *   - GitHub / Gitee：各自官方 Contents API
 *   - Gitea 系通用驱动（自建 Gitea、GitCode、AtomGit、GitLink）：Gitea API v1
 *   - cnb.cool / Codeup：公开 API 语义差异大，驱动为友好错误 stub
 *
 * 同步范围（后台勾选，存 wp_options）：
 *   - db-dump：local.db 的 SQL 逻辑转储
 *   - config-json：站点配置导出（剥离敏感键）
 *   - media：媒体库小文件逐个 PUT（>10MB 跳过，单次最多 50 个）
 *
 * 所有 API 端点要求管理员登录 + Origin CSRF 校验，写操作要求 confirm:true。
 * 零核心修改。
 */
export default definePlugin({
  name: "git-sync",
  version: "0.1.0",
  description:
    "通过 GitHub/Gitee/Gitea 系平台 REST API 将数据库转储、站点配置与媒体文件同步到远端仓库（云端容灾备份），无需本机 git，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
