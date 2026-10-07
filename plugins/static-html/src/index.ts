import { definePlugin } from "@astropress/core";

/**
 * Static HTML — 静态 HTML 生成（类似 WordPress 的静态化插件）
 *
 * 功能：
 *   - 一键把全站 SSR 页面（首页 / 文章 / 页面）抓取落盘为静态 HTML
 *   - 可选抓取页面引用的同源静态资源（/_astro/*、/media/* 等）
 *   - 每次生成最后统一输出 sitemap.xml 与 rss.xml（同一数据快照，时序一致）
 *   - 支持定时计划：每小时 / 每天定点 / 每周定点（WP-Cron 风格：站点有访问时检查）
 *   - 生成历史（最近 20 次）与实时状态查询
 *
 * 零核心修改；设置与状态存 wp_options。
 */
export default definePlugin({
  name: "static-html",
  version: "0.1.0",
  description:
    "静态 HTML 生成：手动/定时抓取全站页面落盘，自动生成 sitemap.xml 与 rss.xml，可下载部署到任意静态空间。",
  register() {},
});
