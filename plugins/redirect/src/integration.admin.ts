import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function redirectIntegration(): AstroIntegration {
  return {
    name: "astropress-redirect",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/redirects", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/redirects", entrypoint: p("admin", "api", "redirects.ts"), prerender: false });
        // post 中间件：核心中间件先注入 locals.db，仍在路由 handler 前拦截重定向
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
        // post 中间件：后台侧边栏注入菜单入口
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
