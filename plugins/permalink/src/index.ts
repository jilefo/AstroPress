import { definePlugin } from "@astropress/core";

/**
 * Permalink — 固定链接美化
 *
 * 功能：
 *   - 文章无需 /blog/ 前缀即可访问：/{slug} 在页面不存在时内部重写到 /blog/{slug}
 *   - 可选把旧 /blog/{slug} 链接 301 迁移到 /{slug}（避免重复内容，利于 SEO）
 *   - 后台管理页开关 + 在线测试
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "permalink",
  version: "0.1.0",
  description:
    "文章固定链接美化：/{slug} 直达文章（内部重写，URL 不变），可选 301 迁移旧 /blog/* 链接，后台可开关。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
