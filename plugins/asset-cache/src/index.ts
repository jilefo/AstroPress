import { definePlugin } from "@astropress/core";

/**
 * Asset Cache — 静态资源 HTTP 缓存头
 *
 * 功能：
 *   - /_astro/*（Vite 构建哈希资产）→ public, max-age=31536000, immutable（可配）
 *   - /media/*（媒体库）→ public, max-age=604800（7 天，可配）
 *   - 常见静态扩展名（css/js/woff/woff2/ttf/otf/png/jpg/jpeg/gif/svg/webp/ico/avif/mp4/mp3）
 *     → public, max-age=86400（1 天，可配）
 *   - 附加自定义扩展名 → max-age 映射
 *   - 只改响应头、不读响应体；text/html 一律不处理
 *   - 尊重上游已有的非默认 Cache-Control（可开「强制覆盖」）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "asset-cache",
  version: "0.1.0",
  description:
    "静态资源缓存头：为 /_astro、/media 及常见静态扩展名响应设置 Cache-Control 强缓存，支持三档 max-age、强制覆盖与自定义扩展名映射。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
