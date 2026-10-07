import { definePlugin } from "@astropress/core";

/**
 * Cache Warmer — 缓存预热
 *
 * 功能：
 *   - 手动「立即预热」+ 可选定时预热（每 1/6/24 小时，进程内 setInterval）
 *   - URL 来源：站点首页 / + /sitemap.xml 解析 <loc> 前 N 个（默认 50，单批上限 200）
 *   - 串行抓取、间隔 300ms、单请求超时 10s、运行互斥（同一时间仅一批）
 *   - 内存保留最近 10 批记录（时间/触发/总数/成功/失败/耗时）
 *   - 无前台中间件；后台页 /admin-ext/cache-warmer
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "cache-warmer",
  version: "0.1.0",
  description:
    "缓存预热：手动/定时主动抓取首页与 sitemap 前 N 个 URL 填充 page-cache，串行 + 互斥 + 超时保护，后台可配置基址/数量/间隔并查看批次记录。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
