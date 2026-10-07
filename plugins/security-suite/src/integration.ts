import type { AstroIntegration } from "astro";
import RateLimit from "@astropress/plugin-rate-limit/integration.admin";
import MaintenanceMode from "@astropress/plugin-maintenance-mode/integration.admin";
import TwoFactorAuth from "@astropress/plugin-two-factor-auth/integration.admin";
import UserRoles from "@astropress/plugin-user-roles/integration.admin";
import ActivityLog from "@astropress/plugin-activity-log/integration.admin";

/**
 * 安全与防护套件 — 全局限流 · 维护模式 · 操作审计 · 两步验证 · 用户角色。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [RateLimit(), MaintenanceMode(), TwoFactorAuth(), UserRoles(), ActivityLog()];
}
