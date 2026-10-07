import { definePlugin } from "@astropress/core";

/**
 * Customer Service — 在线客服 / 联系组件
 *
 * 功能：
 *   - 前台所有公开页面右下角（可配左下）注入浮动客服按钮
 *   - 点击弹出联系面板：QQ / 微信 / 邮箱 / 电话 / 工作时间，可复制或一键唤起
 *   - 根据工作时间文本显示在线/离线状态指示
 *   - 后台管理页配置开关、标题、联系方式、位置与主题色
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "customer-service",
  version: "0.1.0",
  description:
    "前台浮动客服按钮：弹出 QQ/微信/邮箱/电话/工作时间联系面板，支持一键唤起与复制，后台可配置位置与主题色，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
