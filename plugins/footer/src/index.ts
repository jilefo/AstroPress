import { definePlugin } from "@astropress/core";

/**
 * Footer — 网站页脚设置
 *
 * 功能：
 *   - 前台所有公开页面自动注入可配置页脚（版权、ICP备案、公安备案、自定义链接、Powered by 徽标）
 *   - 后台管理页可配置所有内容，支持自定义 HTML 片段
 *   - 自定义 HTML 自动 XSS 过滤（script/iframe/on* 事件属性）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "footer",
  version: "0.1.0",
  description:
    "网站页脚设置：ICP备案号、公安备案号、版权信息、自定义链接、Powered by AstroPress 徽标。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
