import type { AstroIntegration } from "astro";
import WebhookPublisher from "@astropress/plugin-webhook-publisher/integration.admin";
import DbConsole from "@astropress/plugin-db-console/integration.admin";
import LinkDirectory from "@astropress/plugin-link-directory/integration.admin";
import FileManager from "@astropress/plugin-file-manager/integration.admin";
import Webdav from "@astropress/plugin-webdav/integration.admin";
import DbOptimize from "@astropress/plugin-db-optimize/integration.admin";

/**
 * 运维工具箱套件 — Webhook发布 · 数据库控制台 · 网站目录 · 文件管理 · WebDAV存储 · 数据库优化。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [WebhookPublisher(), DbConsole(), LinkDirectory(), FileManager(), Webdav(), DbOptimize()];
}
