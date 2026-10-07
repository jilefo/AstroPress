import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /api/ap-i18n/script.js    → client engine (dictionary + config embedded)
 *   /api/ap-i18n/translate    → login-protected proxy to the n8n webhook
 *   /admin-ext/i18n           → management page (session-protected)
 *   /admin-ext/api/i18n/*     → settings + webhook test
 * plus a "post" middleware injecting the script tag into /admin pages.
 */
export default function adminI18nIntegration(): AstroIntegration {
  return {
    name: "astropress-admin-i18n-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/api/ap-i18n/script.js", entrypoint: p("routes", "api", "script.js.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-i18n/translate", entrypoint: p("routes", "api", "translate.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/i18n", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/i18n/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/i18n/test", entrypoint: p("admin", "api", "test.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
