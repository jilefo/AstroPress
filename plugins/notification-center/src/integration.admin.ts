import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function notificationCenterIntegration(): AstroIntegration {
  return {
    name: "astropress-notification-center",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/notification-center", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/read", entrypoint: p("admin", "api", "read.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/read-all", entrypoint: p("admin", "api", "read-all.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/delete", entrypoint: p("admin", "api", "delete.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/notifications/unread-count", entrypoint: p("admin", "api", "unread-count.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
