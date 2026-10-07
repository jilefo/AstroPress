import type { AstroIntegration } from "astro";
import PageCache from "@astropress/plugin-page-cache/integration.admin";
import ImageLazy from "@astropress/plugin-image-lazy/integration.admin";
import HtmlOpt from "@astropress/plugin-html-opt/integration.admin";
import AssetCache from "@astropress/plugin-asset-cache/integration.admin";
import Sitemap from "@astropress/plugin-sitemap/integration.admin";
import StaticHtml from "@astropress/plugin-static-html/integration.admin";
import ErrorMonitor from "@astropress/plugin-error-monitor/integration.admin";
import CacheWarmer from "@astropress/plugin-cache-warmer/integration.admin";

/**
 * 缓存与性能优化套件 — 页面缓存 · 图片懒加载 · HTML优化 · 静态资源缓存 · 网站地图 · 静态HTML生成 · 404监控 · 缓存预热。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [PageCache(), ImageLazy(), HtmlOpt(), AssetCache(), Sitemap(), StaticHtml(), ErrorMonitor(), CacheWarmer()];
}
