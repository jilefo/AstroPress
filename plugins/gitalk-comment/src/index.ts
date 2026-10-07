import { definePlugin } from "@astropress/core";

/**
 * Gitalk Comment — 基于 GitHub Issue 的评论
 *
 * 功能：
 *   - 文章页（/blog/{slug}）末尾注入 Gitalk 评论组件（CDN 加载，评论存于 GitHub Issue）
 *   - 后台 /admin-ext/gitalk 配置 GitHub OAuth App（clientID/clientSecret）、
 *     仓库（owner/repo）、管理员列表、语言、分页、代理等
 *   - 未配置完整（clientID/repo/owner 任一为空）时前台不注入
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "gitalk-comment",
  version: "0.1.0",
  description:
    "基于 GitHub Issue 的 Gitalk 评论组件：文章页自动注入，后台可配置 OAuth App、仓库、管理员、语言与代理，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
