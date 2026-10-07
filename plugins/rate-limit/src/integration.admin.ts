import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function rateLimitIntegration(): AstroIntegration {
  return {
    name: "astropress-rate-limit",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/rate-limit", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/rate-limit/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/rate-limit/stats", entrypoint: p("admin", "api", "stats.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/rate-limit/reset", entrypoint: p("admin", "api", "reset.ts"), prerender: false });
        // 前台令牌桶限流中间件
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
