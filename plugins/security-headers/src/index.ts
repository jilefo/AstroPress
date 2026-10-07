import { definePlugin } from "@astropress/core";

/**
 * Security Headers — 安全响应头
 *
 * 功能：
 *   - 前台所有公开响应按需附加安全响应头（不读取/不修改响应体）：
 *       X-Content-Type-Options、X-Frame-Options、Referrer-Policy、
 *       Permissions-Policy、Strict-Transport-Security、Content-Security-Policy
 *   - 后台管理页可配置各项开关与取值，支持 CSP 仅报告（Report-Only）模式
 *
 * 零额外依赖，零核心修改。
 */
export default definePlugin({
  name: "security-headers",
  version: "0.1.0",
  description:
    "安全响应头：X-Content-Type-Options、X-Frame-Options、Referrer-Policy、Permissions-Policy、HSTS、内容安全策略（CSP/Report-Only）。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
