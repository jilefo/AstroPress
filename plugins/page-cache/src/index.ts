import { definePlugin } from "@astropress/core";

/**
 * Page Cache — 页面缓存
 *
 * 功能：
 *   - 前台公开 GET 页面全页 HTML 内存缓存（类似 WP Super Cache）
 *   - 可配置 TTL、最大条目数（LRU 淘汰）、是否缓存 404、是否允许带 query 缓存、排除路径
 *   - /api/ 与 /admin-ext/api/ 的非 GET 写操作成功后自动清空全部缓存（写后失效）
 *   - 登录态（auth_session cookie）自动旁路，不缓存
 *   - 后台管理页支持查看命中统计与手动清空缓存
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "page-cache",
  version: "0.1.0",
  description:
    "页面缓存：全页 HTML 内存缓存（类似 WP Super Cache），可配置 TTL、最大条目、404 缓存、排除路径，支持手动清空与命中统计。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
