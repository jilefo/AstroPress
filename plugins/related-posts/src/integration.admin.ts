import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function relatedPostsIntegration(): AstroIntegration {
  return {
    name: "astropress-related-posts",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/related-posts", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/related-posts/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/ap-related/track", entrypoint: p("routes", "api", "track.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
