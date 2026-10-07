import type { AstroIntegration } from "astro";
import RelatedPosts from "@astropress/plugin-related-posts/integration.admin";
import SeoTools from "@astropress/plugin-seo-tools/integration.admin";
import Search from "@astropress/plugin-search/integration.admin";
import Redirect from "@astropress/plugin-redirect/integration.admin";
import Permalink from "@astropress/plugin-permalink/integration.admin";
import Revisions from "@astropress/plugin-revisions/integration.admin";

/**
 * SEO 与内容套件 — 相关文章 · SEO工具 · 全站搜索 · 重定向 · 固定链接 · 版本历史。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [RelatedPosts(), SeoTools(), Search(), Redirect(), Permalink(), Revisions()];
}
