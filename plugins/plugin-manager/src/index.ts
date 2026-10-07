import { definePlugin } from "@astropress/core";

/**
 * Plugin Manager — 插件管理器
 *
 * 卡片式插件管理页：列出全部插件（名称/版本/描述/状态），支持运行时
 * 启用/禁用与数据清除。禁用通过三条链路生效：
 *   1. pre 中间件对被禁插件的路由前缀一律 404；
 *   2. 后台 post 中间件剥离被禁插件注入的 <script>/<link> 与侧边栏入口；
 *   3. 前台 post 中间件注入 CSS 隐藏被禁插件的前台残留节点。
 * 状态存 wp_options.astropress_plugin_states，零核心修改。
 */
export default definePlugin({
  name: "plugin-manager",
  version: "0.1.0",
  description: "卡片式插件管理器：查看全部插件、运行时启用/禁用、清除插件数据。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
