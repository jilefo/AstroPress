import { definePlugin } from "@astropress/core";

/**
 * WP Editor — WordPress-style editor enhancement (visual language inspired
 * by the WordPress classic editor + block inserter; no Gutenberg/React
 * dependency, no WordPress copyrighted code bundled).
 *
 * 区块/样式下拉、加粗斜体下划线删除线、列表、引用、代码块、对齐、
 * 链接、分隔线、清除格式、全屏专注模式、字数统计 —— 全部基于
 * contentEditable + execCommand，以注入脚本工作，核心编辑器零改动。
 */
export default definePlugin({
  name: "wp-editor",
  version: "0.1.0",
  description:
    "WordPress-style editor toolbar: block/style dropdowns, inline formatting, lists, quote, code block, alignment, link, hr, clear formatting, distraction-free fullscreen, word count. Zero core modification.",
  register() {
    // Wiring is done by ./integration.admin (script route + post middleware).
  },
});
