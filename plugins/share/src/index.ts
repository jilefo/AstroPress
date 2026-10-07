import { definePlugin } from "@astropress/core";

/**
 * Share — 文章社交分享
 *
 * 功能：
 *   - 前台单篇文章注入社交分享按钮（微信/微博/QQ/知乎/Twitter/Facebook/LinkedIn/Telegram/WhatsApp/复制链接）
 *   - 注入位置可选：文章前 / 文章后 / 前后都显示
 *   - 后台管理页可开关各平台、自定义标题文案
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "share",
  version: "0.1.0",
  description:
    "在文章页注入社交分享按钮（微信、微博、QQ、知乎、Twitter/X、Facebook、LinkedIn、Telegram、WhatsApp、复制链接），后台可配置平台与注入位置，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
