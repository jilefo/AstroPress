import { definePlugin } from "@astropress/core";

/**
 * Related Posts — 相关文章 / 随机推荐 / 热门文章
 *
 * 功能：
 *   - 前台单篇文章末尾自动注入相关文章、随机推荐、热门文章区块
 *   - 通过 1x1 透明图片追踪浏览量，用于热门排序
 *   - 后台管理页可配置数量、标题文案、自定义 CSS
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "related-posts",
  version: "0.1.0",
  description:
    "在文章页末尾注入相关文章、随机推荐、热门文章列表，提升 SEO 与 PV。后台可配置数量与样式，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
