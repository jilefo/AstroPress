import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function sitemapIntegration(): AstroIntegration {
  return {
    name: "astropress-sitemap",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/sitemap.xml", entrypoint: p("routes", "sitemap.xml.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/sitemap", entrypoint: p("admin", "index.astro"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
