import { definePlugin } from "@astropress/core";

/**
 * Link Directory — 网站目录
 *
 * 功能：
 *   - 自有表 ap_link_cats / ap_links（惰性 CREATE TABLE IF NOT EXISTS，零核心修改）
 *   - 后台 /admin-ext/links：分类 CRUD + 链接 CRUD（内联编辑）+ 页面设置
 *   - 公开 SSR 页 /directory：按分类分组的卡片网格 + 客户端搜索过滤
 *   - 公开跳转 /ap-links/click?id=：仅审核通过链接可跳转，clicks +1 后 302
 *   - 后台侧边栏顶级「网站目录」菜单
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "link-directory",
  version: "0.1.0",
  description:
    "提供网站目录功能：后台分类与链接管理（内联编辑）、公开 /directory 分类卡片网格页（客户端搜索）与 /ap-links/click 跳转计数，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
