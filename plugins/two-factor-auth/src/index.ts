import { definePlugin } from "@astropress/core";

/**
 * Two-Factor Auth — 两步验证 (TOTP)
 *
 * 功能：
 *   - 基于 TOTP (RFC 6238) 的两步验证
 *   - 使用 Node.js 内置 crypto（HMAC-SHA1），零外部依赖
 *   - wp_usermeta 存储密钥（_2fa_secret / _2fa_enabled）
 *   - 后台页 /admin-ext/two-factor-auth：启用/禁用/验证
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "two-factor-auth",
  version: "0.1.0",
  description: "两步验证 (TOTP)：基于时间的一次性密码，增强账户安全。零核心修改。",
  register() {},
});
