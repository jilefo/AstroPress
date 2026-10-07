import { definePlugin } from "@astropress/core";

/**
 * Redirect — 301/302 重定向管理
 *
 * 功能：
 *   - 前台 pre 中间件按规则返回 301/302 重定向
 *   - 支持精确匹配与 /* 结尾的通配前缀匹配
 *   - 后台管理页维护规则（新增 / 启停 / 删除），并统计命中次数
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "redirect",
  version: "0.1.0",
  description:
    "提供 301/302 重定向管理：支持精确与通配规则、命中统计、后台可视化维护，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
