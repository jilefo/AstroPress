import type { AstroIntegration } from "astro";
import MultilingualWeb from "@astropress/plugin-multilingual/integration";
import MultilingualAdmin from "@astropress/plugin-multilingual/integration.admin";
import AdminI18n from "@astropress/plugin-admin-i18n/integration.admin";
import AiChat from "@astropress/plugin-ai-chat/integration.admin";
import AiAutofill from "@astropress/plugin-ai-autofill/integration.admin";

/**
 * AI 与多语言套件 — 多语言 · 界面翻译 · AI 助手 · AI 自动填写。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [MultilingualWeb(), MultilingualAdmin(), AdminI18n(), AiChat(), AiAutofill()];
}
