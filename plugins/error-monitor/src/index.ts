import { definePlugin } from "@astropress/core";

/**
 * Error Monitor — 404 监控
 *
 * 功能：
 *   - 前台中间件自动记录匿名访客遇到的 404 页面（路径、Referer、次数、首次/最近时间）
 *   - 可配置忽略规则（子串匹配）、是否记录静态资源 404
 *   - 后台 /admin-ext/404-monitor 查看记录，支持单条删除与一键清空
 *
 * 监控逻辑全部 try/catch 兜底，绝不影响正常响应。零核心修改。
 */
export default definePlugin({
  name: "error-monitor",
  version: "0.1.0",
  description:
    "404 监控：自动记录匿名访客访问的 404 页面、来源与命中次数，支持忽略规则与后台查看清理。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
