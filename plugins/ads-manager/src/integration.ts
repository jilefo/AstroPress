import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/** Web-side integration: tracking API + loader script + rendering middleware. */
export default function adsManagerIntegration(): AstroIntegration {
  return {
    name: "astropress-ads-manager",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // Public endpoints deliberately live OUTSIDE /api/* — the stock admin
        // middleware requires a session for every /api path, which would put
        // the ad loader/tracker behind the login wall for anonymous visitors.
        injectRoute({ pattern: "/ap-ads/track", entrypoint: p("routes", "api", "track.ts"), prerender: false });
        injectRoute({ pattern: "/ap-ads/loader.js", entrypoint: p("routes", "api", "loader.js.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
