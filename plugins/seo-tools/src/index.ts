import { definePlugin } from "@astropress/core";

/**
 * SEO Tools — RSS 订阅与 robots.txt
 *
 * 功能：
 *   - 提供 RSS 2.0 订阅源（/rss.xml），可配置文章数量、标题、描述
 *   - 提供 robots.txt，可附加自定义规则，自动包含 Sitemap 链接
 *   - 后台管理页配置所有选项
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "seo-tools",
  version: "0.1.0",
  description:
    "提供 RSS 2.0 订阅源和 robots.txt 管理，后台可配置订阅数量、标题、描述及 robots 扩展规则，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
