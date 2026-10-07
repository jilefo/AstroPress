import type { AstroIntegration } from "astro";
import AdsManagerWeb from "@astropress/plugin-ads-manager/integration";
import AdsManagerAdmin from "@astropress/plugin-ads-manager/integration.admin";
import Comments from "@astropress/plugin-comments/integration.admin";
import Share from "@astropress/plugin-share/integration.admin";
import CustomerService from "@astropress/plugin-customer-service/integration.admin";
import Footer from "@astropress/plugin-footer/integration.admin";
import Donation from "@astropress/plugin-donation/integration.admin";
import GitalkComment from "@astropress/plugin-gitalk-comment/integration.admin";

/**
 * 站点互动与营销套件 — 广告管理 · 评论 · 社交分享 · 在线客服 · 页脚设置 · 文章打赏 · Gitalk评论。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [AdsManagerWeb(), AdsManagerAdmin(), Comments(), Share(), CustomerService(), Footer(), Donation(), GitalkComment()];
}
