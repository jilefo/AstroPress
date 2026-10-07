import { definePlugin } from "@astropress/core";

/**
 * Maintenance Mode — 维护模式
 *
 * 功能：
 *   - 开启后，未登录访客的 GET 请求一律返回 503 + Retry-After: 300 + 内联样式维护页
 *   - 已登录（auth_session cookie）、/admin、/login、/api/、/admin-ext、/ap-、
 *     /_astro、/media、常见静态扩展名 一律放行
 *   - 支持自定义标题 / 正文 / 预计恢复时间，以及 IP 白名单（每行一个）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "maintenance-mode",
  version: "0.1.0",
  description:
    "维护模式：一键对未登录访客切换 503 维护页（Retry-After + 内联样式页面），支持自定义文案、预计恢复时间与 IP 白名单。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
