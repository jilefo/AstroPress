import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function searchIntegration(): AstroIntegration {
  return {
    name: "astropress-search",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 前台公开搜索页
        injectRoute({ pattern: "/search", entrypoint: p("routes", "search.astro"), prerender: false });
        // 后台设置页
        injectRoute({ pattern: "/admin-ext/search", entrypoint: p("admin", "index.astro"), prerender: false });
        // 设置读写 API
        injectRoute({ pattern: "/admin-ext/api/search/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        // 前台浮动搜索按钮注入
        addMiddleware({ entrypoint: p("middleware-web.ts"), order: "post" });
      },
    },
  };
}
