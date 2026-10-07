import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/** Admin-side integration: slot management + stats under /admin-ext (session-protected). */
export default function adsManagerAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-ads-manager-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/ads", entrypoint: p("admin", "slots.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ads/slots", entrypoint: p("admin", "api", "slots.ts"), prerender: false });
        addMiddleware({ entrypoint: p("admin-middleware.ts"), order: "post" });
      },
    },
  };
}
