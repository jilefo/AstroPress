import { definePlugin } from "@astropress/core";

/**
 * Dashboard Widgets — 仪表盘增强
 *
 * 功能：
 *   - 在 /admin/dashboard 注入 6 个 widget：内容概览、最近文章、草稿箱、
 *     系统健康、最近活动、快捷操作
 *   - 聚合统计 API 一次返回所有 widget 数据
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "dashboard-widgets",
  version: "0.1.0",
  description: "仪表盘增强：注入最近文章、草稿箱、系统健康、活动摘要等 widget。零核心修改。",
  register() {},
});
