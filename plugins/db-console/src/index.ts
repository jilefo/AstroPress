import { definePlugin } from "@astropress/core";

/**
 * Database Console — Adminer 风格的 SQLite 管理器
 *
 * 危险工具：所有后台页面与 API 均要求管理员登录（locals.user），
 * 写操作（非查询 SQL）额外需要前端确认勾选 + Origin CSRF 校验。
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "Database Console",
  version: "0.1.0",
  description: "Adminer 风格的 SQLite 浏览器与 SQL 控制台",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
