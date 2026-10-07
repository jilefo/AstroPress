import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function pageCacheIntegration(): AstroIntegration {
  return {
    name: "astropress-page-cache",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/page-cache", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/page-cache/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/page-cache/stats", entrypoint: p("admin", "api", "stats.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/page-cache/purge", entrypoint: p("admin", "api", "purge.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
