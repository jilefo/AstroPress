import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function cacheWarmerIntegration(): AstroIntegration {
  return {
    name: "astropress-cache-warmer",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/cache-warmer", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/cache-warmer/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/cache-warmer/run", entrypoint: p("admin", "api", "run.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/cache-warmer/status", entrypoint: p("admin", "api", "status.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
