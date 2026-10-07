import { definePlugin } from "@astropress/core";

/**
 * Sitemap — XML 站点地图
 *
 * 功能：
 *   - 输出 /sitemap.xml（文章 / 页面 / 首页，含 lastmod 与优先级）
 *   - 后台可开关、设置文章数量上限与更新频率提示
 *   - robots.txt 中可由 seo-tools 引用（Sitemap: /sitemap.xml）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "sitemap",
  version: "0.1.0",
  description: "XML 站点地图：/sitemap.xml 输出已发布文章与页面（含 lastmod/changefreq/priority），后台可开关与限量。",
  register() {},
});
