import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration: hardened upload endpoints + the editor enhancement
 * script (served via /api/ap-media/editor-upload.js and injected by the
 * plugin's post middleware). The script activates only around
 * `.ap-wysiwyg-editor` — no editor source file is modified.
 */
export default function editorUploadAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-editor-upload",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/api/ap-media/upload", entrypoint: p("routes", "api", "upload.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-media/[id]/meta", entrypoint: p("routes", "api", "meta.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-media/editor-upload.js", entrypoint: p("routes", "api", "editor-upload.js.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
