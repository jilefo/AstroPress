import { definePlugin } from "@astropress/core";

/**
 * Theme Slot Sync — 激活主题时自动同步 header/footer 模板槽位。
 *
 * 背景：/api/themes/import 会把每个主题的模板以 conditions:["entire_site"]
 * 写入 astropress_theme_templates，并把 slots 整体覆盖为最新导入的主题。
 * 导致多主题共存时，切换激活主题后页头/页脚仍是最后导入主题的内容。
 *
 * 本插件以 post 中间件监听主题激活变化（对照 astropress_active_theme 与
 * 同步标记），把 astropress_template_slots 的各槽位切到当前主题的模板。
 * 模板与主题的关联按名称匹配（"<主题名> Header/Footer"，与 wp-themes
 * 移植包的命名约定一致），零核心修改。
 */
export default definePlugin({
  name: "theme-slot-sync",
  version: "0.1.0",
  description:
    "激活主题时自动同步 header/footer 模板槽位，修复多主题导入后页头页脚不随主题切换的问题。零核心修改。",

  register() {
    // 无注册表副作用 — 逻辑全部在 Astro 集成与中间件中。
  },
});
