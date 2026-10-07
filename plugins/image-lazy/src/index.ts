import { definePlugin } from "@astropress/core";

/**
 * Image Lazy — 图片懒加载
 *
 * 功能：
 *   - 前台所有公开 HTML 页面自动为 <img> 补充 loading="lazy" decoding="async"
 *   - 可选为 <iframe> 补充 loading="lazy"
 *   - 跳过正文前 N 张图片不处理，保护首屏 LCP 图
 *   - class 含 no-lazy 的标签跳过；已有 loading 属性不重复添加（幂等）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "image-lazy",
  version: "0.1.0",
  description:
    "图片懒加载：自动为正文 <img>/<iframe> 补充 loading=\"lazy\"，支持跳过首屏前 N 张图片保护 LCP。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
