import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function errorMonitorIntegration(): AstroIntegration {
  return {
    name: "astropress-error-monitor",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/404-monitor", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/404/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/404/actions", entrypoint: p("admin", "api", "actions.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/404/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
