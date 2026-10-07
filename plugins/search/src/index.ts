import { definePlugin } from "@astropress/core";

/**
 * Search — 全站搜索
 *
 * 功能：
 *   - 前台 /search 公开搜索页面，按标题 / 摘要 / 内容模糊匹配已发布文章与页面
 *   - 标题命中优先排序，再按日期倒序
 *   - 后台管理页可配置每页条数、最小字符数、占位文案、是否注入前台浮动搜索按钮
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "search",
  version: "0.1.0",
  description:
    "提供全站搜索页面 /search 与前台浮动搜索按钮，支持按标题、摘要、内容模糊匹配已发布文章与页面。后台可配置分页与文案，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
