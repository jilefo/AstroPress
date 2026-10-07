import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function staticHtmlIntegration(): AstroIntegration {
  return {
    name: "astropress-static-html",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/static-html", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/static-html/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/static-html/generate", entrypoint: p("admin", "api", "generate.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/static-html/status", entrypoint: p("admin", "api", "status.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
