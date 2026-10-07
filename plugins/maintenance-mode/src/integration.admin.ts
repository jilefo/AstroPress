import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function maintenanceModeIntegration(): AstroIntegration {
  return {
    name: "astropress-maintenance-mode",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/maintenance-mode", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/maintenance/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        // pre：必须先于 page-cache（post）执行，否则缓存命中会绕过维护闸门
        addMiddleware({ entrypoint: p("middleware.ts"), order: "pre" });
      },
    },
  };
}
