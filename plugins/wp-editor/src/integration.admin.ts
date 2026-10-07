import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /api/ap-wp-editor/wp-editor.js → WordPress 风格编辑器增强脚本
 *   post 中间件把脚本注入 /admin 页面
 */
export default function wpEditorAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-wp-editor",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/api/ap-wp-editor/wp-editor.js", entrypoint: p("routes", "api", "wp-editor.js.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
