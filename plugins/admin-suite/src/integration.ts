import type { AstroIntegration } from "astro";
import DashboardWidgets from "@astropress/plugin-dashboard-widgets/integration.admin";
import NotificationCenter from "@astropress/plugin-notification-center/integration.admin";
import ThemeSlotSync from "@astropress/plugin-theme-slot-sync/integration.admin";

/**
 * 后台增强套件 — 仪表盘增强 · 通知中心 · 主题槽位同步。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [DashboardWidgets(), NotificationCenter(), ThemeSlotSync()];
}
