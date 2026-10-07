import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /admin-ext/webhooks              → management page (API keys + logs)
 *   /admin-ext/api/webhook/keys      → CRUD for API keys
 *   /admin-ext/api/webhook/logs      → recent webhook call logs
 *   /ap-webhook/publish              → POST publish content (key auth)
 *   /ap-webhook/delete               → POST delete content (key auth)
 *   /ap-webhook/status               → GET status (key auth)
 *
 * Note: public endpoints live outside /api/* because the core middleware
 * requires a login session for every /api/* route.
 */
export default function webhookPublisherIntegration(): AstroIntegration {
  return {
    name: "astropress-webhook-publisher-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/webhooks", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/webhook/keys", entrypoint: p("admin", "api", "keys.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/webhook/logs", entrypoint: p("admin", "api", "logs.ts"), prerender: false });
        injectRoute({ pattern: "/ap-webhook/publish", entrypoint: p("webhook", "api", "publish.ts"), prerender: false });
        injectRoute({ pattern: "/ap-webhook/delete", entrypoint: p("webhook", "api", "delete.ts"), prerender: false });
        injectRoute({ pattern: "/ap-webhook/status", entrypoint: p("webhook", "api", "status.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
