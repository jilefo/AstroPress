import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function customerServiceIntegration(): AstroIntegration {
  return {
    name: "astropress-customer-service",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/customer-service", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/customer-service/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
