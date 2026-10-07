import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function activityLogIntegration(): AstroIntegration {
  return {
    name: "astropress-activity-log",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/activity-log", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/activity-log/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/activity-log/clear", entrypoint: p("admin", "api", "clear.ts"), prerender: false });
        // 后台中间件：写操作审计 + 侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
