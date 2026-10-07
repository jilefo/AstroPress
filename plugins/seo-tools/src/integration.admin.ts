import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function seoToolsIntegration(): AstroIntegration {
  return {
    name: "astropress-seo-tools",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/seo-tools", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/seo-tools/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        injectRoute({ pattern: "/rss.xml", entrypoint: p("routes", "rss.xml.ts"), prerender: false });
        injectRoute({ pattern: "/robots.txt", entrypoint: p("routes", "robots.txt.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
