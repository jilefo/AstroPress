import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration: management UI + admin APIs under /admin-ext/*,
 * which is automatically session-protected by apps/admin middleware
 * (pathname.startsWith("/admin")). No core file modified.
 */
export default function multilingualAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-multilingual-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/multilingual", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ml/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ml/strings", entrypoint: p("admin", "api", "strings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ml/links", entrypoint: p("admin", "api", "links.ts"), prerender: false });
        injectRoute({ pattern: "/ml-asset/panel.js", entrypoint: p("routes", "panel.js.ts"), prerender: false });
        addMiddleware({ entrypoint: p("admin-middleware.ts"), order: "post" });
      },
    },
  };
}
