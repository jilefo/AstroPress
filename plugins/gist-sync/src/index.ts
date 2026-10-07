import { definePlugin } from "@astropress/core";

/**
 * Gist Sync — 站点配置的 GitHub Gist 云端同步
 *
 * 功能：
 *   - 后台 /admin-ext/gist-sync：维护 GitHub Token / Gist ID / 文件名 / 描述
 *   - 推送：按 config-io 同款信封导出 settings/plugins/themes 配置，
 *     有 gistId 则 PATCH 更新，否则创建私密 Gist 并回写 gistId
 *   - 恢复：拉取 Gist 文件内容，走 merge 模式导入（与 config-io 相同校验）
 *   - 最近 20 条同步历史存 wp_options
 *
 * 安全约束：写操作需 confirm:true + Origin 校验；导出剥离敏感键；
 * Token 存库但页面回显掩码。零核心修改。
 */
export default definePlugin({
  name: "gist-sync",
  version: "0.1.0",
  description:
    "把站点配置同步到 GitHub Gist 做云端备份与恢复：私密 Gist 推送/拉取、敏感键剥离、同步历史记录，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
