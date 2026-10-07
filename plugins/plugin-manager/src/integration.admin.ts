import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * 插件管理器集成：
 *   /admin-ext/plugin-manager              → 卡片式管理页
 *   /admin-ext/api/plugin-manager/state    → GET 列表 / POST 启停
 *   /admin-ext/api/plugin-manager/purge    → POST 清除数据
 *   pre 中间件：被禁插件路由 404
 *   post 中间件：后台侧边栏注入 + 被禁插件脚本/菜单剥离；前台隐藏残留节点
 */
export default function pluginManagerIntegration(): AstroIntegration {
  return {
    name: "astropress-plugin-manager",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/plugin-manager", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/plugin-manager/state", entrypoint: p("admin", "api", "state.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/plugin-manager/purge", entrypoint: p("admin", "api", "purge.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-guard.ts"), order: "pre" });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware-web.ts"), order: "post" });
      },
    },
  }
}
