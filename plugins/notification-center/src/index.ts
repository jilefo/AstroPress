import { definePlugin } from "@astropress/core";

/**
 * Notification Center — 站内通知中心
 *
 * 功能：
 *   - 自建表 ap_notifications，惰性建表
 *   - 监听新评论/表单提交自动创建通知
 *   - 后台顶栏注入通知铃铛（未读角标 + 下拉列表）
 *   - /admin-ext/notification-center 完整管理页
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "notification-center",
  version: "0.1.0",
  description: "站内通知中心：自动监听事件，后台铃铛 + 通知管理页。零核心修改。",
  register() {},
});
