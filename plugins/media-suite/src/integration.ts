import type { AstroIntegration } from "astro";
import MediaFolders from "@astropress/plugin-media-folders/integration.admin";
import SecurityHeaders from "@astropress/plugin-security-headers/integration.admin";

/**
 * 媒体与传输安全套件 — 媒体文件夹 · 安全响应头。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [MediaFolders(), SecurityHeaders()];
}
