import { definePlugin } from "@astropress/core";

/**
 * Donation — 文章打赏 / 赞赏
 *
 * 功能：
 *   - 前台单篇文章末尾自动注入"☕ 打赏支持"按钮
 *   - 点击弹出模态框，并排展示微信与支付宝收款二维码
 *   - 后台管理页可配置按钮文案、标题、说明与二维码图片地址
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "donation",
  version: "0.1.0",
  description:
    "在文章页末尾注入打赏按钮，点击弹出微信/支付宝收款二维码弹窗。后台可配置文案与二维码图片，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
