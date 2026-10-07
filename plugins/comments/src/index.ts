import { definePlugin } from "@astropress/core";

/**
 * Comments — 前台评论与后台审核
 *
 * 功能：
 *   - 文章页（/blog/{slug}）末尾注入评论列表与评论表单（主题隔离样式）
 *   - 公开提交端点 POST /ap-comments/submit（JSON / 表单编码、蜜罐、频控、参数校验）
 *   - 插件自有 SQLite 表 ap_comments，首次访问惰性建表，零核心 schema 修改
 *   - 后台 /admin-ext/comments 审核：待审核/已批准/垃圾/回收站、批量操作、回复、设置
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "Comments",
  version: "0.1.0",
  description: "前台评论与后台审核",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
