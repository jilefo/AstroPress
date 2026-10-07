import { definePlugin } from "@astropress/core";

/**
 * HTML 优化（html-opt）
 *
 * 功能：
 *   - 移除 HTML 注释（保留条件注释、"<! " 开头的特殊声明注释、noindex SEO 指令注释）
 *   - 折叠标签之间含换行的空白（不折叠同一行内空白，保护 inline 元素间距）
 *   - 在 </head> 前注入 dns-prefetch / preconnect 资源提示
 *   - <script>/<style>/<pre>/<textarea> 内容全程受保护，不做任何修改
 *
 * 零核心修改，零额外依赖。
 */
export default definePlugin({
  name: "html-opt",
  version: "0.1.0",
  description:
    "HTML 优化：移除 HTML 注释、折叠标签间换行空白、注入 dns-prefetch/preconnect 资源提示。零核心修改，零额外依赖。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
