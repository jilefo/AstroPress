import { definePlugin } from "@astropress/core";

/**
 * Config I/O — 配置导入导出
 *
 * 功能：
 *   - 后台 /admin-ext/config-io：勾选导出站点设置 / 插件设置 / 主题配置 / 内容数据（JSON）
 *   - 导入支持 merge（按主键 upsert）与 replace（options 仅清该 section 范围；
 *     content 在事务中清空五张内容表后批量插入）两种模式，返回计数摘要
 *   - 严格信封校验、section 白名单、敏感选项键排除、所有写入值 drizzle sql 参数化
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "config-io",
  version: "0.1.0",
  description:
    "提供站点配置 JSON 导入导出：站点设置、插件设置、主题配置与内容数据（wp_posts 等五表），支持 merge/replace 导入与计数摘要，零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
