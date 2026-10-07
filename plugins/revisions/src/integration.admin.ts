import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function revisionsIntegration(): AstroIntegration {
  return {
    name: "astropress-revisions",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/revisions", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/revisions/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/revisions/read", entrypoint: p("admin", "api", "read.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/revisions/restore", entrypoint: p("admin", "api", "restore.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
