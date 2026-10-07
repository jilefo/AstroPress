import { definePlugin } from "@astropress/core";

/**
 * Rate Limit — 全局限流
 *
 * 功能：
 *   - 前台中间件对配置的规则做 IP 令牌桶限流（进程内 Map：key = IP + 规则名，按窗口补充令牌）
 *   - 默认规则：/api/auth/login 5 次/分(POST)、/api/forms/submit 10 次/分(POST)、
 *     /search 30 次/分、/ap-related/track 60 次/分、/ap-comments 5 次/分(POST)
 *   - 命中上限返回 429 + Retry-After：API 路径返回 JSON，页面路径返回简洁 HTML
 *   - 内存保护：桶 Map 超 10 万 key 时惰性清理过期桶
 *   - 后台 /admin-ext/rate-limit 管理规则、查看活跃桶数与命中计数、一键清空
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "rate-limit",
  version: "0.1.0",
  description:
    "全局限流：公开端点统一 IP 令牌桶限流，规则可增删改，429 + Retry-After，后台可查看命中计数与清空状态。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
