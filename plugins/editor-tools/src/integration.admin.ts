import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /api/ap-etools/tools.js  → toolbar enhancement script (排版 / 互译)
 *   /api/ap-etools/translate → login-protected proxy to the configured
 *                              AI provider for content translation
 * plus a "post" middleware injecting the script tag into /admin pages.
 */
export default function editorToolsAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-editor-tools-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/api/ap-etools/tools.js", entrypoint: p("routes", "api", "tools.js.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-etools/translate", entrypoint: p("routes", "api", "translate.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
