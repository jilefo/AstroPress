import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration for Image Mirror:
 *
 *  - serves the editor enhancement script at /api/ap-mirror/image-mirror.js
 *    (injected into admin HTML pages, it refreshes the editor after a save so
 *    mirrored <img src> values are visible without reloading);
 *  - adds a "post" middleware that intercepts POST /api/posts and
 *    PUT /api/posts/:id, mirrors remote images after the stock handler saves,
 *    and reports counts back via response headers.
 */
export default function imageMirrorAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-image-mirror",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({
          pattern: "/api/ap-mirror/image-mirror.js",
          entrypoint: p("routes", "api", "image-mirror.js.ts"),
          prerender: false,
        });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
