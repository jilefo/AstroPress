import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function mediaFoldersIntegration(): AstroIntegration {
  return {
    name: "astropress-media-folders",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/media-folders", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/create", entrypoint: p("admin", "api", "create.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/rename", entrypoint: p("admin", "api", "rename.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/delete", entrypoint: p("admin", "api", "delete.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/media-folders/move", entrypoint: p("admin", "api", "move.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
