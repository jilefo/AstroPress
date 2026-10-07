import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /api/ap-autofill/script.js  → client script injected on edit pages
 *   /api/ap-autofill/generate   → AI generation endpoint
 * plus a "post" middleware injecting the script into edit pages.
 */
export default function aiAutofillIntegration(): AstroIntegration {
  return {
    name: "astropress-ai-autofill-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/api/ap-autofill/script.js", entrypoint: p("routes", "api", "script.js.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-autofill/generate", entrypoint: p("routes", "api", "generate.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-autofill/write", entrypoint: p("routes", "api", "write.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
