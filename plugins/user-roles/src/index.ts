import { definePlugin } from "@astropress/core";

/**
 * User Roles — 用户角色权限执行
 *
 * 功能：
 *   - 后台中间件按 WP 五级角色（administrator/editor/author/contributor/subscriber）
 *     的能力矩阵拦截无权限的后台页面与 API 访问
 *   - 无权限返回 403 + 友好提示页
 *   - 后台 /admin-ext/user-roles 展示能力矩阵（只读可视化）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "user-roles",
  version: "0.1.0",
  description:
    "用户角色权限执行：基于 WP 五级角色的能力矩阵中间件，拦截无权限的后台页面与 API 访问。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
