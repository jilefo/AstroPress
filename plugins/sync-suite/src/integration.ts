import type { AstroIntegration } from "astro";
import Backup from "@astropress/plugin-backup/integration.admin";
import ConfigIo from "@astropress/plugin-config-io/integration.admin";
import GistSync from "@astropress/plugin-gist-sync/integration.admin";
import GitSync from "@astropress/plugin-git-sync/integration.admin";

/**
 * 同步与备份套件 — 备份与恢复 · 配置导入导出 · Gist配置同步 · Git同步。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [Backup(), ConfigIo(), GistSync(), GitSync()];
}
